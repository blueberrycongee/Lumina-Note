use crate::error::AppError;
use crate::node_runtime::{
    arch_tag, current_arch, current_platform, platform_tag, NodeArch, NodePlatform,
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocToolsStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub root_dir: Option<String>,
    pub bin_dir: Option<String>,
    pub tools: HashMap<String, ToolStatus>,
    pub missing: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub available: bool,
    pub path: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Serialize)]
struct CurrentVersionFile {
    version: String,
}

const DOC_TOOLS_ENV_BIN: &str = "LUMINA_DOC_TOOLS_BIN";
const DOC_TOOLS_ENV_DIR: &str = "LUMINA_DOC_TOOLS_DIR";
const DOC_TOOLS_ENV_URL: &str = "LUMINA_DOC_TOOLS_URL";
const DOC_TOOLS_ENV_MANIFEST_URL: &str = "LUMINA_DOC_TOOLS_MANIFEST_URL";
const DEFAULT_DOC_TOOLS_MANIFEST_URL: &str =
    "https://github.com/blueberrycongee/Lumina-Note/releases/latest/download/doc-tools-manifest.json";

#[derive(Debug, Deserialize)]
struct DocToolsManifest {
    version: String,
    assets: Vec<DocToolsAsset>,
}

#[derive(Debug, Deserialize)]
struct DocToolsAsset {
    platform: String,
    arch: String,
    url: String,
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    size: Option<u64>,
    #[serde(default)]
    format: Option<String>,
    #[serde(default)]
    bin_dir: Option<String>,
}

pub fn doc_tools_version() -> &'static str {
    include_str!("../../doc-tools-version.txt").trim()
}

fn doc_tools_base_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("doc-tools")
}

fn current_version_path(base: &Path) -> PathBuf {
    base.join("current.json")
}

fn version_dir(base: &Path, version: &str) -> PathBuf {
    base.join("versions").join(version)
}

fn read_current_version(base: &Path) -> Option<String> {
    let p = current_version_path(base);
    let data = std::fs::read_to_string(p).ok()?;
    let v: serde_json::Value = serde_json::from_str(&data).ok()?;
    v.get("version")?.as_str().map(|s| s.to_string())
}

fn write_current_version(base: &Path, version: &str) -> Result<(), AppError> {
    let p = current_version_path(base);
    let payload = CurrentVersionFile {
        version: version.to_string(),
    };
    std::fs::write(
        p,
        serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into()),
    )?;
    Ok(())
}

fn doc_tools_archive_name(version: &str, platform: NodePlatform, arch: NodeArch) -> Option<String> {
    let ext = match platform {
        NodePlatform::Windows => "zip",
        NodePlatform::Macos | NodePlatform::Linux => "tar.xz",
    };
    Some(format!(
        "lumina-doc-tools-v{version}-{}-{}.{}",
        platform_tag(platform),
        arch_tag(arch),
        ext
    ))
}

fn doc_tools_archive_url(version: &str, platform: NodePlatform, arch: NodeArch) -> Option<String> {
    if let Ok(url) = env::var(DOC_TOOLS_ENV_URL) {
        if !url.trim().is_empty() {
            return Some(url);
        }
    }
    let name = doc_tools_archive_name(version, platform, arch)?;
    Some(format!(
        "https://github.com/blueberrycongee/Lumina-Note/releases/download/doc-tools-v{version}/{name}"
    ))
}

fn tool_candidates() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        ("python", vec!["python3", "python"]),
        ("pandoc", vec!["pandoc"]),
        ("soffice", vec!["soffice", "soffice.bin"]),
        ("pdftoppm", vec!["pdftoppm"]),
    ]
}

fn bin_name(name: &str, platform: NodePlatform) -> Vec<String> {
    if platform == NodePlatform::Windows {
        vec![format!("{name}.exe")]
    } else {
        vec![name.to_string()]
    }
}

