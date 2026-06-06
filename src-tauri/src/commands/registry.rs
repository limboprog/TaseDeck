const ALLOWED_REGISTRY_PREFIX: &str = "https://registry.modelcontextprotocol.io/";

#[tauri::command]
pub async fn registry_http_get(url: String) -> Result<serde_json::Value, String> {
    if !url.starts_with(ALLOWED_REGISTRY_PREFIX) {
        return Err("Registry URL is not allowed".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Registry request failed ({})",
            response.status().as_u16()
        ));
    }

    response.json().await.map_err(|error| error.to_string())
}
