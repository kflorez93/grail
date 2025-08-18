#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const cmd = process.argv[2] || "health";

function parseFlags(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const [k, v] = token.slice(2).split("=");
      const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (typeof v === "string" && v.length) {
        flags[key] = v;
      } else {
        // lookahead for value or set boolean true
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else if (token.startsWith("-")) {
      // short flags cluster not supported; treat each as boolean
      const shorts = token.slice(1).split("");
      shorts.forEach(s => { flags[s] = true; });
    } else {
      args.push(token);
    }
  }
  return { args, flags };
}

function printResponse(body, pretty) {
  if (!pretty) { console.log(body); return; }
  try {
    const obj = JSON.parse(body);
    console.log(JSON.stringify(obj, null, 2));
  } catch (_) {
    console.log(body);
  }
}

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      path: `${u.pathname}${u.search}`,
      protocol: u.protocol,
      method: "GET",
      headers: {
        "user-agent": "docudex-cli/0.1 (+https://localhost)"
      }
    }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", c => { data += c; });
      res.on("end", () => resolve({ statusCode: res.statusCode || 0, body: data }));
    });
    req.on("error", reject);
    req.end();
  });
}

function parseDuckDuckGoHtml(html, limit) {
  const results = [];
  const linkRegex = /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const url = m[1];
    const title = m[2].replace(/<[^>]+>/g, "").trim();
    if (url && title) {
      results.push({ title, url, snippet: "" });
      if (results.length >= limit) break;
    }
  }
  return results;
}

async function providerSearch(query, site, n) {
  const encQ = encodeURIComponent(site ? `site:${site} ${query}` : query);
  const url = `https://duckduckgo.com/html/?q=${encQ}`;
  try {
    const res = await httpGet(url);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const items = parseDuckDuckGoHtml(res.body, n);
      if (items.length) return items;
    }
  } catch (_) {
    // fall through to stub
  }
  // Fallback stub
  return Array.from({ length: n }, (_, i) => ({
    title: `Stub Result ${i + 1} for ${query}`,
    url: site ? `https://${site}/docs/example-${i}` : `https://example.com/docs/example-${i}`,
    snippet: "provider stub"
  }));
}

function scoreHeuristics(url) {
  let score = 0;
  try {
    const u = new URL(url);
    if (u.hostname.startsWith("docs.")) score += 5;
    if (/\/docs(\/|$)/.test(u.pathname)) score += 4;
    if (/vercel|nextjs|react|prisma|js|api|reference/i.test(u.pathname)) score += 1;
    if (/blog|forum|community|legacy|v1|old/i.test(u.pathname)) score -= 3;
  } catch (_) {}
  return score;
}

function ensureAbsolute(p) {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function ensureRunDir(baseDir, prefix) {
  const absBase = ensureAbsolute(baseDir);
  const stamp = Date.now().toString();
  const runDir = path.join(absBase, `${prefix || "docs"}-${stamp}`);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: process.env.PORT || 8787, path, method, headers: { "content-type": "application/json" } }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) { req.write(JSON.stringify(body)); }
    req.end();
  });
}

