// @vitest-environment node
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { webkit, type Browser, type Page } from "playwright-core";

const isMac = process.platform === "darwin";
const shouldRun = Boolean(process.env.WEBKIT_E2E);

async function startViteServer() {
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
    throw new Error("Failed to resolve dev server address");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function getVisibleSelectionCount(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller");
    if (!scroller) return 0;
    const scrollerRect = scroller.getBoundingClientRect();
    const selections = Array.from(document.querySelectorAll(".cm-selectionBackground"));
    return selections.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
    }).length;
  });
}

describe("CodeMirror select-all (WebKit e2e)", () => {
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;

  afterEach(async () => {
    if (browser) {
      await browser.close();
      browser = null;
    }
    if (server) {
      await server.close();
      server = null;
    }
  });

  it.skipIf(!shouldRun || !isMac)(
    "keeps selection highlight visible after scrolling",
    async () => {
      const { server: startedServer, baseUrl } = await startViteServer();
      server = startedServer;

      browser = await webkit.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/e2e/select-all.html`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".cm-editor");
      await page.waitForFunction(() => Boolean((window as any).__cmView));

      await page.click(".cm-content");
      await page.keyboard.press("Meta+A");

      await page.waitForFunction(() => {
        return document.querySelector(".cm-selectionLayer") !== null;
      });

      const selectionState = await page.evaluate(() => {
        const view = (window as typeof window & { __cmView?: any }).__cmView;
        if (!view) return null;
        return {
          from: view.state.selection.main.from,
          to: view.state.selection.main.to,
          length: view.state.doc.length,
        };
      });

      expect(selectionState?.from).toBe(0);
      expect(selectionState?.to).toBe(selectionState?.length);

      await page.waitForFunction(() => {
        const scroller = document.querySelector(".cm-scroller");
        if (!scroller) return false;
        const scrollerRect = scroller.getBoundingClientRect();
        const selections = Array.from(document.querySelectorAll(".cm-selectionBackground"));
        return selections.some((el) => {
          const rect = el.getBoundingClientRect();
          return rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
        });
      });
      const beforeCount = await getVisibleSelectionCount(page);
      expect(beforeCount).toBeGreaterThan(0);

      await page.evaluate(() => {
        const scroller = document.querySelector(".cm-scroller");
        if (scroller) {
          scroller.scrollTop = scroller.scrollHeight;
        }
      });

      await page.waitForTimeout(100);
      const afterCount = await getVisibleSelectionCount(page);
      expect(afterCount).toBeGreaterThan(0);
    },
    30_000,
  );
});
