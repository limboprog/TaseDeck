pub mod builtin;
pub mod mcp_json;
pub mod registry;
pub mod resolve;
pub mod traits;
pub mod types;

pub use registry::{list_catalog, provider_for};
pub use resolve::{
    expand_home_path, is_config_dir_valid, normalize_config_dir_path, resolve_auto_config_path,
};
pub use types::{AgentCatalogEntry, AgentConfigInfo};
