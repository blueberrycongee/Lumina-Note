export type OsKind = "windows" | "macos" | "linux" | "unknown";

const WINDOWS_FONT_DIRS = ["C:\\Windows\\Fonts"];
const MAC_FONT_DIRS = [
  "/System/Library/Fonts",
  "/Library/Fonts",
  "{HOME}/Library/Fonts",
];
const LINUX_FONT_DIRS = [
  "/usr/share/fonts",
  "/usr/local/share/fonts",
  "{HOME}/.local/share/fonts",
];

const DEFAULT_FONT_FILES_BY_OS: Record<OsKind, string[]> = {
  windows: [
    "simsun.ttc",
    "msyh.ttc",
    "msyh.ttf",
    "simhei.ttf",
    "arial.ttf",
    "times.ttf",
    "calibri.ttf",
    "cambria.ttc",
  ],
  macos: [
    "PingFang.ttc",
    "Hiragino Sans GB.ttc",
    "Songti.ttc",
    "STHeiti Medium.ttc",
    "Heiti Medium.ttc",
    "Arial.ttf",
    "Times New Roman.ttf",
    "Calibri.ttf",
    "Cambria.ttf",
  ],
  linux: [
    "NotoSansCJK-Regular.ttc",
    "NotoSansCJK-Regular.otf",
    "NotoSans-Regular.ttf",
    "NotoSerif-Regular.ttf",
    "DejaVuSans.ttf",
  ],
  unknown: [],
};

const FONT_FAMILY_FILES: Record<string, string[]> = {
  "simsun": ["simsun.ttc", "Songti.ttc", "PingFang.ttc"],
  "宋体": ["simsun.ttc", "Songti.ttc", "PingFang.ttc"],
  "simhei": ["simhei.ttf", "STHeiti Medium.ttc", "Heiti Medium.ttc", "PingFang.ttc"],
  "黑体": ["simhei.ttf", "STHeiti Medium.ttc", "Heiti Medium.ttc", "PingFang.ttc"],
  "microsoft yahei": ["msyh.ttc", "msyh.ttf", "PingFang.ttc", "Hiragino Sans GB.ttc"],
  "微软雅黑": ["msyh.ttc", "msyh.ttf", "PingFang.ttc", "Hiragino Sans GB.ttc"],
  "times new roman": ["times.ttf", "timesbd.ttf", "Times New Roman.ttf"],
  "arial": ["arial.ttf", "Arial.ttf"],
  "calibri": ["calibri.ttf", "Calibri.ttf"],
  "cambria": ["cambria.ttc", "Cambria.ttf"],
  "songti sc": ["Songti.ttc", "Songti SC.ttc"],
  "heiti sc": ["STHeiti Medium.ttc", "Heiti Medium.ttc"],
  "pingfang sc": ["PingFang.ttc"],
  "hiragino sans gb": ["Hiragino Sans GB.ttc"],
};

export function normalizeFontFamily(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
}

export function osKindFromPlatform(platform?: string | null): OsKind {
  if (!platform) return "unknown";
  const normalized = platform.toLowerCase();
  if (normalized === "macos" || normalized === "darwin") return "macos";
  if (normalized === "windows" || normalized === "win32") return "windows";
  if (normalized === "linux") return "linux";
  return "unknown";
}

function expandHome(dir: string, homeDir?: string): string {
  if (!dir.includes("{HOME}")) return dir;
  if (!homeDir) return dir.replace("{HOME}/", "");
  return dir.replace("{HOME}", homeDir.replace(/[/\\]+$/, ""));
}

export function fontDirsForOs(os: OsKind, homeDir?: string): string[] {
  const dirs =
    os === "windows"
      ? WINDOWS_FONT_DIRS
      : os === "macos"
        ? MAC_FONT_DIRS
        : os === "linux"
          ? LINUX_FONT_DIRS
          : [];
  return dirs.map((dir) => expandHome(dir, homeDir));
}

export function fontFilesForFamily(family: string): string[] {
  const normalized = normalizeFontFamily(family);
  const direct = FONT_FAMILY_FILES[normalized];
  if (direct) return direct;
  const noSpaces = normalized.replace(/\s+/g, "");
  const alias = FONT_FAMILY_FILES[noSpaces];
  return alias ?? [];
}

export function joinFontPath(dir: string, file: string): string {
  const separator = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.replace(/[\\/]+$/, "");
  return `${trimmed}${separator}${file}`;
}

export function buildFontPathsForFiles(
  files: string[],
  os: OsKind,
  homeDir?: string,
): string[] {
  if (files.length === 0) return [];
  const dirs = fontDirsForOs(os, homeDir);
  const results: string[] = [];
  for (const dir of dirs) {
    for (const file of files) {
      results.push(joinFontPath(dir, file));
    }
  }
  return results;
}

export function buildFamilyFontCandidates(
  family: string,
  os: OsKind,
  homeDir?: string,
): string[] {
  return buildFontPathsForFiles(fontFilesForFamily(family), os, homeDir);
}

export function buildFallbackFontCandidates(os: OsKind, homeDir?: string): string[] {
  const fallbackFiles = DEFAULT_FONT_FILES_BY_OS[os] ?? [];
  return buildFontPathsForFiles(fallbackFiles, os, homeDir);
}

