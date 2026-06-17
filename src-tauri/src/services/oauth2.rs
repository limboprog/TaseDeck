use crate::db::{Database, McpServer};
use crate::error::{AppError, AppResult};
use crate::services::security::{
    decrypt_string, reveal_config_values_for_runtime, seal_config_values_for_storage,
    OAUTH_API_KEY_KEY, OAUTH_CLIENT_ID_KEY, OAUTH_REFRESH_TOKEN_KEY,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use reqwest::blocking::Client;
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use url::Url;

const OAUTH_HTTP_TIMEOUT: Duration = Duration::from_secs(60);
const OAUTH_SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);
const OAUTH_CALLBACK_HOST: &str = "127.0.0.1";
const OAUTH_CALLBACK_PATH: &str = "/oauth/callback";
const AUTH_REQUIRED_PREFIX: &str = "MCP_AUTH_REQUIRED:";
pub const MCP_OAUTH_SIGN_IN_EVENT: &str = "mcp-oauth-sign-in-required";
pub const MCP_OAUTH_SIGN_IN_COMPLETE_EVENT: &str = "mcp-oauth-sign-in-complete";
pub const TASEDECK_DEEP_LINK_OPEN: &str = "tasedeck://oauth/complete";

fn oauth_redirect_uri(port: u16) -> String {
    format!("http://{OAUTH_CALLBACK_HOST}:{port}{OAUTH_CALLBACK_PATH}")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpOAuthSignInComplete {
    pub server_id: i64,
}

type CallbackWaiter = mpsc::Sender<Result<(), String>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpAuthChallenge {
    pub server_id: i64,
    pub server_name: String,
    pub endpoint: String,
    pub flow: String,
    pub authorization_url: Option<String>,
    pub resource_metadata_url: Option<String>,
}

#[derive(Debug, Clone)]
pub enum AuthAction {
    RetryWithToken(String),
    SignInRequired(McpAuthChallenge),
}

#[derive(Debug, Clone)]
struct AccessTokenSession {
    access_token: String,
    expires_at: Option<SystemTime>,
}

#[derive(Debug, Clone)]
struct PendingOAuthFlow {
    authorization_url: String,
    token_endpoint: String,
    code_verifier: String,
    client_id: String,
    redirect_uri: String,
    resource_metadata_url: Option<String>,
}

pub struct OAuthStore {
    db: Arc<Database>,
    sessions: Mutex<HashMap<i64, AccessTokenSession>>,
    pending: Mutex<HashMap<i64, PendingOAuthFlow>>,
    callback_waiters: Mutex<HashMap<i64, CallbackWaiter>>,
    callback_listener: Mutex<Option<JoinHandle<()>>>,
    callback_port: Mutex<Option<u16>>,
    app: OnceLock<AppHandle>,
    client: Client,
}

impl OAuthStore {
    pub fn new(db: Arc<Database>) -> Self {
        let client = Client::builder()
            .timeout(OAUTH_HTTP_TIMEOUT)
            .user_agent("tase-deck/0.1.0")
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            db,
            sessions: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            callback_waiters: Mutex::new(HashMap::new()),
            callback_listener: Mutex::new(None),
            callback_port: Mutex::new(None),
            app: OnceLock::new(),
            client,
        }
    }

    fn bound_callback_port(&self) -> Option<u16> {
        self.callback_port
            .lock()
            .ok()
            .and_then(|guard| *guard)
    }

    fn oauth_redirect_uri(&self) -> AppResult<String> {
        let port = self.bound_callback_port().ok_or_else(|| {
            AppError::Message(
                "OAuth callback server is not running; restart the application".to_string(),
            )
        })?;
        Ok(oauth_redirect_uri(port))
    }

    pub fn init_callback_listener(self: &Arc<Self>) {
        let mut guard = match self.callback_listener.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        if guard.is_some() {
            return;
        }

        let listener = match TcpListener::bind((OAUTH_CALLBACK_HOST, 0)) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!(
                    "failed to bind OAuth callback server on {OAUTH_CALLBACK_HOST}:0: {error}"
                );
                return;
            }
        };

        let port = match listener.local_addr() {
            Ok(address) => address.port(),
            Err(error) => {
                eprintln!("failed to read OAuth callback server port: {error}");
                return;
            }
        };

        if let Ok(mut port_guard) = self.callback_port.lock() {
            *port_guard = Some(port);
        }

        let store = Arc::clone(self);
        *guard = Some(thread::spawn(move || oauth_callback_listener_loop(listener, store)));
    }

    pub fn database(&self) -> &Database {
        &self.db
    }

    pub fn attach_app(&self, app: AppHandle) {
        let _ = self.app.set(app);
    }

    pub fn clear_server_session(&self, server_id: i64) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.remove(&server_id);
        }
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&server_id);
        }
    }

    pub fn get_pending_challenge(&self, server_id: i64) -> Option<McpAuthChallenge> {
        let pending = self.pending.lock().ok()?;
        let flow = pending.get(&server_id)?;
        Some(McpAuthChallenge {
            server_id,
            server_name: String::new(),
            endpoint: String::new(),
            flow: "oauth".to_string(),
            authorization_url: Some(flow.authorization_url.clone()),
            resource_metadata_url: flow.resource_metadata_url.clone(),
        })
    }

    pub fn bearer_token_for_server(&self, server: &McpServer) -> AppResult<Option<String>> {
        let db = self.database();
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get(&server.id) {
                if !session.is_expired() {
                    return Ok(Some(session.access_token.clone()));
                }
                sessions.remove(&server.id);
            }
        }

        let values = reveal_config_values_for_runtime(&server.config_values)?;
        let map = parse_values_map(&values)?;

        if let Some(api_key) = read_plain_secret(&map, OAUTH_API_KEY_KEY)? {
            if !api_key.is_empty() {
                return Ok(Some(api_key));
            }
        }

        if let Some(refresh_token) = read_plain_secret(&map, OAUTH_REFRESH_TOKEN_KEY)? {
            if !refresh_token.is_empty() {
                if let Ok(access) = self.refresh_access_token(db, server, &refresh_token) {
                    return Ok(Some(access));
                }
            }
        }

        Ok(None)
    }

    pub fn handle_http_unauthorized(
        &self,
        server: &McpServer,
        endpoint: &str,
        headers: &HeaderMap,
    ) -> AppResult<AuthAction> {
        let db = self.database();
        let www_auth = read_www_authenticate(headers);
        let values = reveal_config_values_for_runtime(&server.config_values)?;
        let map = parse_values_map(&values)?;

        if let Some(refresh_token) = read_plain_secret(&map, OAUTH_REFRESH_TOKEN_KEY)? {
            if !refresh_token.is_empty() {
                match self.refresh_access_token(db, server, &refresh_token) {
                    Ok(access) => return Ok(AuthAction::RetryWithToken(access)),
                    Err(_) => {
                        self.clear_server_session(server.id);
                    }
                }
            }
        }

        if let Some(resource_metadata_url) = parse_resource_metadata_url(www_auth.as_deref()) {
            let challenge = self.begin_oauth_flow(server, endpoint, &resource_metadata_url)?;
            self.emit_sign_in(&challenge);
            return Ok(AuthAction::SignInRequired(challenge));
        }

        if read_plain_secret(&map, OAUTH_API_KEY_KEY)?.is_some() {
            return Err(AppError::Message(
                "stored API key was rejected by the MCP server (401 Unauthorized)".to_string(),
            ));
        }

        let challenge = McpAuthChallenge {
            server_id: server.id,
            server_name: server.name.clone(),
            endpoint: endpoint.to_string(),
            flow: "api_key".to_string(),
            authorization_url: Some(endpoint.to_string()),
            resource_metadata_url: None,
        };
        self.emit_sign_in(&challenge);
        Ok(AuthAction::SignInRequired(challenge))
    }

    pub fn begin_oauth_flow(
        &self,
        server: &McpServer,
        endpoint: &str,
        resource_metadata_url: &str,
    ) -> AppResult<McpAuthChallenge> {
        let prm: ProtectedResourceMetadata = self
            .client
            .get(resource_metadata_url)
            .send()
            .map_err(|error| AppError::Message(format!("failed to fetch resource metadata: {error}")))?
            .json()
            .map_err(|error| AppError::Message(format!("invalid resource metadata JSON: {error}")))?;

        let issuer = prm
            .authorization_servers
            .first()
            .ok_or_else(|| AppError::Message("resource metadata has no authorization_servers".to_string()))?
            .trim()
            .trim_end_matches('/')
            .to_string();

        let as_metadata = discover_authorization_server(&self.client, &issuer)?;
        let redirect_uri = self.oauth_redirect_uri()?;
        let client_id = register_or_default_client(&self.client, &as_metadata, &redirect_uri)?;

        let code_verifier = generate_code_verifier();
        let code_challenge = code_challenge_s256(&code_verifier);
        let mut auth_url = Url::parse(&as_metadata.authorization_endpoint).map_err(|error| {
            AppError::Message(format!("invalid authorization endpoint: {error}"))
        })?;
        {
            let mut pairs = auth_url.query_pairs_mut();
            pairs.append_pair("response_type", "code");
            pairs.append_pair("client_id", &client_id);
            pairs.append_pair("redirect_uri", &redirect_uri);
            pairs.append_pair("code_challenge", &code_challenge);
            pairs.append_pair("code_challenge_method", "S256");
            pairs.append_pair("state", &server.id.to_string());
            if let Some(scope) = prm.scopes_supported.as_ref().and_then(|s| s.first()) {
                pairs.append_pair("scope", scope);
            }
            if let Some(resource) = prm.resource.as_deref() {
                pairs.append_pair("resource", resource);
            } else {
                pairs.append_pair("resource", endpoint);
            }
        }

        let pending = PendingOAuthFlow {
            authorization_url: auth_url.to_string(),
            token_endpoint: as_metadata.token_endpoint,
            code_verifier,
            client_id,
            redirect_uri,
            resource_metadata_url: Some(resource_metadata_url.to_string()),
        };

        if let Ok(mut map) = self.pending.lock() {
            map.insert(server.id, pending);
        }

        Ok(McpAuthChallenge {
            server_id: server.id,
            server_name: server.name.clone(),
            endpoint: endpoint.to_string(),
            flow: "oauth".to_string(),
            authorization_url: Some(auth_url.to_string()),
            resource_metadata_url: Some(resource_metadata_url.to_string()),
        })
    }

    pub fn complete_oauth_redirect(&self, server_id: i64, redirect_url: &str) -> AppResult<()> {
        let parsed = Url::parse(redirect_url.trim())
            .map_err(|error| AppError::Message(format!("invalid redirect URL: {error}")))?;
        let code = parsed
            .query_pairs()
            .find(|(key, _)| key == "code")
            .map(|(_, value)| value.to_string())
            .ok_or_else(|| AppError::Message("redirect URL has no authorization code".to_string()))?;
        self.complete_oauth_code(server_id, &code)
    }

    pub fn complete_oauth_code(&self, server_id: i64, code: &str) -> AppResult<()> {
        let db = self.database();
        let pending = self
            .pending
            .lock()
            .map_err(|_| AppError::Message("oauth store lock poisoned".to_string()))?
            .remove(&server_id)
            .ok_or_else(|| AppError::Message("no pending OAuth flow for this server".to_string()))?;

        let token_response: TokenResponse = self
            .client
            .post(&pending.token_endpoint)
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", pending.redirect_uri.as_str()),
                ("client_id", pending.client_id.as_str()),
                ("code_verifier", pending.code_verifier.as_str()),
            ])
            .send()
            .map_err(|error| AppError::Message(format!("token exchange failed: {error}")))?
            .json()
            .map_err(|error| AppError::Message(format!("invalid token response: {error}")))?;

        self.apply_token_response(db, server_id, token_response, Some(&pending.client_id))
    }

    pub fn start_browser_sign_in(self: &Arc<Self>, server_id: i64) -> AppResult<()> {
        self.init_callback_listener();

        let auth_url = {
            let pending = self
                .pending
                .lock()
                .map_err(|_| AppError::Message("oauth store lock poisoned".to_string()))?;
            pending
                .get(&server_id)
                .map(|flow| flow.authorization_url.clone())
                .ok_or_else(|| {
                    AppError::Message("no pending OAuth flow for this server".to_string())
                })?
        };

        let (sender, receiver) = mpsc::channel();
        if let Ok(mut waiters) = self.callback_waiters.lock() {
            waiters.insert(server_id, sender);
        }

        self.open_authorization_url(&auth_url)?;

        match receiver.recv_timeout(OAUTH_SIGN_IN_TIMEOUT) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(message)) => Err(AppError::Message(message)),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.clear_callback_waiter(server_id);
                Err(AppError::Message("OAuth sign-in timed out".to_string()))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err(AppError::Message("OAuth callback channel closed".to_string()))
            }
        }
    }

    fn open_authorization_url(&self, url: &str) -> AppResult<()> {
        let app = self.app.get().ok_or_else(|| {
            AppError::Message("application is not ready to open the browser".to_string())
        })?;
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|error| AppError::Message(format!("failed to open browser: {error}")))
    }

    fn clear_callback_waiter(&self, server_id: i64) {
        if let Ok(mut waiters) = self.callback_waiters.lock() {
            waiters.remove(&server_id);
        }
    }

    fn notify_callback_waiter(&self, server_id: i64, result: Result<(), String>) {
        if let Ok(mut waiters) = self.callback_waiters.lock() {
            if let Some(sender) = waiters.remove(&server_id) {
                let _ = sender.send(result);
            }
        }
    }

    fn handle_oauth_callback(
        &self,
        server_id: i64,
        code: Option<&str>,
        oauth_error: Option<&str>,
    ) -> (Result<(), String>, String) {
        if let Some(error) = oauth_error {
            let message = format!("OAuth authorization failed: {error}");
            self.notify_callback_waiter(server_id, Err(message.clone()));
            return (
                Err(message),
                oauth_error_page("Sign-in was cancelled or denied."),
            );
        }

        let Some(code) = code.filter(|value| !value.is_empty()) else {
            let message = "OAuth callback is missing authorization code".to_string();
            self.notify_callback_waiter(server_id, Err(message.clone()));
            return (
                Err(message),
                oauth_error_page("Missing authorization code."),
            );
        };

        match self.complete_oauth_code(server_id, code) {
            Ok(()) => {
                self.emit_sign_in_complete(server_id);
                self.notify_callback_waiter(server_id, Ok(()));
                (Ok(()), oauth_success_page())
            }
            Err(error) => {
                let message = error.to_string();
                self.notify_callback_waiter(server_id, Err(message.clone()));
                (
                    Err(message),
                    oauth_error_page("Could not complete sign-in."),
                )
            }
        }
    }

    fn emit_sign_in_complete(&self, server_id: i64) {
        if let Some(app) = self.app.get() {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit(
                MCP_OAUTH_SIGN_IN_COMPLETE_EVENT,
                McpOAuthSignInComplete { server_id },
            );
        }
    }

    pub fn set_api_key(&self, server_id: i64, api_key: &str) -> AppResult<()> {
        let db = self.database();
        let trimmed = api_key.trim();
        if trimmed.is_empty() {
            return Err(AppError::Message("API key cannot be empty".to_string()));
        }
        let server = db
            .get_mcp_server(server_id)?
            .ok_or_else(|| AppError::Message("MCP server not found".to_string()))?;
        let mut map = parse_values_map(&reveal_config_values_for_runtime(&server.config_values)?)?;
        map.insert(OAUTH_API_KEY_KEY.to_string(), Value::String(trimmed.to_string()));
        map.remove(OAUTH_REFRESH_TOKEN_KEY);
        map.remove(OAUTH_CLIENT_ID_KEY);
        self.persist_config_values(db, &server, &map)?;
        self.clear_server_session(server_id);
        Ok(())
    }

    fn refresh_access_token(
        &self,
        db: &Database,
        server: &McpServer,
        refresh_token: &str,
    ) -> AppResult<String> {
        let endpoint = server_endpoint(server)?;
        let resource_metadata_url = well_known_resource_metadata_url(&endpoint);
        let prm: ProtectedResourceMetadata = self
            .client
            .get(&resource_metadata_url)
            .send()
            .map_err(|error| AppError::Message(format!("failed to fetch resource metadata: {error}")))?
            .json()
            .map_err(|error| AppError::Message(format!("invalid resource metadata JSON: {error}")))?;

        let issuer = prm
            .authorization_servers
            .first()
            .ok_or_else(|| AppError::Message("resource metadata has no authorization_servers".to_string()))?
            .trim()
            .trim_end_matches('/')
            .to_string();
        let as_metadata = discover_authorization_server(&self.client, &issuer)?;
        let db_values = reveal_config_values_for_runtime(&server.config_values)?;
        let map = parse_values_map(&db_values)?;
        let client_id = read_plain_secret(&map, OAUTH_CLIENT_ID_KEY)?;
        let resource = prm
            .resource
            .as_deref()
            .filter(|value| !value.is_empty())
            .unwrap_or(&endpoint);

        let mut form = vec![
            ("grant_type".to_string(), "refresh_token".to_string()),
            ("refresh_token".to_string(), refresh_token.to_string()),
            ("resource".to_string(), resource.to_string()),
        ];
        if let Some(client_id) = client_id.filter(|value| !value.is_empty()) {
            form.push(("client_id".to_string(), client_id));
        }
        let form_refs: Vec<(&str, &str)> = form
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect();

        let token_response: TokenResponse = self
            .client
            .post(&as_metadata.token_endpoint)
            .form(&form_refs)
            .send()
            .map_err(|error| AppError::Message(format!("refresh token request failed: {error}")))?
            .json()
            .map_err(|error| AppError::Message(format!("invalid refresh token response: {error}")))?;

        if let Some(new_refresh) = token_response.refresh_token.as_deref().filter(|v| !v.is_empty()) {
            let mut next_map = map;
            next_map.insert(
                OAUTH_REFRESH_TOKEN_KEY.to_string(),
                Value::String(new_refresh.to_string()),
            );
            self.apply_token_response_in_memory(server.id, &token_response)?;
            self.persist_config_values(db, server, &next_map)?;
            return token_response
                .access_token
                .ok_or_else(|| AppError::Message("refresh response missing access_token".to_string()));
        }
        self.apply_token_response_in_memory(server.id, &token_response)?;
        token_response
            .access_token
            .ok_or_else(|| AppError::Message("refresh response missing access_token".to_string()))
    }

    fn apply_token_response(
        &self,
        db: &Database,
        server_id: i64,
        token: TokenResponse,
        client_id: Option<&str>,
    ) -> AppResult<()> {
        let server = db
            .get_mcp_server(server_id)?
            .ok_or_else(|| AppError::Message("MCP server not found".to_string()))?;
        self.apply_token_response_in_memory(server_id, &token)?;

        let mut map = parse_values_map(&reveal_config_values_for_runtime(&server.config_values)?)?;
        map.remove(OAUTH_API_KEY_KEY);
        if let Some(refresh) = token.refresh_token.as_deref().filter(|v| !v.is_empty()) {
            map.insert(
                OAUTH_REFRESH_TOKEN_KEY.to_string(),
                Value::String(refresh.to_string()),
            );
        }
        if let Some(client_id) = client_id.filter(|value| !value.is_empty()) {
            map.insert(
                OAUTH_CLIENT_ID_KEY.to_string(),
                Value::String(client_id.to_string()),
            );
        }
        self.persist_config_values(db, &server, &map)
    }

    fn apply_token_response_in_memory(&self, server_id: i64, token: &TokenResponse) -> AppResult<()> {
        let access = token
            .access_token
            .as_deref()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::Message("token response missing access_token".to_string()))?;
        let expires_at = token.expires_in.map(|seconds| {
            SystemTime::now() + Duration::from_secs(seconds.saturating_sub(30))
        });
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.insert(
                server_id,
                AccessTokenSession {
                    access_token: access.to_string(),
                    expires_at,
                },
            );
        }
        Ok(())
    }

    fn persist_config_values(&self, db: &Database, server: &McpServer, map: &Map<String, Value>) -> AppResult<()> {
        let mut next = server.clone();
        let raw = serde_json::to_string(map)
            .map_err(|error| AppError::Message(format!("failed to encode config values: {error}")))?;
        next.config_values = seal_config_values_for_storage(&raw, Some(server.config_values.as_str()))?;
        db.update_mcp_server(&next)?;
        Ok(())
    }

    fn emit_sign_in(&self, challenge: &McpAuthChallenge) {
        if let Some(app) = self.app.get() {
            let _ = app.emit(MCP_OAUTH_SIGN_IN_EVENT, challenge);
        }
    }
}

