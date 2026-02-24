use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodePlatform {
    Windows,
    Macos,
    Linux,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeArch {
    X64,
    Arm64,
}

pub fn node_runtime_version() -> &'static str {
    include_str!("../../node-runtime-version.txt").trim()
}

pub fn platform_tag(platform: NodePlatform) -> &'static str {
    match platform {
        NodePlatform::Windows => "win",
        NodePlatform::Macos => "darwin",
        NodePlatform::Linux => "linux",
    }
}

pub fn arch_tag(arch: NodeArch) -> &'static str {
    match arch {
        NodeArch::X64 => "x64",
        NodeArch::Arm64 => "arm64",
    }
}

pub fn node_binary_name(platform: NodePlatform) -> &'static str {
    match platform {
        NodePlatform::Windows => "node.exe",
        _ => "node",
    }
}

pub fn node_archive_name(version: &str, platform: NodePlatform, arch: NodeArch) -> Option<String> {
    let platform_tag = platform_tag(platform);
    let arch_tag = arch_tag(arch);
    let ext = match platform {
        NodePlatform::Windows => "zip",
        NodePlatform::Macos | NodePlatform::Linux => "tar.xz",
    };
    Some(format!("node-v{version}-{platform_tag}-{arch_tag}.{ext}"))
}

pub fn node_archive_url(version: &str, platform: NodePlatform, arch: NodeArch) -> Option<String> {
    let name = node_archive_name(version, platform, arch)?;
    Some(format!("https://nodejs.org/dist/v{version}/{name}"))
}

pub fn node_extracted_dir(version: &str, platform: NodePlatform, arch: NodeArch) -> String {
    format!(
        "node-v{version}-{}-{}",
        platform_tag(platform),
        arch_tag(arch)
    )
}

pub fn node_runtime_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("codex").join("node")
}

pub fn node_binary_path_in_dir(dir: &Path, platform: NodePlatform) -> PathBuf {
    dir.join(node_binary_name(platform))
}

pub fn current_platform() -> NodePlatform {
    if cfg!(target_os = "windows") {
        NodePlatform::Windows
    } else if cfg!(target_os = "macos") {
        NodePlatform::Macos
    } else {
        NodePlatform::Linux
    }
}

pub fn current_arch() -> NodeArch {
    if cfg!(target_arch = "aarch64") {
        NodeArch::Arm64
    } else {
        NodeArch::X64
    }
}

pub fn candidate_node_paths(
    resource_dir: Option<&Path>,
    app_data_dir: Option<&Path>,
    platform: NodePlatform,
) -> Vec<PathBuf> {
    let binary = node_binary_name(platform);
    let mut candidates = Vec::new();

    if let Some(resource_dir) = resource_dir {
        candidates.push(resource_dir.join(binary));
        candidates.push(resource_dir.join("node").join(binary));
        candidates.push(resource_dir.join("node").join("bin").join(binary));
        candidates.push(resource_dir.join("resources").join("node").join(binary));
    }

    if let Some(app_data_dir) = app_data_dir {
        candidates.push(app_data_dir.join("codex").join("node").join(binary));
    }

    candidates
}

