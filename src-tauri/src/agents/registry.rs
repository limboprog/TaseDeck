use crate::agents::builtin::{
    AntigravityAgent, ClaudeCodeAgent, CodexCliAgent, CopilotAgent, CursorAgent, OpenCodeAgent,
    VsCodeAgent, WindsurfAgent,
};
use crate::agents::traits::AgentConfigProvider;
use crate::agents::types::AgentCatalogEntry;
use crate::error::{AppError, AppResult};
use std::sync::Arc;

pub fn list_catalog() -> Vec<AgentCatalogEntry> {
    all_providers()
        .into_iter()
        .map(|provider| AgentCatalogEntry {
            kind: provider.kind().to_string(),
            label: provider.label().to_string(),
        })
        .collect()
}

pub fn provider_for(kind: &str) -> AppResult<Arc<dyn AgentConfigProvider>> {
    all_providers()
        .into_iter()
        .find(|provider| provider.kind() == kind)
        .ok_or_else(|| AppError::Message(format!("unknown agent kind: {kind}")))
}

fn all_providers() -> Vec<Arc<dyn AgentConfigProvider>> {
    vec![
        Arc::new(CursorAgent::new()),
        Arc::new(ClaudeCodeAgent::new()),
        Arc::new(VsCodeAgent::new()),
        Arc::new(OpenCodeAgent::new()),
        Arc::new(WindsurfAgent::new()),
        Arc::new(CodexCliAgent::new()),
        Arc::new(AntigravityAgent::new()),
        Arc::new(CopilotAgent::new()),
    ]
}
