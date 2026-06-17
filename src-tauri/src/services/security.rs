use crate::error::{AppError, AppResult};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use once_cell::sync::OnceCell;
use rand::RngCore;
use serde_json::{Map, Value};
use std::collections::HashSet;

const KEYRING_SERVICE: &str = "TaseDeck";
const KEYRING_USER: &str = "master_encryption_key";
const ENCRYPTED_PREFIX: &str = "enc$";
const ENV_VARIABLES_KEY: &str = "__envVariables";
pub const OAUTH_REFRESH_TOKEN_KEY: &str = "__oauthRefreshToken";
pub const OAUTH_API_KEY_KEY: &str = "__oauthApiKey";
pub const OAUTH_CLIENT_ID_KEY: &str = "__oauthClientId";

static MASTER_KEY: OnceCell<[u8; 32]> = OnceCell::new();

/// Ensures the master key exists in the OS keyring (created on first call).
pub fn ensure_initialized() -> AppResult<()> {
    let _ = master_key_bytes()?;
    Ok(())
}

pub fn mask_secret(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 6 {
        let head: String = chars.iter().take(3).collect();
        return format!("{head}...");
    }
    let head: String = chars.iter().take(3).collect();
    let tail: String = chars
        .iter()
        .skip(chars.len().saturating_sub(3))
        .collect();
    format!("{head}...{tail}")
}

pub fn looks_masked(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && !is_encrypted(trimmed)
        && trimmed.contains("...")
}

pub fn encrypt_string(plaintext: &str) -> AppResult<String> {
    let key = master_key_bytes()?;
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|error| AppError::Message(format!("invalid encryption key: {error}")))?;

    let mut nonce_bytes = [0_u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|error| AppError::Message(format!("encryption failed: {error}")))?;

    let mut payload = nonce_bytes.to_vec();
    payload.extend_from_slice(&ciphertext);
    Ok(format!("{ENCRYPTED_PREFIX}{}", B64.encode(payload)))
}

pub fn decrypt_string(payload: &str) -> AppResult<String> {
    let trimmed = payload.trim();
    if !is_encrypted(trimmed) {
        return Ok(trimmed.to_string());
    }

    let encoded = trimmed
        .strip_prefix(ENCRYPTED_PREFIX)
        .ok_or_else(|| AppError::Message("invalid encrypted payload".to_string()))?;
    let bytes = B64
        .decode(encoded)
        .map_err(|error| AppError::Message(format!("invalid encrypted payload: {error}")))?;
    if bytes.len() < 13 {
        return Err(AppError::Message("encrypted payload is too short".to_string()));
    }

    let (nonce_bytes, ciphertext) = bytes.split_at(12);
    let key = master_key_bytes()?;
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|error| AppError::Message(format!("invalid encryption key: {error}")))?;

    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|error| AppError::Message(format!("decryption failed: {error}")))?;

    String::from_utf8(plaintext)
        .map_err(|error| AppError::Message(format!("decrypted payload is not UTF-8: {error}")))
}

/// Persist secrets encrypted in `config_values` JSON.
pub fn seal_config_values_for_storage(incoming: &str, existing: Option<&str>) -> AppResult<String> {
    ensure_initialized()?;
    let mut map = parse_values_object(incoming)?;
    let existing_map = existing
        .filter(|raw| !raw.trim().is_empty())
        .map(parse_values_object)
        .transpose()?;

    if let Some(env_value) = map.get_mut(ENV_VARIABLES_KEY) {
        seal_env_variables_value(env_value, existing_map.as_ref())?;
    }

    let env_names = env_names_from_value(map.get(ENV_VARIABLES_KEY));
    for key in collect_secret_keys(&map, &env_names) {
        let incoming_value = map
            .get(&key)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let existing_value = existing_map
            .as_ref()
            .and_then(|existing| existing.get(&key));
        let sealed = seal_one_secret(&incoming_value, existing_value)?;
        map.insert(key, Value::String(sealed));
    }

    serde_json::to_string(&map).map_err(|error| AppError::Message(format!("invalid config_values: {error}")))
}

/// Values for the UI: secrets are masked (`abc...xyz`), never plaintext.
pub fn reveal_config_values_for_api(stored: &str) -> AppResult<String> {
    ensure_initialized()?;
    if stored.trim().is_empty() {
        return Ok("{}".to_string());
    }

    let map = parse_values_object(stored)?;
    let mut masked = Map::new();
    let keys: Vec<String> = map.keys().cloned().collect();

    for key in keys {
        let value = map
            .get(&key)
            .cloned()
            .unwrap_or(Value::String(String::new()));
        if is_secret_key(&key, &map) {
            let plaintext = decrypt_secret_value(value.as_str().unwrap_or_default())?;
            masked.insert(key, Value::String(mask_secret(&plaintext)));
        } else {
            masked.insert(key, value);
        }
    }

    serde_json::to_string(&masked)
        .map_err(|error| AppError::Message(format!("invalid config_values: {error}")))
}

