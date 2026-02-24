use crate::forge_runtime::permissions::request_permission;
use crate::forge_runtime::tools::shared::{
    ensure_external_directory_permission, parse_tool_input, resolve_path, truncate_text,
};
use crate::forge_runtime::tools::ToolEnvironment;
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext, ToolDefinition, ToolOutput, ToolRegistry};
use serde::Deserialize;
use serde_json::{json, Map};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

const DEFAULT_TIMEOUT_MS: u64 = 120_000;
const MAX_LINES: usize = 2000;
const MAX_BYTES: usize = 50 * 1024;
const SHELL_BLACKLIST: &[&str] = &["fish", "nu"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OsKind {
    Windows,
    Macos,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShellFlavor {
    Cmd,
    Posix,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ShellCommand {
    program: PathBuf,
    flavor: ShellFlavor,
}

impl ShellCommand {
    fn cmd<P: Into<PathBuf>>(program: P) -> Self {
        Self {
            program: program.into(),
            flavor: ShellFlavor::Cmd,
        }
    }

    fn posix<P: Into<PathBuf>>(program: P) -> Self {
        Self {
            program: program.into(),
            flavor: ShellFlavor::Posix,
        }
    }
}

#[derive(Debug, Clone)]
struct ShellEnv {
    os: OsKind,
    shell_env: Option<String>,
    comspec: Option<String>,
    path: Vec<PathBuf>,
    lumina_git_bash_path: Option<PathBuf>,
    opencode_git_bash_path: Option<PathBuf>,
    doc_tools_bin_path: Option<PathBuf>,
}

impl ShellEnv {
    fn current() -> Self {
        let os = if cfg!(windows) {
            OsKind::Windows
        } else if cfg!(target_os = "macos") {
            OsKind::Macos
        } else {
            OsKind::Other
        };

        let path = env::var_os("PATH")
            .map(|value| env::split_paths(&value).collect())
            .unwrap_or_default();

        Self {
            os,
            shell_env: env::var("SHELL").ok(),
            comspec: env::var("COMSPEC").ok(),
            path,
            lumina_git_bash_path: env::var_os("LUMINA_GIT_BASH_PATH").map(PathBuf::from),
            opencode_git_bash_path: env::var_os("OPENCODE_GIT_BASH_PATH").map(PathBuf::from),
            doc_tools_bin_path: env::var_os("LUMINA_DOC_TOOLS_BIN").map(PathBuf::from),
        }
    }
}

#[derive(Deserialize)]
struct BashInput {
    command: String,
    timeout: Option<u64>,
    workdir: Option<String>,
    description: String,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let raw = include_str!("descriptions/bash.txt");
    let description = raw
        .replace("${directory}", &env.workspace_root.display().to_string())
        .replace("${maxLines}", &MAX_LINES.to_string())
        .replace("${maxBytes}", &MAX_BYTES.to_string());

    let definition = ToolDefinition::new("bash", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "command": { "type": "string" },
            "timeout": { "type": "number" },
            "workdir": { "type": "string" },
            "description": { "type": "string" }
        },
        "required": ["command", "description"]
    }));

    registry.register_with_definition(
        definition,
        Arc::new(move |call, ctx| {
            let env = env.clone();
            Box::pin(async move { handle(call, ctx, env).await })
        }),
    );
}

