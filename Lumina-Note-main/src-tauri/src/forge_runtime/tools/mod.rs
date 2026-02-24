pub mod bash;
pub mod edit;
pub mod fetch;
pub mod glob;
pub mod grep;
pub mod list;
pub mod read;
mod shared;
pub mod write;

use crate::forge_runtime::permissions::PermissionSession;
use forge::runtime::tool::ToolRegistry;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone)]
pub struct ToolEnvironment {
    pub workspace_root: PathBuf,
    pub permissions: Arc<PermissionSession>,
}

impl ToolEnvironment {
    pub fn new(workspace_root: impl Into<PathBuf>, permissions: Arc<PermissionSession>) -> Self {
        Self {
            workspace_root: workspace_root.into(),
            permissions,
        }
    }
}

pub fn build_registry(env: ToolEnvironment) -> ToolRegistry {
    let mut registry = ToolRegistry::new();

    read::register(&mut registry, env.clone());
    write::register(&mut registry, env.clone());
    edit::register(&mut registry, env.clone());
    fetch::register(&mut registry, env.clone());
    glob::register(&mut registry, env.clone());
    grep::register(&mut registry, env.clone());
    list::register(&mut registry, env.clone());
    bash::register(&mut registry, env);

    registry
}