/// Values for MCP runtime (spawn, compile): secrets decrypted on the backend only.
pub fn reveal_config_values_for_runtime(stored: &str) -> AppResult<String> {
    ensure_initialized()?;
    if stored.trim().is_empty() {
        return Ok("{}".to_string());
    }

    let map = parse_values_object(stored)?;
    let mut plain = Map::new();
    let keys: Vec<String> = map.keys().cloned().collect();

    for key in keys {
        let value = map
            .get(&key)
            .cloned()
            .unwrap_or(Value::String(String::new()));
        if is_secret_key(&key, &map) {
            let decrypted = decrypt_secret_value(value.as_str().unwrap_or_default())?;
            plain.insert(key, Value::String(decrypted));
        } else {
            plain.insert(key, value);
        }
    }

    serde_json::to_string(&plain)
        .map_err(|error| AppError::Message(format!("invalid config_values: {error}")))
}

/// Merge UI payload (plaintext or masked) with stored encrypted values for runtime commands.
pub fn resolve_config_values_for_runtime(
    incoming: &str,
    stored: Option<&str>,
) -> AppResult<String> {
    ensure_initialized()?;
    if incoming.trim().is_empty() {
        return reveal_config_values_for_runtime(stored.unwrap_or("{}"));
    }

    let mut incoming_map = parse_values_object(incoming)?;
    let stored_map = stored
        .filter(|raw| !raw.trim().is_empty())
        .map(parse_values_object)
        .transpose()?;

    if let Some(stored_raw) = stored_map.as_ref().and_then(|map| map.get(ENV_VARIABLES_KEY)) {
        if let Some(incoming_env) = incoming_map.get_mut(ENV_VARIABLES_KEY) {
            merge_env_variables_for_runtime(incoming_env, Some(stored_raw))?;
        }
    }

    let env_names = env_names_from_value(incoming_map.get(ENV_VARIABLES_KEY));
    for key in collect_secret_keys(&incoming_map, &env_names) {
        let incoming_value = incoming_map
            .get(&key)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let stored_value = stored_map
            .as_ref()
            .and_then(|map| map.get(&key));
        let resolved = resolve_one_secret_for_runtime(&incoming_value, stored_value)?;
        incoming_map.insert(key, Value::String(resolved));
    }

    serde_json::to_string(&incoming_map)
        .map_err(|error| AppError::Message(format!("invalid config_values: {error}")))
}

fn master_key_bytes() -> AppResult<&'static [u8; 32]> {
    Ok(MASTER_KEY.get_or_try_init(load_or_create_master_key)?)
}

fn load_or_create_master_key() -> AppResult<[u8; 32]> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| AppError::Message(format!("keyring unavailable: {error}")))?;

    if let Ok(encoded) = entry.get_password() {
        return decode_master_key(&encoded);
    }

    let mut key = [0_u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    let encoded = B64.encode(key);
    entry
        .set_password(&encoded)
        .map_err(|error| AppError::Message(format!("failed to store master key: {error}")))?;
    Ok(key)
}

fn decode_master_key(encoded: &str) -> AppResult<[u8; 32]> {
    let bytes = B64
        .decode(encoded.trim())
        .map_err(|error| AppError::Message(format!("invalid master key in keyring: {error}")))?;
    if bytes.len() != 32 {
        return Err(AppError::Message(
            "master key in keyring has invalid length".to_string(),
        ));
    }
    let mut key = [0_u8; 32];
    key.copy_from_slice(&bytes);
    Ok(key)
}

fn is_encrypted(value: &str) -> bool {
    value.trim().starts_with(ENCRYPTED_PREFIX)
}

fn parse_values_object(raw: &str) -> AppResult<Map<String, Value>> {
    if raw.trim().is_empty() {
        return Ok(Map::new());
    }
    let parsed: Value = serde_json::from_str(raw)
        .map_err(|error| AppError::Message(format!("invalid config_values JSON: {error}")))?;
    parsed
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::Message("config_values must be a JSON object".to_string()))
}

fn is_secret_key(key: &str, map: &Map<String, Value>) -> bool {
    if key == OAUTH_REFRESH_TOKEN_KEY || key == OAUTH_API_KEY_KEY || key == OAUTH_CLIENT_ID_KEY {
        return true;
    }
    if key.starts_with("__") && key != ENV_VARIABLES_KEY {
        return false;
    }
    if key == ENV_VARIABLES_KEY {
        return true;
    }
    if key.starts_with("env:") {
        return true;
    }
    let env_names = env_names_from_value(map.get(ENV_VARIABLES_KEY));
    env_names.contains(key)
}

