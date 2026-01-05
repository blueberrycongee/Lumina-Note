import * as fs from 'fs';
import * as path from 'path';

// Script to generate latest.json for Tauri v2 updater.
// Supports macOS (aarch64 and x86_64).

interface PlatformInfo {
    signature: string;
    url: string;
}

interface UpdaterInfo {
    version: string;
    notes: string;
    pub_date: string;
    platforms: {
        [key: string]: PlatformInfo;
    };
}

function getVersion(): string {
    const confPath = path.resolve(process.cwd(), 'src-tauri', 'tauri.conf.json');
    const conf = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
    return conf.version;
}

function getSignature(platform: string, arch: string): string {
    // Tauri v2 artifacts are usually in target/release/bundle/macos/ or target/release/bundle/dmg/
    // For updater, it uses .app.tar.gz
    const sigPath = path.resolve(process.cwd(), 'src-tauri', 'target', 'release', 'bundle', 'macos', `lumina-note.app.tar.gz.sig`);

    if (fs.existsSync(sigPath)) {
        return fs.readFileSync(sigPath, 'utf-8').trim();
    }

    // Fallback check in other possible locations if needed
    console.warn(`Signature not found at ${sigPath}`);
    return '';
}

function generate(): void {
    const version = getVersion();
    const notes = `Lumina Note version ${version}`;
    const pub_date = new Date().toISOString();

    const repo = "ccasJay/Lumina-Note";
    const baseUrl = `https://github.com/${repo}/releases/download/v${version}`;

    // We generate entries for both macOS architectures. 
    // In a real CI, you might only have one available at a time, 
    // but we can prepare the structure.
    const info: UpdaterInfo = {
        version,
        notes,
        pub_date,
        platforms: {
            "darwin-aarch64": {
                signature: getSignature("darwin", "aarch64"),
                url: `${baseUrl}/lumina-note_aarch64.app.tar.gz`
            },
            "darwin-x86_64": {
                signature: getSignature("darwin", "x86_64"),
                url: `${baseUrl}/lumina-note_x86_64.app.tar.gz`
            }
        }
    };

    const outPath = path.resolve(process.cwd(), 'latest.json');
    fs.writeFileSync(outPath, JSON.stringify(info, null, 2));
    console.log('Generated latest.json at', outPath);
}

generate();
