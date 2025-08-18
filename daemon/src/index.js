#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const port = process.env.PORT ? Number(process.env.PORT) : 8787;

function json(res, code, data) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleRender(req, res) {
  try {
    const bodyRaw = await readBody(req);
    let payload = {};
    try { payload = bodyRaw ? JSON.parse(bodyRaw) : {}; } catch (_) {}
    const url = (payload.url || "").trim();
    const outDir = (payload.outDir || "").trim();
    if (!url) { return json(res, 400, { error: "url is required" }); }

    // Lazy import Playwright if available
    let pw;
    if (!process.env.DOCUDEX_DISABLE_BROWSER) {
      try {
        // eslint-disable-next-line import/no-extraneous-dependencies
        pw = await import("playwright");
      } catch (e) {
        // not installed; fall through to 501
      }
    }

    if (!pw) {
      return json(res, 501, { error: "playwright not installed", hint: "npm i -D playwright && npx playwright install", url });
    }

    const browser = await pw.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const title = await page.title();
    const html = await page.content();

    // Write artifacts
    const baseDir = outDir || path.join(process.cwd(), ".docudex-cache");
    const stamp = Date.now().toString();
    const runDir = path.join(baseDir, stamp);
    fs.mkdirSync(runDir, { recursive: true });
    const finalHtmlPath = path.join(runDir, "final.html");
    fs.writeFileSync(finalHtmlPath, html, "utf8");

    // optional screenshot
    let screenshotPath = "";
    try {
      screenshotPath = path.join(runDir, "page.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (_) {
      screenshotPath = "";
    }

    await ctx.close();
    await browser.close();

    return json(res, 200, {
      url,
      title,
      final_html: finalHtmlPath,
      screenshot: screenshotPath || undefined,
    });
  } catch (err) {
    return json(res, 500, { error: "render failed", message: String(err && err.message || err) });
  }
}

const server = http.createServer(async (req, res) => {
  // Simple CORS for local tools
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url && (req.url === "/" || req.url.startsWith("/health"))) {
    const body = { status: "ok", port, browser: process.env.DOCUDEX_DISABLE_BROWSER ? "disabled" : "auto" };
    json(res, 200, body);
    return;
  }

  if (req.method === "POST" && req.url === "/render") {
    await handleRender(req, res);
    return;
  }

  json(res, 404, { error: "not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`docudex daemon listening on http://127.0.0.1:${port}`);
});