fn collect_secret_keys(map: &Map<String, Value>, env_names: &HashSet<String>) -> Vec<String> {
    let mut keys = HashSet::new();
    if map.contains_key(OAUTH_REFRESH_TOKEN_KEY) {
        keys.insert(OAUTH_REFRESH_TOKEN_KEY.to_string());
    }
    if map.contains_key(OAUTH_API_KEY_KEY) {
        keys.insert(OAUTH_API_KEY_KEY.to_string());
    }
    if map.contains_key(OAUTH_CLIENT_ID_KEY) {
        keys.insert(OAUTH_CLIENT_ID_KEY.to_string());
    }
    if map.contains_key(ENV_VARIABLES_KEY) {
        keys.insert(ENV_VARIABLES_KEY.to_string());
    }
    for key in map.keys() {
        if key.starts_with("env:") || env_names.contains(key) {
            keys.insert(key.clone());
        }
    }
    keys.into_iter().collect()
}

fn env_names_from_value(value: Option<&Value>) -> HashSet<String> {
    let mut names = HashSet::new();
    let Some(Value::Array(items)) = value else {
        return names;
    };
    for item in items {
        if let Some(name) = item.get("name").and_then(Value::as_str) {
            let trimmed = name.trim();
            if !trimmed.is_empty() {
                names.insert(trimmed.to_string());
            }
        }
    }
    names
}

fn seal_env_variables_value(value: &mut Value, existing: Option<&Map<String, Value>>) -> AppResult<()> {
    let existing_array = existing
        .and_then(|map| map.get(ENV_VARIABLES_KEY))
        .and_then(Value::as_array);

    let Some(array) = value.as_array_mut() else {
        return Ok(());
    };

    for (index, item) in array.iter_mut().enumerate() {
        let Some(obj) = item.as_object_mut() else {
            continue;
        };
        let incoming = obj
            .get("value")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let existing_item = existing_array.and_then(|items| items.get(index));
        let existing_value = existing_item.and_then(|entry| entry.get("value"));
        let sealed = seal_one_secret(&incoming, existing_value)?;
        obj.insert("value".to_string(), Value::String(sealed));
    }
    Ok(())
}

fn merge_env_variables_for_runtime(
    incoming: &mut Value,
    stored: Option<&Value>,
) -> AppResult<()> {
    let incoming_array = incoming.as_array_mut().ok_or_else(|| {
        AppError::Message("__envVariables must be an array".to_string())
    })?;
    let stored_array = stored.and_then(Value::as_array);

    for (index, item) in incoming_array.iter_mut().enumerate() {
        let Some(obj) = item.as_object_mut() else {
            continue;
        };
        let incoming_value = obj
            .get("value")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let stored_value = stored_array
            .and_then(|items| items.get(index))
            .and_then(|entry| entry.get("value"));
        let resolved = resolve_one_secret_for_runtime(&incoming_value, stored_value)?;
        obj.insert("value".to_string(), Value::String(resolved));
    }
    Ok(())
}

fn seal_one_secret(incoming: &str, existing: Option<&Value>) -> AppResult<String> {
    let trimmed = incoming.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if is_encrypted(trimmed) {
        return Ok(trimmed.to_string());
    }
    if looks_masked(trimmed) {
        let Some(Value::String(previous)) = existing else {
            return Err(AppError::Message(
                "masked secret cannot be saved without an existing value".to_string(),
            ));
        };
        if is_encrypted(previous) || looks_masked(previous) {
            return Ok(previous.clone());
        }
        return encrypt_string(previous);
    }
    encrypt_string(trimmed)
}

fn resolve_one_secret_for_runtime(incoming: &str, stored: Option<&Value>) -> AppResult<String> {
    let trimmed = incoming.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if is_encrypted(trimmed) {
        return decrypt_string(trimmed);
    }
    if looks_masked(trimmed) {
        let Some(Value::String(previous)) = stored else {
            return Err(AppError::Message(
                "cannot resolve masked secret for runtime".to_string(),
            ));
        };
        return decrypt_secret_value(previous);
    }
    Ok(trimmed.to_string())
}

fn decrypt_secret_value(value: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if is_encrypted(trimmed) {
        return decrypt_string(trimmed);
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::mask_secret;

    #[test]
    fn mask_secret_handles_utf8_characters() {
        assert_eq!(mask_secret("Акай34а34а4а43"), "Ака...а43");
        assert_eq!(mask_secret("abc"), "abc...");
        assert_eq!(mask_secret("abcdef"), "abc...");
        assert_eq!(mask_secret("abcdefg"), "abc...efg");
    }
}