async fn handle(call: ToolCall, ctx: ToolContext, env: ToolEnvironment) -> GraphResult<ToolOutput> {
    let input: BashInput = parse_tool_input(&call)?;
    let timeout = input.timeout.unwrap_or(DEFAULT_TIMEOUT_MS);

    let workdir = input
        .workdir
        .as_deref()
        .map(|path| resolve_path(&env.workspace_root, path))
        .unwrap_or_else(|| env.workspace_root.clone());

    ensure_external_directory_permission(
        &ctx,
        &env.permissions,
        &env.workspace_root,
        &workdir,
        "directory",
    )?;

    let command_pattern = input.command.clone();
    let always = command_pattern
        .split_whitespace()
        .next()
        .map(|head| format!("{} *", head))
        .into_iter()
        .collect::<Vec<_>>();

    let mut metadata = Map::new();
    metadata.insert("command".to_string(), json!(input.command));
    metadata.insert("workdir".to_string(), json!(workdir.display().to_string()));

    request_permission(
        &ctx,
        &env.permissions,
        "bash",
        &command_pattern,
        metadata,
        if always.is_empty() {
            vec!["*".to_string()]
        } else {
            always
        },
    )?;

    let shell_env = ShellEnv::current();
    let shell = select_shell_command(&shell_env);
    let mut cmd = Command::new(&shell.program);
    if let Some(doc_bin) = shell_env.doc_tools_bin_path {
        let mut paths = Vec::new();
        paths.push(doc_bin);
        paths.extend(shell_env.path);
        let joined = env::join_paths(paths).map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to build PATH for doc tools: {}", err),
        })?;
        cmd.env("PATH", joined);
    }
    match shell.flavor {
        ShellFlavor::Cmd => {
            cmd.arg("/C").arg(&input.command);
        }
        ShellFlavor::Posix => {
            cmd.arg("-lc").arg(&input.command);
        }
    }

    let mut child = cmd
        .current_dir(&workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to spawn command: {}", err),
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut out) = stdout {
            let _ = out.read_to_end(&mut buf).await;
        }
        buf
    });
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut err) = stderr {
            let _ = err.read_to_end(&mut buf).await;
        }
        buf
    });

    let status_result = tokio::select! {
        res = child.wait() => res.map(Some),
        _ = tokio::time::sleep(Duration::from_millis(timeout)) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            Ok(None)
        }
    };

    let status = match status_result {
        Ok(status) => status,
        Err(err) => {
            return Err(GraphError::ExecutionError {
                node: format!("tool:{}", call.tool),
                message: format!("Command failed: {}", err),
            });
        }
    };
    let timed_out = status.is_none();
    let status = status.and_then(|status| status.code());
    let stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();
    let mut output = format!(
        "{}{}",
        String::from_utf8_lossy(&stdout),
        String::from_utf8_lossy(&stderr)
    );

    if timed_out {
        output.push_str(&format!("\n\n(bash timed out after {} ms)", timeout));
    }

    let (truncated, is_truncated) = truncate_text(&output, MAX_LINES, MAX_BYTES);

    Ok(ToolOutput::text(truncated)
        .with_mime_type("text/plain")
        .with_schema("tool.bash.v1")
        .with_attribute("exit", json!(status))
        .with_attribute("description", json!(input.description))
        .with_attribute("truncated", json!(is_truncated)))
}

fn select_shell_command(env: &ShellEnv) -> ShellCommand {
    if let Some(shell) = env.shell_env.as_deref() {
        if !is_shell_blacklisted(shell, env.os) {
            return ShellCommand::posix(shell);
        }
    }

    match env.os {
        OsKind::Windows => select_windows_shell(env),
        OsKind::Macos => ShellCommand::posix("/bin/zsh"),
        OsKind::Other => {
            if let Some(bash) = which_in_paths(&env.path, &["bash"]) {
                ShellCommand::posix(bash)
            } else {
                ShellCommand::posix("/bin/sh")
            }
        }
    }
}

fn select_windows_shell(env: &ShellEnv) -> ShellCommand {
    if let Some(path) = env
        .lumina_git_bash_path
        .as_ref()
        .filter(|path| path_exists(path))
    {
        return ShellCommand::posix(path.clone());
    }

    if let Some(path) = env
        .opencode_git_bash_path
        .as_ref()
        .filter(|path| path_exists(path))
    {
        return ShellCommand::posix(path.clone());
    }

    if let Some(git) = which_in_paths(&env.path, &["git.exe", "git.cmd", "git.bat", "git"]) {
        if let Some(bash) = git_bash_from_git(&git).filter(|path| path_exists(path)) {
            return ShellCommand::posix(bash);
        }
    }

    if let Some(comspec) = env.comspec.as_deref() {
        return ShellCommand::cmd(comspec);
    }

    ShellCommand::cmd("cmd.exe")
}