pub fn resolve_node_path(
    resource_dir: Option<&Path>,
    app_data_dir: Option<&Path>,
    platform: NodePlatform,
) -> Option<PathBuf> {
    if let Ok(env_path) = std::env::var("LUMINA_NODE_PATH") {
        let candidate = PathBuf::from(env_path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    for candidate in candidate_node_paths(resource_dir, app_data_dir, platform) {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

pub async fn download_node_runtime(app_data_dir: &Path) -> Result<PathBuf, String> {
    let version = node_runtime_version();
    let platform = current_platform();
    let arch = current_arch();
    let archive_name = node_archive_name(version, platform, arch)
        .ok_or_else(|| "Unsupported platform for Node runtime download".to_string())?;
    let url = node_archive_url(version, platform, arch)
        .ok_or_else(|| "Unsupported platform for Node runtime download".to_string())?;
    let shasums_url = format!("https://nodejs.org/dist/v{version}/SHASUMS256.txt");

    let runtime_dir = node_runtime_dir(app_data_dir);
    tokio::fs::create_dir_all(&runtime_dir)
        .await
        .map_err(|e| format!("Failed to create runtime dir: {e}"))?;

    let temp_dir = std::env::temp_dir().join(format!("lumina-node-{version}"));
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let archive_path = temp_dir.join(&archive_name);

    let shasums_response = reqwest::get(&shasums_url)
        .await
        .map_err(|e| format!("Failed to download Node SHASUMS: {e}"))?;
    if !shasums_response.status().is_success() {
        return Err(format!(
            "Failed to download Node SHASUMS: HTTP {}",
            shasums_response.status()
        ));
    }
    let shasums_text = shasums_response
        .text()
        .await
        .map_err(|e| format!("Failed to read Node SHASUMS: {e}"))?;
    let expected_hash = shasums_text
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let hash = parts.next()?;
            let name = parts.next()?;
            if name == archive_name {
                Some(hash.to_string())
            } else {
                None
            }
        })
        .next()
        .ok_or_else(|| format!("Checksum not found for {}", archive_name))?;

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download Node runtime: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to download Node runtime: HTTP {}",
            response.status()
        ));
    }

    let mut file = tokio::fs::File::create(&archive_path)
        .await
        .map_err(|e| format!("Failed to create archive file: {e}"))?;
    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read download stream: {e}"))?;
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write archive file: {e}"))?;
    }
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush archive file: {e}"))?;
    let actual_hash = hex::encode(hasher.finalize());
    if actual_hash != expected_hash {
        return Err(format!(
            "Node runtime checksum mismatch: expected {}, got {}",
            expected_hash, actual_hash
        ));
    }

    let extract_dir = temp_dir.join("extract");
    tokio::fs::create_dir_all(&extract_dir)
        .await
        .map_err(|e| format!("Failed to create extract dir: {e}"))?;

    let status = if platform == NodePlatform::Windows {
        let cmd = format!(
            "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
            archive_path.display(),
            extract_dir.display()
        );
        tokio::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(cmd)
            .status()
            .await
            .map_err(|e| format!("Failed to run PowerShell for Node runtime: {e}"))?
    } else {
        tokio::process::Command::new("tar")
            .arg("-xf")
            .arg(&archive_path)
            .arg("-C")
            .arg(&extract_dir)
            .status()
            .await
            .map_err(|e| format!("Failed to run tar for Node runtime: {e}"))?
    };
    if !status.success() {
        return Err(format!("Failed to extract Node runtime archive: {status}"));
    }

    let extracted_root = extract_dir.join(node_extracted_dir(version, platform, arch));
    let binary_source = match platform {
        NodePlatform::Windows => extracted_root.join("node.exe"),
        _ => extracted_root.join("bin").join("node"),
    };
    if !binary_source.is_file() {
        return Err("Extracted Node binary not found".to_string());
    }

    let binary_target = node_binary_path_in_dir(&runtime_dir, platform);
    tokio::fs::copy(&binary_source, &binary_target)
        .await
        .map_err(|e| format!("Failed to copy Node binary: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&binary_target)
            .map_err(|e| format!("Failed to read Node permissions: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&binary_target, perms)
            .map_err(|e| format!("Failed to set Node permissions: {e}"))?;
    }

    Ok(binary_target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_archive_name_and_url() {
        let name = node_archive_name("20.11.1", NodePlatform::Macos, NodeArch::Arm64).unwrap();
        assert_eq!(name, "node-v20.11.1-darwin-arm64.tar.xz");

        let url = node_archive_url("20.11.1", NodePlatform::Windows, NodeArch::X64).unwrap();
        assert_eq!(
            url,
            "https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip"
        );
    }

    #[test]
    fn builds_extracted_dir() {
        let dir = node_extracted_dir("20.11.1", NodePlatform::Linux, NodeArch::X64);
        assert_eq!(dir, "node-v20.11.1-linux-x64");
    }

    #[test]
    fn candidate_paths_include_resources_and_appdata() {
        let resource = Path::new("/tmp/resources");
        let app_data = Path::new("/tmp/appdata");
        let candidates = candidate_node_paths(Some(resource), Some(app_data), NodePlatform::Macos);
        assert!(candidates.contains(&resource.join("node")));
        assert!(candidates.contains(&resource.join("node").join("node")));
        assert!(candidates.contains(&resource.join("node").join("bin").join("node")));
        assert!(candidates.contains(&resource.join("resources").join("node").join("node")));
        assert!(candidates.contains(&app_data.join("codex").join("node").join("node")));
    }
}