impl AccessTokenSession {
    fn is_expired(&self) -> bool {
        self.expires_at
            .is_some_and(|deadline| SystemTime::now() >= deadline)
    }
}

pub fn auth_required_error(challenge: &McpAuthChallenge) -> String {
    serde_json::to_string(challenge)
        .map(|json| format!("{AUTH_REQUIRED_PREFIX}{json}"))
        .unwrap_or_else(|_| format!("{AUTH_REQUIRED_PREFIX}{}", challenge.server_id))
}

pub fn parse_auth_required_error(message: &str) -> Option<McpAuthChallenge> {
    let json = message.strip_prefix(AUTH_REQUIRED_PREFIX)?;
    serde_json::from_str(json).ok()
}

#[derive(Debug, Deserialize)]
struct ProtectedResourceMetadata {
    #[serde(default)]
    resource: Option<String>,
    authorization_servers: Vec<String>,
    #[serde(default)]
    scopes_supported: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct AuthorizationServerMetadata {
    authorization_endpoint: String,
    token_endpoint: String,
    #[serde(default)]
    registration_endpoint: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ClientRegistrationResponse {
    client_id: String,
}

fn discover_authorization_server(client: &Client, issuer: &str) -> AppResult<AuthorizationServerMetadata> {
    let url = format!("{issuer}/.well-known/oauth-authorization-server");
    if let Ok(response) = client.get(&url).send() {
        if response.status().is_success() {
            return response
                .json()
                .map_err(|error| AppError::Message(format!("invalid AS metadata: {error}")));
        }
    }
    let oidc = format!("{issuer}/.well-known/openid-configuration");
    client
        .get(&oidc)
        .send()
        .map_err(|error| AppError::Message(format!("failed to fetch AS metadata: {error}")))?
        .json()
        .map_err(|error| AppError::Message(format!("invalid OIDC metadata: {error}")))
}

fn register_or_default_client(
    client: &Client,
    metadata: &AuthorizationServerMetadata,
    redirect_uri: &str,
) -> AppResult<String> {
    if let Some(registration_endpoint) = metadata.registration_endpoint.as_deref() {
        let body = json!({
            "client_name": "TaseDeck",
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
            "application_type": "native"
        });
        if let Ok(response) = client.post(registration_endpoint).json(&body).send() {
            if response.status().is_success() {
                if let Ok(registration) = response.json::<ClientRegistrationResponse>() {
                    return Ok(registration.client_id);
                }
            }
        }
    }
    Ok("tase-deck".to_string())
}

fn generate_code_verifier() -> String {
    let mut bytes = [0_u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn code_challenge_s256(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn read_www_authenticate(headers: &HeaderMap) -> Option<String> {
    headers
        .get("www-authenticate")
        .or_else(|| headers.get("WWW-Authenticate"))
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}

pub fn parse_resource_metadata_url(www_authenticate: Option<&str>) -> Option<String> {
    let header = www_authenticate?;
    for part in header.split(',') {
        let trimmed = part.trim();
        if let Some(value) = trimmed.strip_prefix("resource_metadata=") {
            return Some(unquote_auth_param(value));
        }
        if let Some(start) = trimmed.find("resource_metadata=") {
            let value = &trimmed[start + "resource_metadata=".len()..];
            return Some(unquote_auth_param(value));
        }
    }
    None
}

fn unquote_auth_param(raw: &str) -> String {
    let trimmed = raw.trim().trim_matches('"');
    trimmed
        .split_whitespace()
        .next()
        .unwrap_or(trimmed)
        .to_string()
}

fn well_known_resource_metadata_url(endpoint: &str) -> String {
    let parsed = Url::parse(endpoint).ok();
    if let Some(url) = parsed {
        let origin = format!("{}://{}", url.scheme(), url.host_str().unwrap_or(""));
        return format!("{origin}/.well-known/oauth-protected-resource");
    }
    format!("{endpoint}/.well-known/oauth-protected-resource")
}

fn server_endpoint(server: &McpServer) -> AppResult<String> {
    if let Some(path) = server.path.as_deref().filter(|value| value.starts_with("http")) {
        return Ok(path.trim().to_string());
    }
    serde_json::from_str::<Value>(&server.json_config)
        .ok()
        .and_then(|root| {
            root.get("mcpServers")
                .and_then(Value::as_object)
                .and_then(|map| map.values().next())
                .and_then(|entry| entry.get("url"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .ok_or_else(|| AppError::Message("remote MCP server has no HTTP endpoint".to_string()))
}

fn parse_values_map(raw: &str) -> AppResult<Map<String, Value>> {
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

fn oauth_callback_listener_loop(listener: TcpListener, oauth: Arc<OAuthStore>) {
    for stream in listener.incoming().flatten() {
        let oauth = Arc::clone(&oauth);
        thread::spawn(move || {
            let _ = handle_oauth_callback_connection(&oauth, stream);
        });
    }
}

fn handle_oauth_callback_connection(oauth: &OAuthStore, mut stream: TcpStream) -> std::io::Result<()> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

    let mut buffer = [0_u8; 8192];
    let read_bytes = stream.read(&mut buffer)?;
    if read_bytes == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..read_bytes]);
    let (path, query) = match parse_http_get_target(&request) {
        Some(parts) => parts,
        None => {
            write_http_html_response(
                &mut stream,
                400,
                &oauth_error_page("Invalid request."),
            )?;
            return Ok(());
        }
    };

    if path != OAUTH_CALLBACK_PATH {
        write_http_html_response(&mut stream, 404, &oauth_error_page("Not found."))?;
        return Ok(());
    }

    let params = parse_query_params(query);
    let server_id = match params.get("state").and_then(|value| value.parse::<i64>().ok()) {
        Some(server_id) if server_id > 0 => server_id,
        _ => {
            write_http_html_response(
                &mut stream,
                400,
                &oauth_error_page("Missing or invalid OAuth state."),
            )?;
            return Ok(());
        }
    };
    let code = params.get("code").map(String::as_str);
    let oauth_error = params
        .get("error")
        .map(String::as_str)
        .or_else(|| params.get("error_description").map(String::as_str));

    let (_, body) = oauth.handle_oauth_callback(server_id, code, oauth_error);
    write_http_html_response(&mut stream, 200, &body)?;
    Ok(())
}

fn parse_http_get_target(request: &str) -> Option<(String, &str)> {
    let first_line = request.lines().next()?.trim();
    let mut parts = first_line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    Some((path.to_string(), query))
}

fn parse_query_params(query: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        if key.is_empty() {
            continue;
        }
        params.insert(
            urlencoding::decode(key).map(|text| text.into_owned()).unwrap_or_else(|_| key.to_string()),
            urlencoding::decode(value)
                .map(|text| text.into_owned())
                .unwrap_or_else(|_| value.to_string()),
        );
    }
    params
}

fn write_http_html_response(stream: &mut TcpStream, status: u16, body: &str) -> std::io::Result<()> {
    let status_text = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "Error",
    };
    let response = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()
}

fn oauth_success_page() -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Signed in</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #0f1115; color: #f5f5f5; display: grid; place-items: center; min-height: 100vh; margin: 0; }}
    .card {{ max-width: 420px; padding: 24px 28px; border-radius: 12px; background: #171a21; border: 1px solid #2a2f3a; text-align: center; }}
    h1 {{ font-size: 20px; margin: 0 0 8px; }}
    p {{ margin: 0 0 18px; color: #a8b0bf; line-height: 1.5; }}
    .btn {{
      display: inline-block;
      padding: 10px 18px;
      border-radius: 8px;
      background: #4f7cff;
      color: #fff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }}
    .btn:hover {{ background: #3f6aef; }}
    .hint {{ margin-top: 14px; font-size: 12px; color: #7d8698; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>Signed in</h1>
    <p>Authentication completed successfully.</p>
    <a class="btn" href="{open_url}">Open TaseDeck</a>
    <p class="hint">You can also close this tab and switch back manually.</p>
  </div>
</body>
</html>"#,
        open_url = TASEDECK_DEEP_LINK_OPEN
    )
}

fn oauth_error_page(message: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sign-in failed</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #0f1115; color: #f5f5f5; display: grid; place-items: center; min-height: 100vh; margin: 0; }}
    .card {{ max-width: 420px; padding: 24px 28px; border-radius: 12px; background: #171a21; border: 1px solid #2a2f3a; text-align: center; }}
    h1 {{ font-size: 20px; margin: 0 0 8px; }}
    p {{ margin: 0; color: #a8b0bf; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign-in failed</h1>
    <p>{message}</p>
  </div>
</body>
</html>"#
    )
}

fn read_plain_secret(map: &Map<String, Value>, key: &str) -> AppResult<Option<String>> {
    let Some(value) = map.get(key).and_then(Value::as_str) else {
        return Ok(None);
    };
    if value.is_empty() {
        return Ok(None);
    }
    Ok(Some(decrypt_string(value)?))
}
