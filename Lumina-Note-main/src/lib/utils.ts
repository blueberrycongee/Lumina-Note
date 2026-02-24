import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Extract filename without extension
 */
export function getFileName(path: string): string {
  const name = path.split(/[/\\]/).pop() || "";
  return name.replace(/\.md$/, "");
}

/**
 * Get relative path from vault root
 */
export function getRelativePath(fullPath: string, vaultPath: string): string {
  return fullPath.replace(vaultPath, "").replace(/^[/\\]/, "");
}