fn resolve_tool_in_dir(dir: &Path, names: &[&str], platform: NodePlatform) -> Option<PathBuf> {
    for name in names {
        for candidate in bin_name(name, platform) {
            let p = dir.join(&candidate);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn resolve_tool_on_path(names: &[&str], platform: NodePlatform) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for path in env::split_paths(&path_var) {
        if let Some(found) = resolve_tool_in_dir(&path, names, platform) {
            return Some(found);
        }
    }
    None
}

async fn sha256_file(path: &Path) -> Result<String, AppError> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 16 * 1024];
    loop {
        let n = tokio::io::AsyncReadExt::read(&mut file, &mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn normalize_platform_tag(tag: &str) -> Option<NodePlatform> {
    match tag.to_lowercase().as_str() {
        "macos" | "darwin" | "osx" => Some(NodePlatform::Macos),
        "windows" | "win" => Some(NodePlatform::Windows),
        "linux" => Some(NodePlatform::Linux),
        _ => None,
    }
}

fn normalize_arch_tag(tag: &str) -> Option<NodeArch> {
    match tag.to_lowercase().as_str() {
        "arm64" | "aarch64" => Some(NodeArch::Arm64),
        "x64" | "amd64" => Some(NodeArch::X64),
        _ => None,
    }
}

fn manifest_url() -> String {
    env::var(DOC_TOOLS_ENV_MANIFEST_URL)
        .unwrap_or_else(|_| DEFAULT_DOC_TOOLS_MANIFEST_URL.to_string())
}

fn url_filename(url: &str) -> String {
    url.split('/')
        .last()
        .filter(|name| !name.is_empty())
        .unwrap_or("doc-tools-download")
        .to_string()
}

async fn fetch_manifest() -> Result<DocToolsManifest, AppError> {
    let url = manifest_url();
    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Network(format!("Doc tools manifest download failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Network(format!(
            "Doc tools manifest download failed: HTTP {}",
            response.status()
        )));
    }
    let bytes = response.bytes().await?;
    serde_json::from_slice(&bytes)
        .map_err(|e| AppError::InvalidPath(format!("Doc tools manifest invalid: {e}")))
}

fn select_asset<'a>(
    manifest: &'a DocToolsManifest,
    platform: NodePlatform,
    arch: NodeArch,
) -> Result<&'a DocToolsAsset, AppError> {
    manifest
        .assets
        .iter()
        .find(|asset| {
            normalize_platform_tag(&asset.platform) == Some(platform)
                && normalize_arch_tag(&asset.arch) == Some(arch)
        })
        .ok_or_else(|| {
            AppError::InvalidPath(format!(
                "Doc tools asset not found for {}-{}",
                platform_tag(platform),
                arch_tag(arch)
            ))
        })
}

fn find_pack_root(version_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        version_dir.to_path_buf(),
        version_dir.join("doc-tools"),
        version_dir.join("doc_tools"),
    ];
    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }
    if let Ok(mut entries) = std::fs::read_dir(version_dir) {
        let mut dirs = Vec::new();
        while let Some(Ok(entry)) = entries.next() {
            let path = entry.path();
            if path.is_dir() {
                dirs.push(path);
            }
        }
        if dirs.len() == 1 {
            return Some(dirs.remove(0));
        }
    }
    None
}

fn find_pack_bin_dir(root: &Path) -> Option<PathBuf> {
    let candidates = [
        root.join("bin"),
        root.join("usr").join("bin"),
        root.join("Scripts"),
    ];
    for c in candidates {
        if c.is_dir() {
            return Some(c);
        }
    }
    None
}

fn tool_status_for(
    _name: &str,
    aliases: &[&str],
    platform: NodePlatform,
    pack_bin: Option<&Path>,
) -> ToolStatus {
    if let Some(bin_dir) = pack_bin {
        if let Some(p) = resolve_tool_in_dir(bin_dir, aliases, platform) {
            return ToolStatus {
                available: true,
                path: Some(p.to_string_lossy().to_string()),
                source: Some("pack".to_string()),
            };
        }
    }

    if let Some(p) = resolve_tool_on_path(aliases, platform) {
        return ToolStatus {
            available: true,
            path: Some(p.to_string_lossy().to_string()),
            source: Some("system".to_string()),
        };
    }

    ToolStatus {
        available: false,
        path: None,
        source: None,
    }
}

pub fn ensure_doc_tools_env(app: &AppHandle) {
    if env::var_os(DOC_TOOLS_ENV_BIN).is_some() {
        return;
    }
    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };
    let base = doc_tools_base_dir(&app_data_dir);
    let version = match read_current_version(&base) {
        Some(v) => v,
        None => return,
    };
    let root = match find_pack_root(&version_dir(&base, &version)) {
        Some(root) => root,
        None => return,
    };
    let bin_dir = match find_pack_bin_dir(&root) {
        Some(bin) => bin,
        None => return,
    };
    env::set_var(DOC_TOOLS_ENV_BIN, bin_dir);
    env::set_var(DOC_TOOLS_ENV_DIR, root);
}

