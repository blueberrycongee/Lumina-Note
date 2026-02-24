import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const DEFAULT_PORT = 4173;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_FONT_PATH = "C:\\\\Windows\\\\Fonts\\\\simhei.ttf";

function findEdgeExecutablePath() {
  const candidates = new Set();

  const addCandidate = (p) => {
    if (p && p.trim().length > 0) candidates.add(p.trim());
  };

  const programRoots = [
    process.env.ProgramW6432,
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
    process.env.LOCALAPPDATA,
    process.env.USERPROFILE,
  ].filter(Boolean);

  for (const root of programRoots) {
    addCandidate(path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
  }

  if (process.env.USERPROFILE) {
    addCandidate(
      path.join(
        process.env.USERPROFILE,
        "AppData",
        "Local",
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
    );
  }

  addCandidate("C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe");
  addCandidate("C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe");

  if (process.platform === "win32") {
    const where = spawnSync("where", ["msedge"], { encoding: "utf8" });
    if (where.status === 0 && where.stdout) {
      for (const line of where.stdout.split(/\r?\n/)) {
        addCandidate(line);
      }
    }
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.length < 2) {
    throw new Error(
      "Usage: node scripts/typesetting_export_harness.mjs <docx> <output.pdf> [--baseline <baseline.pdf>] [--port <port>] [--no-server] [--font <path>] [--report <file>] [--layout-out <file>] [--ir-out <file>]",
    );
  }
  const docxPath = args.shift();
  const outPdf = args.shift();
  const options = {
    baseline: null,
    port: DEFAULT_PORT,
    noServer: false,
    fontPath: null,
    reportPath: null,
    layoutPath: null,
    irPath: null,
  };

  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--baseline":
        options.baseline = args.shift() ?? null;
        break;
      case "--port":
        options.port = Number(args.shift() ?? DEFAULT_PORT);
        break;
      case "--no-server":
        options.noServer = true;
        break;
      case "--report":
        options.reportPath = args.shift() ?? null;
        break;
      case "--layout-out":
        options.layoutPath = args.shift() ?? null;
        break;
      case "--ir-out":
        options.irPath = args.shift() ?? null;
        break;
      case "--font":
        options.fontPath = args.shift() ?? null;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  return { docxPath, outPdf, options };
}

function resolveFontPath(userPath) {
  if (userPath) return userPath;
  try {
    if (fs.existsSync(DEFAULT_FONT_PATH)) return DEFAULT_FONT_PATH;
  } catch {
    // ignore
  }
  return null;
}

async function waitForServer(origin, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(origin, { method: "GET" });
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Dev server did not respond at ${origin}`);
}

function spawnDevServer(port) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawn(npm, ["run", "dev", "--", "--host", DEFAULT_HOST, "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
}

function runDiff(baseline, candidate) {
  const node = process.execPath ?? "node";
  return new Promise((resolve, reject) => {
    const proc = spawn(
      node,
      ["scripts/typesetting_pdf_diff.mjs", baseline, candidate],
      { stdio: "inherit" },
    );
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pdf diff failed (code=${code})`));
    });
  });
}

function runMetricsDiff(baseline, candidate) {
  const node = process.execPath ?? "node";
  return new Promise((resolve, reject) => {
    const proc = spawn(
      node,
      ["scripts/typesetting_pdf_metrics_diff.mjs", baseline, candidate],
      { stdio: "inherit" },
    );
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pdf metrics diff failed (code=${code})`));
    });
  });
}

async function main() {
  const { docxPath, outPdf, options } = parseArgs(process.argv.slice(2));
  const edge = findEdgeExecutablePath();
  if (!edge) {
    throw new Error("Microsoft Edge not found.");
  }

  const startedAt = Date.now();
  const absoluteDocx = path.resolve(docxPath);
  const absolutePdf = path.resolve(outPdf);
  const origin = `http://${DEFAULT_HOST}:${options.port}`;
  let server = null;

  if (!options.noServer) {
    server = spawnDevServer(options.port);
  }

  try {
    if (!options.noServer) {
      await waitForServer(origin, 60_000);
    }

    const browser = await chromium.launch({
      headless: true,
      executablePath: edge,
    });
    const page = await browser.newPage();
    page.on("console", (msg) => {
      console.log(`[page:${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      console.error("[page:error]", err);
    });

    const harnessUrl = `${origin}/?typesettingHarness=1`;
    await page.goto(harnessUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__luminaTypesettingHarness, { timeout: 60_000 });

    const fontPath = resolveFontPath(options.fontPath);
    if (fontPath) {
      const fontBase64 = fs.readFileSync(fontPath).toString("base64");
      await page.evaluate(
        async ({ payload, name }) => {
          await window.__luminaTypesettingHarness.setFontBase64(payload, "SimHei", name);
        },
        { payload: fontBase64, name: path.basename(fontPath) },
      );
    } else {
      console.warn("No CJK font found; PDF text may be missing.");
    }

    const base64 = fs.readFileSync(absoluteDocx).toString("base64");
    await page.evaluate(
      async ({ payload, name }) => {
        await window.__luminaTypesettingHarness.loadDocxBase64(payload, name);
      },
      { payload: base64, name: path.basename(absoluteDocx) },
    );

    const readyDeadline = Date.now() + 120_000;
    let ready = false;
    let lastLog = 0;
    while (Date.now() < readyDeadline) {
      const status = await page.evaluate(() => window.__luminaTypesettingStatus ?? null);
      ready = Boolean(status?.ready);
      if (ready) {
        break;
      }
      const now = Date.now();
      if (now - lastLog > 5000) {
        console.log("Waiting for typesetting harness...", status);
        lastLog = now;
      }
      await page.waitForTimeout(1000);
    }
    if (!ready) {
      const status = await page.evaluate(() => window.__luminaTypesettingStatus ?? null);
      throw new Error(`Typesetting harness not ready: ${JSON.stringify(status)}`);
    }

    const pdfBase64 = await page.evaluate(async () => {
      return window.__luminaTypesettingHarness.exportPdfBase64();
    });

    fs.mkdirSync(path.dirname(absolutePdf), { recursive: true });
    fs.writeFileSync(absolutePdf, Buffer.from(pdfBase64, "base64"));

    if (options.layoutPath) {
      const layoutJson = await page.evaluate(async () => {
        return window.__luminaTypesettingHarness.exportLayoutJson();
      });
      fs.mkdirSync(path.dirname(options.layoutPath), { recursive: true });
      fs.writeFileSync(options.layoutPath, layoutJson, "utf8");
    }

    if (options.irPath) {
      const irJson = await page.evaluate(async () => {
        return window.__luminaTypesettingHarness.exportIrJson();
      });
      fs.mkdirSync(path.dirname(options.irPath), { recursive: true });
      fs.writeFileSync(options.irPath, irJson, "utf8");
    }

    if (options.reportPath) {
      const durationMs = Date.now() - startedAt;
      const report = {
        inputDocx: absoluteDocx,
        outputPdf: absolutePdf,
        durationMs,
        layoutPath: options.layoutPath ? path.resolve(options.layoutPath) : null,
        irPath: options.irPath ? path.resolve(options.irPath) : null,
      };
      fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
      fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2), "utf8");
    }

    await browser.close();

    if (options.baseline) {
      await runDiff(path.resolve(options.baseline), absolutePdf);
      await runMetricsDiff(path.resolve(options.baseline), absolutePdf);
    }
  } finally {
    if (server) {
      if (process.platform === "win32" && server.pid) {
        spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        server.kill();
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