fn is_shell_blacklisted(shell: &str, os: OsKind) -> bool {
    let name = Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(shell);
    let mut name = name.to_ascii_lowercase();
    if os == OsKind::Windows {
        name = name.trim_end_matches(".exe").to_string();
    }
    SHELL_BLACKLIST.contains(&name.as_str())
}

fn which_in_paths(paths: &[PathBuf], names: &[&str]) -> Option<PathBuf> {
    for dir in paths {
        for name in names {
            let candidate = dir.join(name);
            if path_exists(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn git_bash_from_git(git_path: &Path) -> Option<PathBuf> {
    let cmd_dir = git_path.parent()?;
    let git_root = cmd_dir.parent()?;
    Some(git_root.join("bin").join("bash.exe"))
}

fn path_exists(path: &Path) -> bool {
    std::fs::metadata(path).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, b"").unwrap();
    }

    #[test]
    fn prefers_shell_env_when_not_blacklisted() {
        let env = ShellEnv {
            os: OsKind::Macos,
            shell_env: Some("/usr/local/bin/zsh".to_string()),
            comspec: None,
            path: Vec::new(),
            lumina_git_bash_path: None,
            opencode_git_bash_path: None,
            doc_tools_bin_path: None,
        };

        let shell = select_shell_command(&env);
        assert_eq!(shell.program, PathBuf::from("/usr/local/bin/zsh"));
        assert_eq!(shell.flavor, ShellFlavor::Posix);
    }

    #[test]
    fn skips_blacklisted_shells() {
        let temp = TempDir::new().unwrap();
        let bash = temp.path().join("bash");
        touch(&bash);

        let env = ShellEnv {
            os: OsKind::Other,
            shell_env: Some("/usr/bin/fish".to_string()),
            comspec: None,
            path: vec![temp.path().to_path_buf()],
            lumina_git_bash_path: None,
            opencode_git_bash_path: None,
            doc_tools_bin_path: None,
        };

        let shell = select_shell_command(&env);
        assert_eq!(shell.program, bash);
        assert_eq!(shell.flavor, ShellFlavor::Posix);
    }

    #[test]
    fn windows_prefers_lumina_git_bash_path() {
        let temp = TempDir::new().unwrap();
        let bash = temp.path().join("bash.exe");
        touch(&bash);

        let env = ShellEnv {
            os: OsKind::Windows,
            shell_env: None,
            comspec: Some("cmd.exe".to_string()),
            path: Vec::new(),
            lumina_git_bash_path: Some(bash.clone()),
            opencode_git_bash_path: None,
            doc_tools_bin_path: None,
        };

        let shell = select_shell_command(&env);
        assert_eq!(shell.program, bash);
        assert_eq!(shell.flavor, ShellFlavor::Posix);
    }

    #[test]
    fn windows_falls_back_to_git_bash_from_git() {
        let temp = TempDir::new().unwrap();
        let git_cmd = temp.path().join("Git").join("cmd").join("git.exe");
        let bash = temp.path().join("Git").join("bin").join("bash.exe");
        touch(&git_cmd);
        touch(&bash);

        let env = ShellEnv {
            os: OsKind::Windows,
            shell_env: None,
            comspec: Some("cmd.exe".to_string()),
            path: vec![git_cmd.parent().unwrap().to_path_buf()],
            lumina_git_bash_path: None,
            opencode_git_bash_path: None,
            doc_tools_bin_path: None,
        };

        let shell = select_shell_command(&env);
        assert_eq!(shell.program, bash);
        assert_eq!(shell.flavor, ShellFlavor::Posix);
    }

    #[test]
    fn windows_falls_back_to_comspec_when_no_bash_found() {
        let env = ShellEnv {
            os: OsKind::Windows,
            shell_env: None,
            comspec: Some("C:\\Windows\\System32\\cmd.exe".to_string()),
            path: Vec::new(),
            lumina_git_bash_path: None,
            opencode_git_bash_path: None,
            doc_tools_bin_path: None,
        };

        let shell = select_shell_command(&env);
        assert_eq!(
            shell.program,
            PathBuf::from("C:\\Windows\\System32\\cmd.exe")
        );
        assert_eq!(shell.flavor, ShellFlavor::Cmd);
    }
}
