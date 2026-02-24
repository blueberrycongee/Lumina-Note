import * as fs from 'fs';
import * as path from 'path';

// Script to generate latest.json for Tauri v2 updater.
// Supports macOS (aarch64, x86_64) and Windows (x64).

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

interface AssetMatch {
    signature: string;
    assetName: string;
    signaturePath: string;
}

function getVersion(): string {
    const confPath = path.resolve(process.cwd(), 'src-tauri', 'tauri.conf.json');
    const conf = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
    return conf.version;
}

function getSignatureSearchDirs(): string[] {
    return [
        process.cwd(),
        path.resolve(process.cwd(), 'src-tauri', 'target', 'release', 'bundle', 'macos'),
        path.resolve(process.cwd(), 'src-tauri', 'target', 'release', 'bundle', 'nsis'),
        path.resolve(process.cwd(), 'src-tauri', 'target', 'release', 'bundle', 'msi'),
    ];
}

function findAssetSignature(assetNames: string[]): AssetMatch | null {
    const dirs = getSignatureSearchDirs();

    for (const assetName of assetNames) {
        const sigFile = `${assetName}.sig`;
        for (const dir of dirs) {
            const sigPath = path.resolve(dir, sigFile);
            if (!fs.existsSync(sigPath)) continue;

            const signature = fs.readFileSync(sigPath, 'utf-8').trim();
            if (!signature) continue;

            return {
                signature,
                assetName,
                signaturePath: sigPath,
            };
        }
    }

    return null;
}

function addPlatform(
    info: UpdaterInfo,
    key: string,
    assetCandidates: string[],
    baseUrl: string
): void {
    const match = findAssetSignature(assetCandidates);

    if (!match) {
        console.warn(`[updater] Signature not found for ${key}. candidates=${assetCandidates.join(', ')}`);
        return;
    }

    info.platforms[key] = {
        signature: match.signature,
        url: `${baseUrl}/${match.assetName}`,
    };
    console.log(`[updater] ${key} -> ${match.assetName} (sig: ${path.basename(match.signaturePath)})`);
}

function generate(): void {
    const version = getVersion();
    const notes = `Lumina Note version ${version}`;
    const pub_date = new Date().toISOString();

    const repo = process.env.GITHUB_REPOSITORY || "blueberrycongee/Lumina-Note";
    const baseUrl = `https://github.com/${repo}/releases/download/v${version}`;

    const info: UpdaterInfo = {
        version,
        notes,
        pub_date,
        platforms: {}
    };

    addPlatform(info, "darwin-aarch64", [
        `lumina-note_aarch64.app.tar.gz`,
        `lumina-note_${version}_aarch64.app.tar.gz`,
    ], baseUrl);

    addPlatform(info, "darwin-x86_64", [
        `lumina-note_x64.app.tar.gz`,
        `lumina-note_${version}_x64.app.tar.gz`,
    ], baseUrl);

    addPlatform(info, "windows-x86_64", [
        `lumina-note_${version}_x64-setup.exe`,
        `lumina-note_x64-setup.exe`,
        `lumina-note_${version}_x64-setup.nsis.zip`,
        `lumina-note_x64-setup.nsis.zip`,
        `lumina-note_${version}_x64_en-US.msi`,
        `lumina-note_x64_en-US.msi`,
        `lumina-note_${version}_x64_en-US.msi.zip`,
        `lumina-note_x64_en-US.msi.zip`,
    ], baseUrl);

    if (Object.keys(info.platforms).length === 0) {
        throw new Error("[updater] No platform signatures found. latest.json would be invalid for auto update.");
    }

    const outPath = path.resolve(process.cwd(), 'latest.json');
    fs.writeFileSync(outPath, JSON.stringify(info, null, 2));
    console.log('Generated latest.json at', outPath);
}

generate();
