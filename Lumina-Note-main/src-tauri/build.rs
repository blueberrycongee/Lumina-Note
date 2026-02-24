use std::fs;
use std::path::Path;

fn main() {
    // Ensure Cargo reruns build script when plugin/resources directories change,
    // including newly added files.
    println!("cargo:rerun-if-changed=resources/plugins");
    println!("cargo:rerun-if-changed=resources/skills");
    println!("cargo:rerun-if-changed=resources/node");

    // tauri-build >=2.5 expects `DEP_TAURI_DEV` to be set via a dependency build script.
    // In some environments (e.g. running `cargo test` directly), it may be missing.
    // Fall back to Cargo's `PROFILE` so builds don't panic during the build script.
    if std::env::var_os("DEP_TAURI_DEV").is_none() {
        let is_dev = std::env::var("PROFILE")
            .map(|p| p == "debug")
            .unwrap_or(true);
        std::env::set_var("DEP_TAURI_DEV", if is_dev { "true" } else { "false" });
    }

    // Create a minimal valid ICO file if it doesn't exist
    let icons_dir = Path::new("icons");
    let icon_path = icons_dir.join("icon.ico");

    if !icon_path.exists() {
        fs::create_dir_all(icons_dir).ok();

        // Minimal 16x16 ICO file (purple square)
        let ico_data: Vec<u8> = vec![
            // ICO header
            0x00, 0x00, // Reserved
            0x01, 0x00, // Type: ICO
            0x01, 0x00, // Number of images: 1
            // Image entry
            0x10, // Width: 16
            0x10, // Height: 16
            0x00, // Color palette: 0 (no palette)
            0x00, // Reserved
            0x01, 0x00, // Color planes: 1
            0x20, 0x00, // Bits per pixel: 32
            0x68, 0x04, 0x00, 0x00, // Image size: 1128 bytes
            0x16, 0x00, 0x00, 0x00, // Image offset: 22
            // BMP header (BITMAPINFOHEADER)
            0x28, 0x00, 0x00, 0x00, // Header size: 40
            0x10, 0x00, 0x00, 0x00, // Width: 16
            0x20, 0x00, 0x00, 0x00, // Height: 32 (16*2 for ICO)
            0x01, 0x00, // Planes: 1
            0x20, 0x00, // Bits per pixel: 32
            0x00, 0x00, 0x00, 0x00, // Compression: none
            0x00, 0x04, 0x00, 0x00, // Image size
            0x00, 0x00, 0x00, 0x00, // X pixels per meter
            0x00, 0x00, 0x00, 0x00, // Y pixels per meter
            0x00, 0x00, 0x00, 0x00, // Colors used
            0x00, 0x00, 0x00, 0x00, // Important colors
        ];

        // Add 16x16 pixels (BGRA format) - purple color
        let mut full_ico = ico_data;
        for _ in 0..256 {
            full_ico.extend_from_slice(&[0xF6, 0x63, 0x63, 0xFF]); // Purple (BGRA)
        }
        // Add mask (16x16 bits = 64 bytes, all zeros = fully opaque)
        for _ in 0..64 {
            full_ico.push(0x00);
        }

        fs::write(&icon_path, full_ico).ok();
    }

    tauri_build::build();
}
