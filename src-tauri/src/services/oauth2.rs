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
const OAUTH_CALLBACK_PATH_ALT: &str = "/callback";
const AUTH_REQUIRED_PREFIX: &str = "MCP_AUTH_REQUIRED:";
pub const MCP_OAUTH_SIGN_IN_EVENT: &str = "mcp-oauth-sign-in-required";
pub const MCP_OAUTH_SIGN_IN_COMPLETE_EVENT: &str = "mcp-oauth-sign-in-complete";
pub const TASEDECK_DEEP_LINK_OPEN: &str = "tasedeck://oauth/complete";

fn oauth_redirect_uris(port: u16) -> Vec<String> {
    vec![format!(
        "http://{OAUTH_CALLBACK_HOST}:{port}{OAUTH_CALLBACK_PATH}"
    )]
}

fn oauth_redirect_uri(port: u16) -> String {
    oauth_redirect_uris(port)
        .into_iter()
        .next()
        .expect("redirect uri list is never empty")
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
    resource: String,
    oauth_state: String,
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
            let scope_hint = parse_www_authenticate_scope(www_auth.as_deref());
            let challenge =
                self.begin_oauth_flow(server, endpoint, &resource_metadata_url, scope_hint.as_deref())?;
            self.emit_sign_in(&challenge);
            return Ok(AuthAction::SignInRequired(challenge));
        }

        let scope_hint = parse_www_authenticate_scope(www_auth.as_deref());
        if let Ok(challenge) = self.begin_oauth_flow_from_endpoint(server, endpoint, scope_hint.as_deref())
        {
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
        scope_hint: Option<&str>,
    ) -> AppResult<McpAuthChallenge> {
        let prm: ProtectedResourceMetadata = self
            .client
            .get(resource_metadata_url)
            .header("Accept", "application/json")
            .send()
            .map_err(|error| AppError::Message(format!("failed to fetch resource metadata: {error}")))?
            .error_for_status()
            .map_err(|error| {
                AppError::Message(format!(
                    "resource metadata request failed for {resource_metadata_url}: {error}"
                ))
            })?
            .json()
            .map_err(|error| AppError::Message(format!("invalid resource metadata JSON: {error}")))?;

        let issuers = resolve_authorization_server_issuers(&prm);
        if issuers.is_empty() {
            return Err(AppError::Message(
                "resource metadata has no authorization_servers".to_string(),
            ));
        }

        let port = self.bound_callback_port().ok_or_else(|| {
            AppError::Message(
                "OAuth callback server is not running; restart the application".to_string(),
            )
        })?;
        let redirect_uri = oauth_redirect_uri(port);
        let redirect_uris = oauth_redirect_uris(port);

        let mut last_error = None;
        for issuer in issuers {
            match discover_authorization_server(&self.client, &issuer) {
                Ok(as_metadata) => {
                    match self.build_oauth_challenge(
                        server,
                        endpoint,
                        &prm,
                        &as_metadata,
                        &issuer,
                        &redirect_uri,
                        &redirect_uris,
                        resource_metadata_url,
                        scope_hint,
                    ) {
                        Ok(challenge) => return Ok(challenge),
                        Err(error) => last_error = Some(error.to_string()),
                    }
                }
                Err(error) => last_error = Some(error.to_string()),
            }
        }

        Err(AppError::Message(
            last_error.unwrap_or_else(|| "OAuth authorization server discovery failed".to_string()),
        ))
    }

    fn begin_oauth_flow_from_endpoint(
        &self,
        server: &McpServer,
        endpoint: &str,
        scope_hint: Option<&str>,
    ) -> AppResult<McpAuthChallenge> {
        let mut last_error = None;
        for resource_metadata_url in prm_well_known_candidates(endpoint) {
            match self.begin_oauth_flow(
                server,
                endpoint,
                &resource_metadata_url,
                scope_hint,
            ) {
                Ok(challenge) => return Ok(challenge),
                Err(error) => last_error = Some(error.to_string()),
            }
        }
        Err(AppError::Message(
            last_error.unwrap_or_else(|| "could not discover OAuth resource metadata".to_string()),
        ))
    }

    fn build_oauth_challenge(
        &self,
        server: &McpServer,
        endpoint: &str,
        prm: &ProtectedResourceMetadata,
        as_metadata: &AuthorizationServerMetadata,
        issuer: &str,
        redirect_uri: &str,
        redirect_uris: &[String],
        resource_metadata_url: &str,
        scope_hint: Option<&str>,
    ) -> AppResult<McpAuthChallenge> {
        let client_id = resolve_oauth_client_id(&self.client, as_metadata, redirect_uris)?;

        let code_verifier = generate_code_verifier();
        let code_challenge = code_challenge_s256(&code_verifier);
        let resource = resolve_resource_uri(prm, endpoint);
        let oauth_state = build_oauth_state(server.id);
        let authorization_endpoint =
            resolve_endpoint_url(issuer, &as_metadata.authorization_endpoint)?;
        let token_endpoint = resolve_endpoint_url(issuer, &as_metadata.token_endpoint)?;
        let mut auth_url = Url::parse(&authorization_endpoint).map_err(|error| {
            AppError::Message(format!("invalid authorization endpoint: {error}"))
        })?;
        {
            let mut pairs = auth_url.query_pairs_mut();
            pairs.append_pair("response_type", "code");
            pairs.append_pair("client_id", &client_id);
            pairs.append_pair("redirect_uri", redirect_uri);
            pairs.append_pair("code_challenge", &code_challenge);
            pairs.append_pair("code_challenge_method", "S256");
            pairs.append_pair("state", &oauth_state);
            pairs.append_pair("resource", &resource);
            if let Some(scope) = scope_hint
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .or_else(|| resolve_oauth_scope(prm))
            {
                pairs.append_pair("scope", &scope);
            }
        }

        let authorization_url = auth_url.to_string();
        eprintln!(
            "[oauth] server={} issuer={} auth_url={}",
            server.id, issuer, authorization_url
        );

        let pending = PendingOAuthFlow {
            authorization_url: authorization_url.clone(),
            token_endpoint,
            code_verifier,
            client_id,
            redirect_uri: redirect_uri.to_string(),
            resource,
            oauth_state,
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
            authorization_url: Some(authorization_url),
            resource_metadata_url: Some(resource_metadata_url.to_string()),
        })
    }

    fn ensure_oauth_flow_prepared(&self, server_id: i64) -> AppResult<()> {
        let db = self.database();
        let server = db
            .get_mcp_server(server_id)?
            .ok_or_else(|| AppError::Message("MCP server not found".to_string()))?;
        let endpoint = server_endpoint(&server)?;
        let resource_metadata_url = self.discover_resource_metadata_url(server_id, &endpoint)?;
        let _ = self.begin_oauth_flow(&server, &endpoint, &resource_metadata_url, None)?;
        Ok(())
    }

    fn discover_resource_metadata_url(&self, server_id: i64, endpoint: &str) -> AppResult<String> {
        if let Ok(pending) = self.pending.lock() {
            if let Some(url) = pending
                .get(&server_id)
                .and_then(|flow| flow.resource_metadata_url.clone())
            {
                return Ok(url);
            }
        }

        let initialize_body = json!({
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "tase-deck",
                    "version": "0.1.0"
                }
            },
            "id": 1
        });

        if let Ok(response) = self
            .client
            .post(endpoint)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .json(&initialize_body)
            .send()
        {
            if response.status() == reqwest::StatusCode::UNAUTHORIZED {
                if let Some(url) =
                    parse_resource_metadata_url(read_www_authenticate(response.headers()).as_deref())
                {
                    return Ok(url);
                }
            }
        }

        for candidate in prm_well_known_candidates(endpoint) {
            if let Ok(response) = self
                .client
                .get(&candidate)
                .header("Accept", "application/json")
                .send()
            {
                if response.status().is_success() {
                    return Ok(candidate);
                }
            }
        }

        Err(AppError::Message(
            "could not discover OAuth resource metadata URL".to_string(),
        ))
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
            .get(&server_id)
            .cloned()
            .ok_or_else(|| AppError::Message("no pending OAuth flow for this server".to_string()))?;

        let token_response = match self.exchange_authorization_code(&pending, code, true) {
            Ok(token) => token,
            Err(first_error) => {
                eprintln!("[oauth] token exchange with resource failed: {first_error}");
                self.exchange_authorization_code(&pending, code, false)
                    .map_err(|_| first_error)?
            }
        };

        if let Ok(mut pending_map) = self.pending.lock() {
            pending_map.remove(&server_id);
        }

        self.apply_token_response(db, server_id, token_response, Some(&pending.client_id))
    }

    fn exchange_authorization_code(
        &self,
        pending: &PendingOAuthFlow,
        code: &str,
        include_resource: bool,
    ) -> AppResult<TokenResponse> {
        let mut form = vec![
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", pending.redirect_uri.as_str()),
            ("client_id", pending.client_id.as_str()),
            ("code_verifier", pending.code_verifier.as_str()),
        ];
        if include_resource {
            form.push(("resource", pending.resource.as_str()));
        }

        let response = self
            .client
            .post(&pending.token_endpoint)
            .form(&form)
            .send()
            .map_err(|error| AppError::Message(format!("token exchange failed: {error}")))?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .unwrap_or_else(|_| "<empty response>".to_string());
            return Err(AppError::Message(format!(
                "token exchange failed ({status}): {body}"
            )));
        }
        response
            .json()
            .map_err(|error| AppError::Message(format!("invalid token response: {error}")))
    }

    pub fn start_browser_sign_in(self: &Arc<Self>, server_id: i64) -> AppResult<()> {
        self.init_callback_listener();
        self.ensure_oauth_flow_prepared(server_id)?;

        let redirect_uri = self.oauth_redirect_uri()?;
        let auth_url = {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| AppError::Message("oauth store lock poisoned".to_string()))?;
            let flow = pending.get_mut(&server_id).ok_or_else(|| {
                AppError::Message("no pending OAuth flow for this server".to_string())
            })?;
            if flow.redirect_uri != redirect_uri {
                flow.redirect_uri = redirect_uri.clone();
                flow.authorization_url =
                    replace_redirect_uri_in_auth_url(&flow.authorization_url, &redirect_uri)?;
            }
            flow.authorization_url.clone()
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
                eprintln!("[oauth] complete_oauth_code failed: {message}");
                self.notify_callback_waiter(server_id, Err(message.clone()));
                (
                    Err(message.clone()),
                    oauth_error_page(&message),
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
        let resource_metadata_url = self
            .discover_resource_metadata_url(server.id, &endpoint)
            .or_else(|_| {
                prm_well_known_candidates(&endpoint)
                    .into_iter()
                    .next()
                    .ok_or_else(|| {
                        AppError::Message("could not discover OAuth resource metadata".to_string())
                    })
            })?;
        let prm: ProtectedResourceMetadata = self
            .client
            .get(&resource_metadata_url)
            .send()
            .map_err(|error| AppError::Message(format!("failed to fetch resource metadata: {error}")))?
            .json()
            .map_err(|error| AppError::Message(format!("invalid resource metadata JSON: {error}")))?;

        let issuers = resolve_authorization_server_issuers(&prm);
        if issuers.is_empty() {
            return Err(AppError::Message(
                "resource metadata has no authorization_servers".to_string(),
            ));
        }

        let db_values = reveal_config_values_for_runtime(&server.config_values)?;
        let map = parse_values_map(&db_values)?;
        let client_id = read_plain_secret(&map, OAUTH_CLIENT_ID_KEY)?;
        let resource = resolve_resource_uri(&prm, &endpoint);

        let mut last_error = None;
        for issuer in issuers {
            let as_metadata = match discover_authorization_server(&self.client, &issuer) {
                Ok(metadata) => metadata,
                Err(error) => {
                    last_error = Some(error.to_string());
                    continue;
                }
            };
            let token_endpoint = match resolve_endpoint_url(&issuer, &as_metadata.token_endpoint) {
                Ok(endpoint) => endpoint,
                Err(error) => {
                    last_error = Some(error.to_string());
                    continue;
                }
            };

            let mut form = vec![
                ("grant_type".to_string(), "refresh_token".to_string()),
                ("refresh_token".to_string(), refresh_token.to_string()),
                ("resource".to_string(), resource.clone()),
            ];
            if let Some(client_id) = client_id.clone().filter(|value| !value.is_empty()) {
                form.push(("client_id".to_string(), client_id));
            }
            let form_refs: Vec<(&str, &str)> = form
                .iter()
                .map(|(key, value)| (key.as_str(), value.as_str()))
                .collect();

            let response = match self
                .client
                .post(&token_endpoint)
                .form(&form_refs)
                .send()
            {
                Ok(response) => response,
                Err(error) => {
                    last_error = Some(format!("refresh token request failed: {error}"));
                    continue;
                }
            };
            let response = match response.error_for_status() {
                Ok(response) => response,
                Err(error) => {
                    last_error = Some(format!("refresh token request failed: {error}"));
                    continue;
                }
            };
            let token_response = match response.json::<TokenResponse>() {
                Ok(token) => token,
                Err(error) => {
                    last_error = Some(format!("invalid refresh token response: {error}"));
                    continue;
                }
            };

            if let Some(new_refresh) = token_response.refresh_token.as_deref().filter(|v| !v.is_empty())
            {
                let mut next_map = map.clone();
                next_map.insert(
                    OAUTH_REFRESH_TOKEN_KEY.to_string(),
                    Value::String(new_refresh.to_string()),
                );
                self.apply_token_response_in_memory(server.id, &token_response)?;
                self.persist_config_values(db, server, &next_map)?;
                return token_response.access_token.ok_or_else(|| {
                    AppError::Message("refresh response missing access_token".to_string())
                });
            }
            self.apply_token_response_in_memory(server.id, &token_response)?;
            return token_response.access_token.ok_or_else(|| {
                AppError::Message("refresh response missing access_token".to_string())
            });
        }

        Err(AppError::Message(
            last_error.unwrap_or_else(|| "refresh token request failed".to_string()),
        ))
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

    fn resolve_server_id_for_oauth_state(&self, state: &str) -> Option<i64> {
        let pending = self.pending.lock().ok()?;
        pending
            .iter()
            .find(|(_, flow)| flow.oauth_state == state)
            .map(|(server_id, _)| *server_id)
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
    #[serde(default)]
    authorization_server: Option<String>,
    #[serde(default)]
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
    let urls = authorization_server_metadata_urls(issuer);
    let mut last_error = None;
    for url in urls {
        match fetch_authorization_server_metadata(client, &url) {
            Ok(metadata) => return Ok(metadata),
            Err(error) => last_error = Some(error.to_string()),
        }
    }
    Err(AppError::Message(
        last_error.unwrap_or_else(|| "authorization server discovery failed".to_string()),
    ))
}

fn fetch_authorization_server_metadata(
    client: &Client,
    url: &str,
) -> AppResult<AuthorizationServerMetadata> {
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .map_err(|error| AppError::Message(format!("authorization server discovery failed: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::Message(format!(
            "authorization server discovery failed for {url}: {}",
            response.status()
        )));
    }
    response
        .json()
        .map_err(|error| AppError::Message(format!("invalid authorization server metadata: {error}")))
}

fn authorization_server_metadata_urls(issuer: &str) -> Vec<String> {
    let issuer = normalize_issuer(issuer);
    if issuer.contains("/.well-known/oauth-authorization-server")
        || issuer.contains("/.well-known/openid-configuration")
    {
        return vec![issuer];
    }

    let Ok(parsed) = Url::parse(&issuer) else {
        return vec![
            format!("{issuer}/.well-known/oauth-authorization-server"),
            format!("{issuer}/.well-known/openid-configuration"),
        ];
    };

    let scheme = parsed.scheme();
    let host = parsed.host_str().unwrap_or("").to_lowercase();
    let port_suffix = parsed
        .port()
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    let base = format!("{scheme}://{host}{port_suffix}");

    let path = parsed.path().trim_end_matches('/');
    let path = if path.is_empty() || path == "/" {
        ""
    } else {
        path
    };

    let mut urls = Vec::new();
    if !path.is_empty() {
        urls.push(format!("{base}/.well-known/oauth-authorization-server{path}"));
        urls.push(format!("{base}/.well-known/openid-configuration{path}"));
        urls.push(format!("{base}{path}/.well-known/openid-configuration"));
    }
    urls.push(format!("{base}/.well-known/oauth-authorization-server"));
    urls.push(format!("{base}/.well-known/openid-configuration"));
    urls
}

fn resolve_authorization_server_issuers(prm: &ProtectedResourceMetadata) -> Vec<String> {
    if !prm.authorization_servers.is_empty() {
        return prm
            .authorization_servers
            .iter()
            .map(|issuer| normalize_issuer(issuer))
            .filter(|issuer| !issuer.is_empty())
            .collect();
    }
    prm.authorization_server
        .as_deref()
        .map(normalize_issuer)
        .filter(|issuer| !issuer.is_empty())
        .into_iter()
        .collect()
}

fn resolve_oauth_client_id(
    client: &Client,
    metadata: &AuthorizationServerMetadata,
    redirect_uris: &[String],
) -> AppResult<String> {
    let Some(registration_endpoint) = metadata.registration_endpoint.as_deref() else {
        return Err(AppError::Message(
            "OAuth client registration is required but no registration endpoint was advertised"
                .to_string(),
        ));
    };

    let body = json!({
        "client_name": "TaseDeck",
        "redirect_uris": redirect_uris,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "application_type": "native"
    });
    let response = client
        .post(registration_endpoint)
        .json(&body)
        .send()
        .map_err(|error| AppError::Message(format!("client registration failed: {error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .unwrap_or_else(|_| "<empty response>".to_string());
        return Err(AppError::Message(format!(
            "client registration failed ({status}): {body}"
        )));
    }
    let registration = response
        .json::<ClientRegistrationResponse>()
        .map_err(|error| AppError::Message(format!("invalid client registration response: {error}")))?;
    if registration.client_id.trim().is_empty() {
        return Err(AppError::Message(
            "client registration returned an empty client_id".to_string(),
        ));
    }
    Ok(registration.client_id)
}

fn resolve_resource_uri(prm: &ProtectedResourceMetadata, endpoint: &str) -> String {
    prm.resource
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| normalize_resource_uri(endpoint))
}

fn normalize_resource_uri(endpoint: &str) -> String {
    let trimmed = endpoint.trim();
    let Ok(mut url) = Url::parse(trimmed) else {
        return trimmed.trim_end_matches('/').to_string();
    };
    url.set_query(None);
    url.set_fragment(None);
    let path = url.path().trim_end_matches('/').to_string();
    url.set_path(if path.is_empty() { "/" } else { path.as_str() });
    url.to_string().trim_end_matches('/').to_string()
}

fn resolve_oauth_scope(prm: &ProtectedResourceMetadata) -> Option<String> {
    prm.scopes_supported
        .as_ref()
        .filter(|scopes| !scopes.is_empty())
        .map(|scopes| scopes.join(" "))
}

fn build_oauth_state(server_id: i64) -> String {
    format!("{server_id}:{}", generate_code_verifier())
}

fn parse_oauth_state(state: &str) -> Option<i64> {
    let server_id = state.split(':').next()?.trim();
    if server_id.is_empty() {
        return None;
    }
    server_id.parse().ok()
}

fn normalize_issuer(issuer: &str) -> String {
    issuer.trim().trim_end_matches('/').to_string()
}

fn resolve_endpoint_url(issuer: &str, endpoint: &str) -> AppResult<String> {
    let endpoint = endpoint.trim();
    if endpoint.is_empty() {
        return Err(AppError::Message("OAuth endpoint URL is empty".to_string()));
    }
    if Url::parse(endpoint).is_ok() && endpoint.contains("://") {
        return Ok(endpoint.to_string());
    }
    let base = Url::parse(normalize_issuer(issuer).as_str())
        .map_err(|error| AppError::Message(format!("invalid issuer URL: {error}")))?;
    base.join(endpoint.trim_start_matches('/'))
        .map(|url| url.to_string())
        .map_err(|error| AppError::Message(format!("invalid OAuth endpoint URL: {error}")))
}

fn replace_redirect_uri_in_auth_url(auth_url: &str, redirect_uri: &str) -> AppResult<String> {
    let mut url = Url::parse(auth_url)
        .map_err(|error| AppError::Message(format!("invalid authorization URL: {error}")))?;
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    {
        let mut query = url.query_pairs_mut();
        query.clear();
        for (key, value) in pairs {
            let next_value = if key == "redirect_uri" {
                redirect_uri.to_string()
            } else {
                value
            };
            query.append_pair(&key, &next_value);
        }
    }
    Ok(url.to_string())
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

fn prm_well_known_candidates(endpoint: &str) -> Vec<String> {
    let trimmed = endpoint.trim();
    let Ok(url) = Url::parse(trimmed) else {
        return vec![format!("{trimmed}/.well-known/oauth-protected-resource")];
    };
    let origin = format!(
        "{}://{}",
        url.scheme(),
        url.host_str().unwrap_or_default()
    );
    let path = url.path().trim_end_matches('/');
    let mut candidates = Vec::new();
    if !path.is_empty() && path != "/" {
        candidates.push(format!("{origin}/.well-known/oauth-protected-resource{path}"));
    }
    candidates.push(format!("{origin}/.well-known/oauth-protected-resource"));
    candidates
}

fn well_known_resource_metadata_url(endpoint: &str) -> String {
    prm_well_known_candidates(endpoint)
        .into_iter()
        .next()
        .unwrap_or_else(|| format!("{endpoint}/.well-known/oauth-protected-resource"))
}

fn parse_www_authenticate_scope(www_authenticate: Option<&str>) -> Option<String> {
    let header = www_authenticate?;
    for part in header.split(',') {
        let trimmed = part.trim();
        let value = trimmed
            .strip_prefix("scope=")
            .or_else(|| {
                trimmed
                    .find("scope=")
                    .map(|index| &trimmed[index + "scope=".len()..])
            })?;
        let scope = unquote_auth_param(value);
        if !scope.is_empty() {
            return Some(scope);
        }
    }
    None
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

    if path != OAUTH_CALLBACK_PATH && path != OAUTH_CALLBACK_PATH_ALT {
        write_http_html_response(&mut stream, 404, &oauth_error_page("Not found."))?;
        return Ok(());
    }

    let params = parse_query_params(query);
    let server_id = match params.get("state").map(String::as_str) {
        Some(state) => oauth
            .resolve_server_id_for_oauth_state(state)
            .or_else(|| parse_oauth_state(state))
            .filter(|id| *id > 0),
        None => None,
    };
    let Some(server_id) = server_id else {
        write_http_html_response(
            &mut stream,
            400,
            &oauth_error_page("Missing or invalid OAuth state."),
        )?;
        return Ok(());
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
    let safe_message = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
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
    p {{ margin: 0; color: #a8b0bf; line-height: 1.5; word-break: break-word; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign-in failed</h1>
    <p>{safe_message}</p>
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