(async () => {
  if (cmd === "health") {
    try {
      const res = await request("GET", "/health");
      const { flags } = parseFlags(process.argv.slice(3));
      printResponse(res.body, Boolean(flags.pretty || flags.json || flags.j));
      process.exit(res.statusCode === 200 ? 0 : 1);
    } catch (err) {
      console.error("Error: daemon not reachable on http://127.0.0.1:8787/health");
      process.exit(1);
    }
  } else if (cmd === "render") {
    const { args, flags } = parseFlags(process.argv.slice(3));
    const url = args[0];
    if (!url) {
      console.error("Usage: docudex render <url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty]");
      process.exit(2);
    }
    const outDir = args[1] || flags.outDir || "";
    try {
      const wait = {};
      if (flags.waitStrategy) wait.strategy = String(flags.waitStrategy);
      if (flags.waitSelector) wait.selector = String(flags.waitSelector);
      if (flags.waitMs) wait.ms = Number(flags.waitMs);
      const payload = { url, outDir };
      if (Object.keys(wait).length) payload.wait = wait;
      const res = await request("POST", "/render", payload);
      printResponse(res.body, Boolean(flags.pretty || flags.json || flags.j));
      process.exit(res.statusCode === 200 ? 0 : 1);
    } catch (err) {
      console.error("Error: render failed");
      process.exit(1);
    }
  } else if (cmd === "extract") {
    const { args, flags } = parseFlags(process.argv.slice(3));
    const input = args[0];
    if (!input) {
      console.error("Usage: docudex extract <file|url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty]");
      process.exit(2);
    }
    const outDir = args[1] || flags.outDir || "";
    try {
      // If input looks like a URL, send { url }; otherwise read file contents and send { html }
      const isUrl = /^(https?:):\/\//i.test(input);
      let payload;
      if (isUrl) {
        payload = { url: input, outDir };
      } else {
        const fs = await import("node:fs");
        const html = fs.readFileSync(input, "utf8");
        payload = { html, outDir };
      }
      const wait = {};
      if (flags.waitStrategy) wait.strategy = String(flags.waitStrategy);
      if (flags.waitSelector) wait.selector = String(flags.waitSelector);
      if (flags.waitMs) wait.ms = Number(flags.waitMs);
      if (Object.keys(wait).length) payload.wait = wait;
      const res = await request("POST", "/extract", payload);
      printResponse(res.body, Boolean(flags.pretty || flags.json || flags.j));
      process.exit(res.statusCode === 200 ? 0 : 1);
    } catch (err) {
      console.error("Error: extract failed");
      process.exit(1);
    }
  } else if (cmd === "search") {
    const { args, flags } = parseFlags(process.argv.slice(3));
    const query = args.join(" ");
    if (!query) {
      console.error("Usage: docudex search <query> [--site <domain>] [--n <int>]");
      process.exit(2);
    }
    const site = flags.site ? String(flags.site) : undefined;
    const n = Number(flags.n || 5);
    const items = await providerSearch(query, site, n);
    items.forEach(it => console.log(JSON.stringify(it)));
    process.exit(0);
  } else if (cmd === "pick") {
    const { args, flags } = parseFlags(process.argv.slice(3));
    const query = args.join(" ");
    if (!query) {
      console.error("Usage: docudex pick <query> --prefer official [--site <domain>] [--n <int>]");
      process.exit(2);
    }
    const site = flags.site ? String(flags.site) : undefined;
    const n = Number(flags.n || 5);
    const items = await providerSearch(query, site, n * 3);
    const ranked = items
      .map(it => ({ ...it, _score: scoreHeuristics(it.url) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, n)
      .map(({ _score, ...rest }) => rest);
    ranked.forEach(p => console.log(JSON.stringify(p)));
    process.exit(0);
  } else if (cmd === "docs") {
    const { args, flags } = parseFlags(process.argv.slice(3));
    const topic = args.join(" ");
    if (!topic) {
      console.error("Usage: docudex docs <topic> --site <domain> [--path <path>] [--n <int>] [--json|--pretty]");
      process.exit(2);
    }
    const site = flags.site ? String(flags.site) : undefined;
    const n = Number(flags.n || 3);
    const outDir = flags.outDir || "";
    const searchItems = await providerSearch(topic, site, n * 3);
    const picks = searchItems
      .map(it => ({ ...it, _score: scoreHeuristics(it.url) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, n)
      .map(({ _score, ...rest }) => rest);
    const urls = picks.map(p => p.url);
    const wait = {};
    if (flags.waitStrategy) wait.strategy = String(flags.waitStrategy);
    if (flags.waitSelector) wait.selector = String(flags.waitSelector);
    if (flags.waitMs) wait.ms = Number(flags.waitMs);
    const batchPayload = { urls, parallel: flags.parallel ? Number(flags.parallel) : undefined, outDir, wait: Object.keys(wait).length ? wait : undefined };
    const res = await request("POST", "/batch", batchPayload);
    // Write bundle.json
    const baseCache = process.env.DOCUDEX_CACHE_DIR || ".docudex-cache";
    const runDir = ensureRunDir(baseCache, "docs");
    const bundlePath = path.join(runDir, "bundle.json");
    const bundle = {
      schema_version: "0.1.0",
      topic,
      site: site || null,
      picks,
      batch: (function() { try { return JSON.parse(res.body); } catch (_) { return { error: "invalid-json" }; } })(),
      created_at: new Date().toISOString()
    };
    fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), "utf8");
    const output = { bundle_json: ensureAbsolute(bundlePath) };
    console.log(JSON.stringify(output, null, (flags.pretty || flags.json || flags.j) ? 2 : 0));
    process.exit(0);
  } else {
    console.error("Usage: docudex health [--json|--pretty] | docudex render <url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty] | docudex extract <file|url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty] | docudex search <query> [--site <domain>] [--n <int>] | docudex pick <query> --prefer official [--site <domain>] | docudex docs <topic> --site <domain> [--path <path>] [--n <int>] [--json|--pretty]");
    process.exit(2);
  }
})();
