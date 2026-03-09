use std::fs;
use std::path::PathBuf;

fn read_config(name: &str) -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    fs::read_to_string(manifest_dir.join(name)).expect("tauri config should be readable")
}

#[test]
fn macos_window_config_hides_native_title_when_using_overlay() {
    let config = read_config("tauri.macos.conf.json");

    assert!(config.contains("\"hiddenTitle\": true"));
}
