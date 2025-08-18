#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
// import os from "node:os";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
const VERSION = "0.1.0";
const startTimeMs = Date.now();
const schemaVersion = "0.1.0";
const maxParallel = Number(process.env.GRAIL_MAX_PARALLEL || 4);
const requestsPerSecond = Number(process.env.GRAIL_RPS || 4);
const cacheBaseEnv = process.env.GRAIL_CACHE_DIR || ".grail-cache";
const maxCacheRuns = Number(process.env.GRAIL_CACHE_MAX_RUNS || 30);

let activeRequests = 0;
const pendingQueue = [];
let lastRequestTimestamps = [];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireSlot() {
  if (activeRequests < maxParallel) {
    activeRequests += 1;
    return;
  }
  await new Promise(resolve => pendingQueue.push(resolve));
  activeRequests += 1;
}

function releaseSlot() {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = pendingQueue.shift();
  if (next) next();
}

async function rateLimit() {
  const now = Date.now();
  // purge timestamps older than 1s
  lastRequestTimestamps = lastRequestTimestamps.filter(t => now - t < 1000);
  if (lastRequestTimestamps.length >= requestsPerSecond) {
    const waitMs = 1000 - (now - lastRequestTimestamps[0]);
    if (waitMs > 0) await sleep(waitMs);
  }
  lastRequestTimestamps.push(Date.now());
}

function json(res, code, data) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function logError(context, err) {
  try {
    const msg = err && err.message ? err.message : String(err);
    // Keep terse to avoid noise in tests/CI
    // eslint-disable-next-line no-console
    console.error(`[grail] ${context}: ${msg}`);
  } catch (_) { /* ignore logging errors */ }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

let pwModule;
let sharedBrowser = null;
async function getPlaywright() {
  if (!pwModule && !process.env.GRAIL_DISABLE_BROWSER) {
    try { pwModule = await import("playwright"); } catch (_) { pwModule = null; }
  }
  return pwModule;
}

async function getBrowser() {
  const pw = await getPlaywright();
  if (!pw) return null;
  if (!sharedBrowser) {
    sharedBrowser = await pw.chromium.launch({ headless: true });
  }
  return sharedBrowser;
}

async function renderUrlWithPlaywright(browser, url, wait) {
  const waitStrategy = (wait && wait.strategy) || "networkidle";
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: ["networkidle", "load", "domcontentloaded"].includes(waitStrategy) ? "networkidle" : "load", timeout: 30000 });
      if (waitStrategy === "selector" && wait && wait.selector) {
        await page.waitForSelector(wait.selector, { timeout: 10000 });
      } else if (waitStrategy === "timeout" && wait && typeof wait.ms === "number") {
        await sleep(Math.max(0, wait.ms));
      }
      const title = await page.title();
      const html = await page.content();
      return { ctx, page, title, html };
    } catch (err) {
      lastErr = err;
      try { await ctx.close(); } catch (_) { /* ignore context close error */ }
      const backoff = 300 + Math.floor(Math.random() * 300) * (attempt + 1);
      await sleep(backoff);
    }
  }
  throw lastErr || new Error("render failed after retries");
}

