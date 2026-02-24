/**
 * Path utilities - cross-platform path handling
 */

/**
 * Join path segments
 */
export function join(...parts: string[]): string {
  // Normalize separators and join
  return parts
    .map((part) => part.replace(/\\/g, "/"))
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/");
}

/**
 * Get directory name from path
 */
export function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";
  return normalized.substring(0, lastSlash);
}

/**
 * Get base name from path
 */
export function basename(path: string, ext?: string): string {
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  let name = lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1);
  
  if (ext && name.endsWith(ext)) {
    name = name.substring(0, name.length - ext.length);
  }
  
  return name;
}

/**
 * Get file extension
 */
export function extname(path: string): string {
  const name = basename(path);
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return "";
  return name.substring(lastDot);
}

/**
 * Check if path is absolute
 */
export function isAbsolute(path: string): boolean {
  // Windows absolute: C:\ or \\
  if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
  if (path.startsWith("\\\\")) return true;
  // Unix absolute: /
  if (path.startsWith("/")) return true;
  return false;
}

/**
 * Resolve relative path from base
 */
export function resolve(base: string, relative: string): string {
  if (isAbsolute(relative)) return relative;
  return join(base, relative);
}

/**
 * Get relative path from one path to another
 */
export function relative(from: string, to: string): string {
  const fromParts = from.replace(/\\/g, "/").split("/").filter(Boolean);
  const toParts = to.replace(/\\/g, "/").split("/").filter(Boolean);
  
  // Find common prefix
  let commonLength = 0;
  for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++;
    } else {
      break;
    }
  }
  
  // Build relative path
  const upCount = fromParts.length - commonLength;
  const ups = Array(upCount).fill("..");
  const remaining = toParts.slice(commonLength);
  
  return [...ups, ...remaining].join("/") || ".";
}

/**
 * Normalize path (remove . and ..)
 */
export function normalize(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const result: string[] = [];
  
  for (const part of parts) {
    if (part === "..") {
      result.pop();
    } else if (part !== "." && part !== "") {
      result.push(part);
    }
  }
  
  return result.join("/") || ".";
}
