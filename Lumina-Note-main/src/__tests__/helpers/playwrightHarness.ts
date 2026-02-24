// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, type Browser } from "playwright-core";

export async function startE2EViteServer(): Promise<{ server: ViteDevServer; baseUrl: string }> {
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "src"),
      },
    },
    clearScreen: false,
    optimizeDeps: {
      // Restrict scan to dedicated e2e entry to avoid crawling third_party HTML fixtures.
      entries: ["e2e/flashcard-review-repro.html"],
    },
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
    },
  });

  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Failed to resolve E2E dev server address");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

export function findChromiumExecutablePath(): string | null {
  const candidates: string[] = [];
  const envPath = process.env.CHROMIUM_PATH;
  if (envPath) {
    candidates.push(envPath);
  }

  if (process.platform === "darwin") {
    const homeDir = process.env.HOME;
    if (homeDir) {
      candidates.push(
        path.join(
          homeDir,
          "Library",
          "Caches",
          "ms-playwright",
          "chromium-1200",
          "chrome-mac-arm64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        ),
        path.join(
          homeDir,
          "Library",
          "Caches",
          "ms-playwright",
          "chromium-1208",
          "chrome-mac-arm64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        ),
      );
    }
    candidates.push(
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    );
  }

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    } catch {
      // ignore candidate probe errors
    }
  }

  return null;
}

export async function launchChromiumForE2E(): Promise<Browser> {
  const executablePath = findChromiumExecutablePath();
  if (!executablePath) {
    throw new Error("No Chromium-family executable found for Playwright E2E run");
  }

  return chromium.launch({
    headless: true,
    executablePath,
  });
}