function ensureAbsolute(p) {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function ensureRunDir(baseDir) {
  const absBase = ensureAbsolute(baseDir);
  const stamp = Date.now().toString();
  const runDir = path.join(absBase, stamp);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

function pruneCacheRuns(baseDir) {
  try {
    const absBase = ensureAbsolute(baseDir);
    if (!fs.existsSync(absBase)) return;
    const entries = fs.readdirSync(absBase, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        const p = path.join(absBase, e.name);
        const stat = fs.statSync(p);
        return { path: p, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (entries.length <= maxCacheRuns) return;
    const toDelete = entries.slice(maxCacheRuns);
    toDelete.forEach(e => {
      try {
        fs.rmSync(e.path, { recursive: true, force: true });
      } catch (_) { /* ignore rm error */ }
    });
  } catch (_) { /* ignore prune errors */ }
}

async function performRender(payload) {
  const url = (payload.url || "").trim();
  const outDir = (payload.outDir || "").trim();
  const wait = payload.wait || undefined;
  if (!url) { const err = new Error("url is required"); err.code = 400; throw err; }

  const browser = await getBrowser();
  if (!browser) { const err = new Error("playwright not installed"); err.code = 501; throw err; }

  await acquireSlot();
  await rateLimit();
  try {
    const { ctx, page, title, html } = await renderUrlWithPlaywright(browser, url, wait);
    const baseDir = outDir || cacheBaseEnv;
    const runDir = ensureRunDir(baseDir);
    const finalHtmlPath = path.join(runDir, "final.html");
    fs.writeFileSync(finalHtmlPath, html, "utf8");
    let screenshotPath = "";
    try {
      screenshotPath = path.join(runDir, "page.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (_) { screenshotPath = ""; }
    try { await ctx.close(); } catch (_) { /* ignore context close error */ }
    pruneCacheRuns(baseDir);
    return {
      schema_version: schemaVersion,
      url,
      title,
      final_html: ensureAbsolute(finalHtmlPath),
      screenshot: screenshotPath ? ensureAbsolute(screenshotPath) : undefined,
    };
  } finally {
    releaseSlot();
  }
}

async function handleRender(req, res) {
  try {
    const bodyRaw = await readBody(req);
    let payload = {};
    try { payload = bodyRaw ? JSON.parse(bodyRaw) : {}; } catch (e) { logError("render:bad-json", e); payload = {}; }
    try {
      const result = await performRender(payload);
      return json(res, 200, result);
    } catch (e) {
      if (e && e.code === 400) return json(res, 400, { error: e.message });
      if (e && e.code === 501) return json(res, 501, { error: "playwright not installed", hint: "npm i -D playwright && npx playwright install", url: payload && payload.url });
      throw e;
    }
  } catch (err) {
    return json(res, 500, { error: "render failed", message: String(err && err.message || err) });
  }
}

function extractPlainText(html) {
  try {
    // remove script/style
    const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    // replace breaks/paragraphs with newlines
    const withNewlines = withoutScripts.replace(/<(\/)?(p|br|h[1-6]|li|div)>/gi, "\n");
    // strip tags
    const text = withNewlines.replace(/<[^>]+>/g, "");
    // collapse whitespace
    return text.replace(/\s+$/gm, "").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } catch (_) {
    return "";
  }
}

function collectBasicMeta(html, url) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const headings = [];
  const headingRegex = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = headingRegex.exec(html)) !== null) {
    const level = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    headings.push({ level, text });
  }
  const linkRegex = /<a[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links = [];
  while ((m = linkRegex.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    links.push({ href, text });
  }
  return { title, url, headings, links, collected_at: new Date().toISOString() };
}

async function handleExtract(req, res) {
  try {
    const bodyRaw = await readBody(req);
    let payload = {};
    try { payload = bodyRaw ? JSON.parse(bodyRaw) : {}; } catch (e) { logError("render:bad-json", e); payload = {}; }
    const url = (payload.url || "").trim();
    const htmlInput = typeof payload.html === "string" ? payload.html : "";
    const outDir = (payload.outDir || "").trim();
    const wait = payload.wait || undefined;
    if (!url && !htmlInput) { return json(res, 400, { error: "html or url is required" }); }

    let html = htmlInput;
    let effectiveUrl = url;

    // Lazy import Playwright if url provided
    if (!html && url && !process.env.GRAIL_DISABLE_BROWSER) {
      const browser = await getBrowser();
      if (!browser) { return json(res, 501, { error: "playwright not installed", hint: "npm i -D playwright && npx playwright install", url }); }
      await acquireSlot();
      await rateLimit();
      const { ctx, html: pageHtml } = await renderUrlWithPlaywright(browser, url, wait);
      html = pageHtml;
      try { await ctx.close(); } catch (e) { logError('extract:ctx-close', e); }
      releaseSlot();
    }

    if (!html) { return json(res, 400, { error: "failed to obtain html" }); }

    const baseDir = outDir || cacheBaseEnv;
    const runDir = ensureRunDir(baseDir);
    const readablePath = path.join(runDir, "readable.txt");
    const metaPath = path.join(runDir, "meta.json");
    // Use Readability when possible
    let text = "";
    let meta = {};
    try {
      const dom = new JSDOM(html, { url: effectiveUrl || undefined });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      text = (article && article.textContent) ? article.textContent : extractPlainText(html);
      const doc = dom.window.document;
      const canonicalEl = doc.querySelector("link[rel=canonical]");
      const canonical = canonicalEl ? canonicalEl.href : undefined;
      const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(h => ({ level: h.tagName.toLowerCase(), text: h.textContent.trim() }));
      const links = Array.from(doc.querySelectorAll("a[href]"))
        .map(a => ({ href: a.getAttribute("href"), text: (a.textContent || "").trim() }))
        .filter(l => l.href && !l.href.startsWith("#"));
      const codeBlocks = Array.from(doc.querySelectorAll("pre code, code"))
        .slice(0, 20)
        .map(c => (c.textContent || "").trim())
        .filter(Boolean);
      meta = {
        title: (article && article.title) || doc.title || "",
        url: effectiveUrl || undefined,
        canonical,
        headings,
        links,
        code_blocks: codeBlocks,
        collected_at: new Date().toISOString()
      };
    } catch (_) {
      text = extractPlainText(html);
      meta = collectBasicMeta(html, effectiveUrl || undefined);
    }
    fs.writeFileSync(readablePath, text, "utf8");
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
    pruneCacheRuns(baseDir);

    return json(res, 200, {
      schema_version: schemaVersion,
      readable_txt: ensureAbsolute(readablePath),
      meta_json: ensureAbsolute(metaPath)
    });
  } catch (err) {
    releaseSlot();
    return json(res, 500, { error: "extract failed", message: String(err && err.message || err) });
  }
}

const server = http.createServer(async (req, res) => {
  // Simple CORS for local tools
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url && (req.url === "/" || req.url.startsWith("/health"))) {
    const body = {
      status: "ok",
      port,
      version: VERSION,
      uptime_ms: Date.now() - startTimeMs,
      browser: process.env.GRAIL_DISABLE_BROWSER ? "disabled" : "auto",
      schema_version: schemaVersion,
      limits: { maxParallel, rps: requestsPerSecond }
    };
    json(res, 200, body);
    return;
  }

  if (req.method === "POST" && req.url === "/render") {
    await handleRender(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/extract") {
    await handleExtract(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/batch") {
    try {
      const bodyRaw = await readBody(req);
      let payload = {};
      try { payload = bodyRaw ? JSON.parse(bodyRaw) : {}; } catch (e) { logError('batch:bad-json', e); payload = {}; }
      const urls = Array.isArray(payload.urls) ? payload.urls : [];
      const parallel = Number(payload.parallel || maxParallel);
      const outDir = (payload.outDir || "").trim();
      const wait = payload.wait || undefined;
      if (!urls.length) { json(res, 400, { error: "urls is required" }); return; }

      let index = 0;
      const results = new Array(urls.length);
      const worker = async () => {
        while (true) {
          const i = index; index += 1;
          if (i >= urls.length) break;
          const u = urls[i];
          try {
            const r = await performRender({ url: u, outDir, wait });
            results[i] = r;
          } catch (e) {
            if (e && e.code === 501) results[i] = { error: "playwright not installed", url: u };
            else if (e && e.code === 400) results[i] = { error: e.message, url: u };
            else results[i] = { error: String(e && e.message || e), url: u };
          }
        }
      };
      const workers = Array.from({ length: Math.max(1, Math.min(parallel, urls.length)) }, () => worker());
      await Promise.all(workers);
      json(res, 200, { schema_version: schemaVersion, results });
      return;
    } catch (err) { json(res, 500, { error: "batch failed", message: String(err && err.message || err) }); return; }
  }

  json(res, 404, { error: "not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`grail daemon listening on http://127.0.0.1:${port}`);
});

function shutdown(signal) {
  try { if (sharedBrowser) { sharedBrowser.close().catch((e) => logError('shutdown:browser-close', e)); } } catch (e) { logError('shutdown:browser-close', e); }
  try { server.close(() => process.exit(0)); } catch (_) { process.exit(0); }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
