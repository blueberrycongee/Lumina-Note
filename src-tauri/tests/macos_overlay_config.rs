use std::fs;
use std::path::PathBuf;

fn read_config(name: &str) -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    fs::read_to_string(manifest_dir.join(name)).expect("config should be readable")
}

#[test]
fn macos_uses_creation_time_overlay_titlebar_config() {
    let macos_config = read_config("tauri.macos.conf.json");
    let main_rs = read_config("src/main.rs");

    assert!(macos_config.contains("\"macOSPrivateApi\": true"));
    assert!(macos_config.contains("\"decorations\": true"));
    assert!(macos_config.contains("\"titleBarStyle\": \"Overlay\""));
    assert!(macos_config.contains("\"hiddenTitle\": true"));
    assert!(macos_config.contains("\"trafficLightPosition\""));
    assert!(macos_config.contains("\"x\": 14"));
    assert!(macos_config.contains("\"y\": 16"));
    assert!(!main_rs.contains("window.set_decorations(true)"));
    assert!(!main_rs.contains("window.set_title_bar_style(TitleBarStyle::Overlay)"));
}