#[tauri::command]
pub async fn doc_tools_get_status(app: AppHandle) -> Result<DocToolsStatus, AppError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InvalidPath(format!("Failed to get app_data_dir: {}", e)))?;
    let platform = current_platform();
    let base = doc_tools_base_dir(&app_data_dir);
    let version = read_current_version(&base);

    let root_dir = if let Ok(dir) = env::var(DOC_TOOLS_ENV_DIR) {
        if !dir.is_empty() {
            Some(PathBuf::from(dir))
        } else {
            None
        }
    } else {
        version
            .as_deref()
            .and_then(|v| find_pack_root(&version_dir(&base, v)))
    };
    let bin_dir = root_dir.as_ref().and_then(|root| find_pack_bin_dir(root));

    let mut tools = HashMap::new();
    let mut missing = Vec::new();

    for (name, aliases) in tool_candidates() {
        let status = tool_status_for(name, &aliases, platform, bin_dir.as_deref());
        if !status.available {
            missing.push(name.to_string());
        }
        tools.insert(name.to_string(), status);
    }

    let installed = bin_dir.is_some();
    if installed {
        if let Some(bin_dir) = &bin_dir {
            env::set_var(DOC_TOOLS_ENV_BIN, bin_dir);
        }
        if let Some(root_dir) = &root_dir {
            env::set_var(DOC_TOOLS_ENV_DIR, root_dir);
        }
    }

    Ok(DocToolsStatus {
        installed,
        version,
        root_dir: root_dir.map(|p| p.to_string_lossy().to_string()),
        bin_dir: bin_dir.map(|p| p.to_string_lossy().to_string()),
        tools,
        missing,
    })
}

#[tauri::command]
pub async fn doc_tools_install_latest(app: AppHandle) -> Result<DocToolsStatus, AppError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InvalidPath(format!("Failed to get app_data_dir: {}", e)))?;

    let version_fallback = doc_tools_version().to_string();
    let platform = current_platform();
    let arch = current_arch();
    let direct_url = env::var(DOC_TOOLS_ENV_URL)
        .ok()
        .filter(|v| !v.trim().is_empty());
    let manifest = if direct_url.is_none() {
        Some(fetch_manifest().await?)
    } else {
        None
    };
    let (version, url, expected_sha, bin_dir_hint) = if let Some(manifest) = &manifest {
        let asset = select_asset(manifest, platform, arch)?;
        (
            manifest.version.clone(),
            asset.url.clone(),
            asset.sha256.clone(),
            asset.bin_dir.clone(),
        )
    } else {
        (version_fallback.clone(), direct_url.unwrap(), None, None)
    };

    let base = doc_tools_base_dir(&app_data_dir);
    tokio::fs::create_dir_all(&base).await?;
    let downloads = base.join("downloads");
    tokio::fs::create_dir_all(&downloads).await?;
    let archive_path = downloads.join(url_filename(&url));

    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Network(format!("Doc tools download failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Network(format!(
            "Doc tools download failed: HTTP {}",
            response.status()
        )));
    }
    let mut file = tokio::fs::File::create(&archive_path).await?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| AppError::Network(format!("Doc tools stream failed: {e}")))?;
        file.write_all(&chunk).await?;
    }
    file.flush().await?;

    let out_dir = version_dir(&base, &version);
    tokio::fs::create_dir_all(&out_dir).await?;

    if let Some(expected) = expected_sha.as_deref() {
        let actual = sha256_file(&archive_path).await?;
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(AppError::InvalidPath(format!(
                "Doc tools checksum mismatch: expected {expected}, got {actual}"
            )));
        }
    }

    let status = if platform == NodePlatform::Windows {
        let cmd = format!(
            "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
            archive_path.display(),
            out_dir.display()
        );
        tokio::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(cmd)
            .status()
            .await?
    } else {
        tokio::process::Command::new("tar")
            .arg("-xf")
            .arg(&archive_path)
            .arg("-C")
            .arg(&out_dir)
            .status()
            .await?
    };
    if !status.success() {
        return Err(AppError::InvalidPath(format!(
            "Failed to extract doc tools archive: {status}"
        )));
    }

    write_current_version(&base, &version)?;
    if let Some(bin_hint) = bin_dir_hint {
        let root = find_pack_root(&out_dir).unwrap_or(out_dir.clone());
        let hinted = root.join(bin_hint);
        if hinted.is_dir() {
            env::set_var(DOC_TOOLS_ENV_BIN, hinted);
            env::set_var(DOC_TOOLS_ENV_DIR, root);
        }
    }
    doc_tools_get_status(app).await
}
