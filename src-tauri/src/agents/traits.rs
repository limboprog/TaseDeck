use crate::agents::types::{AgentConfigInfo, McpConfigLocation};
use std::path::{Path, PathBuf};

/// Built-in agent integration: discover global config dirs and `mcp.json` per OS.
pub trait AgentConfigProvider: Send + Sync {
    fn kind(&self) -> &'static str;
    fn label(&self) -> &'static str;

    /// Root key for MCP server entries in `mcp.json` (`mcpServers` vs `servers`).
    fn mcp_json_servers_key(&self) -> &'static str {
        "mcpServers"
    }

    /// Config file name inside each candidate directory (`mcp.json` by default).
    fn mcp_config_file_name(&self) -> &'static str {
        "mcp.json"
    }

    /// Parent directories that may contain the MCP config file (checked in order).
    fn candidate_config_dirs(&self) -> Vec<PathBuf>;

    fn resolve_config(&self) -> AgentConfigInfo {
        let file_name = self.mcp_config_file_name();
        let candidates: Vec<McpConfigLocation> = self
            .candidate_config_dirs()
            .into_iter()
            .map(|dir| McpConfigLocation::from_dir_and_file(dir, file_name))
            .collect();

        let active = candidates
            .iter()
            .find(|entry| entry.mcp_json_exists)
            .or_else(|| candidates.iter().find(|entry| entry.dir_exists))
            .cloned();

        AgentConfigInfo {
            kind: self.kind().to_string(),
            label: self.label().to_string(),
            candidates,
            active,
        }
    }

    fn active_mcp_json_path(&self) -> Option<PathBuf> {
        let info = self.resolve_config();
        info.active.map(|entry| PathBuf::from(entry.mcp_json_path))
    }

    fn read_mcp_json(&self) -> crate::error::AppResult<Option<serde_json::Value>> {
        let Some(path) = self.active_mcp_json_path() else {
            return Ok(None);
        };
        if !path.is_file() {
            return Ok(None);
        }
        crate::agents::mcp_json::read_agent_mcp_config_as_json(&path, self.kind()).map_err(
            |error| crate::error::AppError::Message(error),
        )
    }

    fn ensure_mcp_json(&self) -> crate::error::AppResult<PathBuf> {
        let info = self.resolve_config();
        let config_dir = info
            .active
            .as_ref()
            .map(|entry| PathBuf::from(&entry.config_dir))
            .or_else(|| self.candidate_config_dirs().into_iter().next())
            .ok_or_else(|| {
                crate::error::AppError::Message("no config directory candidates".to_string())
            })?;

        std::fs::create_dir_all(&config_dir)?;
        let mcp_path = config_dir.join(self.mcp_config_file_name());
        if !mcp_path.is_file() {
            if self.mcp_config_file_name() == "mcp.json" {
                let template = crate::agents::mcp_json::default_mcp_json_template(self.kind());
                std::fs::write(&mcp_path, template)?;
            } else if self.mcp_config_file_name().ends_with(".toml") {
                std::fs::write(
                    &mcp_path,
                    "# MCP servers: use `codex mcp add` or edit [mcp_servers.*] tables\n",
                )?;
            } else {
                let root_key = self.mcp_json_servers_key();
                let template = format!("{{\n  \"{root_key}\": {{}}\n}}\n");
                std::fs::write(&mcp_path, template)?;
            }
        }
        Ok(mcp_path)
    }
}
