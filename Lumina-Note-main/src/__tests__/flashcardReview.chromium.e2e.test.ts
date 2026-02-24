// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Browser, Page } from "playwright-core";
import type { ViteDevServer } from "vite";
import {
  findChromiumExecutablePath,
  launchChromiumForE2E,
  startE2EViteServer,
} from "./helpers/playwrightHarness";

const shouldRun = Boolean(process.env.FLASHCARD_E2E) && Boolean(findChromiumExecutablePath());

function mockSystemDate(page: Page, isoDate: string) {
  return page.addInitScript((fixedIso) => {
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedIso);
          return;
        }
        super(args[0]);
      }

      static now() {
        return new RealDate(fixedIso).getTime();
      }
    }

    // @ts-expect-error test-only monkey patch
    window.Date = MockDate;
  }, isoDate);
}

describe("Flashcard review regression (chromium e2e)", () => {
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;

  afterEach(async () => {
    vi.useRealTimers();
    if (browser) {
      await browser.close();
      browser = null;
    }
    if (server) {
      await server.close();
      server = null;
    }
  });

  it.skipIf(!shouldRun)("shows no-cards message instead of fake completion when no due cards", async () => {
    const started = await startE2EViteServer();
    server = started.server;
    browser = await launchChromiumForE2E();
    const page = await browser.newPage();

    await page.goto(`${started.baseUrl}/e2e/flashcard-review-repro.html?scenario=no-due`, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector("text=没有待复习的卡片");
    const bodyText = await page.textContent("body");

    expect(bodyText).toContain("没有待复习的卡片");
    expect(bodyText).not.toContain("复习完成！");
  }, 30_000);

  it.skipIf(!shouldRun)("never renders negative interval label when date crosses month", async () => {
    const started = await startE2EViteServer();
    server = started.server;
    browser = await launchChromiumForE2E();
    const page = await browser.newPage();

    await mockSystemDate(page, "2026-01-30T10:00:00.000Z");
    await page.goto(`${started.baseUrl}/e2e/flashcard-review-repro.html?scenario=negative-interval`, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector("text=Question");
    await page.click("text=Question");

    await page.waitForSelector("text=困难");
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toMatch(/-\d+天/);
  }, 30_000);
});
