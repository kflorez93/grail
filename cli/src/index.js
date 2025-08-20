#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VERSION = "0.1.0";
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
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
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
  const provider = process.env.GRAIL_SEARCH_PROVIDER || "ddg";
  if (provider === "google" && process.env.GRAIL_GOOGLE_API_KEY && process.env.GRAIL_GOOGLE_CX) {
    try {
      const params = new URLSearchParams({
        key: process.env.GRAIL_GOOGLE_API_KEY,
        cx: process.env.GRAIL_GOOGLE_CX,
        q: site ? `site:${site} ${query}` : query,
        num: String(Math.min(10, Math.max(1, n)))
      });
      const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
      const { statusCode, body } = await httpGet(url);
      if (statusCode >= 200 && statusCode < 300) {
        const data = JSON.parse(body);
        const items = Array.isArray(data.items) ? data.items : [];
        return items.slice(0, n).map(it => ({ title: it.title, url: it.link, snippet: it.snippet || "" }));
      }
    } catch (_) {
      // fall back to ddg below
    }
  }
  const encQ = encodeURIComponent(site ? `site:${site} ${query}` : query);
  const url = `https://duckduckgo.com/html/?q=${encQ}`;
  try {
    const res = await httpGet(url);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const items = parseDuckDuckGoHtml(res.body, n);
      if (items.length) return items;
    }
  } catch (_) { /* ignore provider error, fall through */ }
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
  } catch (_) { /* ignore url parse error */ }
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
    if (["--help", "-h"].includes(process.argv[3] || "")) {
      console.log("Usage: grail health [--json|--pretty]");
      process.exit(0);
    }
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
    if (flags.h || flags.help) {
      console.log("Usage: grail render <url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty]");
      process.exit(0);
    }
    const url = args[0];
    if (!url) {
      console.error("Usage: grail render <url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty]");
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
    if (flags.h || flags.help) {
      console.log("Usage: grail extract <file|url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty]");
      process.exit(0);
    }
    const input = args[0];
    if (!input) {
      console.error("Usage: grail extract <file|url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty]");
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
    if (flags.h || flags.help) {
      console.log("Usage: grail search <query> [--site <domain>] [--n <int>]");
      process.exit(0);
    }
    const query = args.join(" ");
    if (!query) {
      console.error("Usage: grail search <query> [--site <domain>] [--n <int>]");
      process.exit(2);
    }
    const site = flags.site ? String(flags.site) : undefined;
    const n = Number(flags.n || 5);
    const items = await providerSearch(query, site, n);
    items.forEach(it => console.log(JSON.stringify(it)));
    process.exit(0);
  } else if (cmd === "pick") {
    const { args, flags } = parseFlags(process.argv.slice(3));
    if (flags.h || flags.help) {
      console.log("Usage: grail pick <query> --prefer official [--site <domain>] [--n <int>]");
      process.exit(0);
    }
    const query = args.join(" ");
    if (!query) {
      console.error("Usage: grail pick <query> --prefer official [--site <domain>] [--n <int>]");
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
    if (flags.h || flags.help) {
      console.log("Usage: grail docs <topic> --site <domain> [--path <path>] [--n <int>] [--json|--pretty]");
      process.exit(0);
    }
    const topic = args.join(" ");
    if (!topic) {
      console.error("Usage: grail docs <topic> --site <domain> [--path <path>] [--n <int>] [--json|--pretty]");
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
    const baseCache = process.env.GRAIL_CACHE_DIR || ".grail-cache";
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
  } else if (cmd === "doctor") {
    const { flags } = parseFlags(process.argv.slice(3));
    const pretty = Boolean(flags.pretty || flags.json || flags.j);
    // Daemon health
    let health = null;
    try {
      const res = await request("GET", "/health");
      health = { ok: res.statusCode === 200, raw: JSON.parse(res.body) };
    } catch (_) {
      health = { ok: false, raw: null };
    }
    // Tools
    const hasTmux = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
    const hasWatchexec = spawnSync("watchexec", ["--version"], { stdio: "ignore" }).status === 0;
    const hasEntr = spawnSync("entr", ["-v"], { stdio: "ignore" }).status === 0;
    // Playwright
    let hasPlaywright = false;
    try { await import("playwright"); hasPlaywright = true; } catch (_) { hasPlaywright = false; }
    // Search provider
    const provider = process.env.GRAIL_SEARCH_PROVIDER || "ddg";
    const providerReady = provider === "ddg" || (provider === "google" && process.env.GRAIL_GOOGLE_API_KEY && process.env.GRAIL_GOOGLE_CX);
    const out = {
      schema_version: "0.1.0",
      doctor: {
        daemon: health,
        tools: { tmux: hasTmux, watchexec: hasWatchexec, entr: hasEntr },
        playwright: hasPlaywright,
        search: { provider, ready: Boolean(providerReady) }
      }
    };
    console.log(JSON.stringify(out, null, pretty ? 2 : 0));
    process.exit(out.doctor.daemon.ok ? 0 : 1);
  } else if (cmd === "init") {
    const { flags } = parseFlags(process.argv.slice(3));
    const pretty = Boolean(flags.pretty || flags.json || flags.j);
    const ensureDaemonStarted = async () => {
      // Skip if user opts out
      if (String(process.env.GRAIL_INIT_AUTO_START || "1") === "0") return { attempted: false, started: false };
      try {
        const res = await request("GET", "/health");
        if (res && res.statusCode === 200) return { attempted: false, started: true };
      } catch (_) { /* not running */ }
      // Try to spawn in background
      try { spawnSync(process.execPath, [path.resolve(process.cwd(), "./daemon/src/index.js")], { detached: true, stdio: "ignore" }); } catch (_) { /* ignore */ }
      try {
        const { spawn } = await import("node:child_process");
        const child = spawn(process.execPath, [path.resolve(process.cwd(), "./daemon/src/index.js")], { detached: true, stdio: "ignore" });
        child.unref();
      } catch (_) { /* ignore spawn error */ }
      // Poll for health
      for (let i = 0; i < 20; i += 1) {
        try {
          const res = await request("GET", "/health");
          if (res && res.statusCode === 200) return { attempted: true, started: true };
        } catch (_) { /* not ready yet */ }
        await new Promise(r => setTimeout(r, 250));
      }
      return { attempted: true, started: false };
    };

    const ensurePlaywrightDeps = async () => {
      // Skip if user opts out or browser disabled
      if (process.env.GRAIL_DISABLE_BROWSER) return { attempted: false, installed: false };
      if (String(process.env.GRAIL_INIT_AUTO_DEPS || "1") === "0") return { attempted: false, installed: false };
      try { await import("playwright"); return { attempted: false, installed: true }; } catch (_) { /* not installed */ }
      // Try to install dev dep and browsers
      try {
        spawnSync("npm", ["i", "-D", "playwright", "--no-fund", "--no-audit"], { stdio: "ignore" });
        const { spawn } = await import("node:child_process");
        await new Promise((resolve) => {
          const p = spawn("npx", ["playwright", "install", "--with-deps"], { stdio: "ignore" });
          p.on("close", () => resolve());
          p.on("error", () => resolve());
        });
        try { await import("playwright"); return { attempted: true, installed: true }; } catch (_) { return { attempted: true, installed: false }; }
      } catch (_) {
        return { attempted: true, installed: false };
      }
    };
    // Gather doctor info
    let health = null;
    try {
      const res = await request("GET", "/health");
      health = { ok: res.statusCode === 200, raw: JSON.parse(res.body) };
    } catch (_) { health = { ok: false, raw: null }; }
    const hasTmux = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
    const hasWatchexec = spawnSync("watchexec", ["--version"], { stdio: "ignore" }).status === 0;
    const hasEntr = spawnSync("entr", ["-v"], { stdio: "ignore" }).status === 0;
    let hasPlaywright = false; try { await import("playwright"); hasPlaywright = true; } catch (_) { hasPlaywright = false; }
    const provider = process.env.GRAIL_SEARCH_PROVIDER || "ddg";
    const providerReady = provider === "ddg" || (provider === "google" && process.env.GRAIL_GOOGLE_API_KEY && process.env.GRAIL_GOOGLE_CX);

    // Build manifest
    const manifest = {
      name: "grail",
      version: VERSION,
      description: "Grail: research & QA toolkit for terminal AIs",
      commands: [
        { name: "health", outputs: "JSON", desc: "Daemon health" },
        { name: "render", args: ["url", "outDir?"], flags: ["wait-strategy", "wait-selector", "wait-ms", "pretty"], outputs: "JSON" },
        { name: "extract", args: ["file|url", "outDir?"], flags: ["wait-strategy", "wait-selector", "wait-ms", "pretty"], outputs: "JSON" },
        { name: "search", args: ["query"], flags: ["site", "n"], outputs: "JSONL" },
        { name: "pick", args: ["query"], flags: ["site", "n"], outputs: "JSONL" },
        { name: "docs", args: ["topic"], flags: ["site", "n", "pretty"], outputs: "JSON" },
        { name: "doctor", outputs: "JSON", desc: "Environment check" },
        { name: "init", outputs: "files+JSON", desc: "Generate onboarding guide in project" }
      ],
      env: {
        GRAIL_CACHE_DIR: ".grail-cache (default)",
        GRAIL_MAX_PARALLEL: "4 (default)",
        GRAIL_RPS: "4 (default)",
        GRAIL_CACHE_MAX_RUNS: "100 (default)",
        GRAIL_DISABLE_BROWSER: "unset by default",
        GRAIL_SEARCH_PROVIDER: "ddg|google",
        GRAIL_GOOGLE_API_KEY: "required if provider=google",
        GRAIL_GOOGLE_CX: "required if provider=google"
      },
      schemas: {
        render: { schema_version: "string", url: "string", title: "string", final_html: "abs path", screenshot: "abs path?" },
        extract: { schema_version: "string", readable_txt: "abs path", meta_json: "abs path" },
        batch: { schema_version: "string", results: "array of render or error" },
        docs: { bundle_json: "abs path" },
        status: { sessions: "array", watchers: "array", git_diff_stat: "string" }
      },
      examples: [
        "grail health --pretty",
        "grail search 'nextjs static generation' --site vercel.com",
        "grail pick 'nextjs static generation' --site vercel.com --n 3",
        "grail docs 'nextjs static generation' --site vercel.com --n 3 --pretty"
      ]
    };

    // Migrate legacy cache dir to .grail-cache if present
    try {
      const legacy = path.resolve(process.cwd(), ".docudex-cache");
      const next = path.resolve(process.cwd(), ".grail-cache");
      if (fs.existsSync(legacy) && !fs.existsSync(next)) {
        fs.renameSync(legacy, next);
      }
    } catch (_) { /* ignore migration errors */ }

    // Write onboarding guide without images for lightweight output
    const md = `# Grail Init

Grail is a CLI-first research & QA toolkit for terminal AIs.

## Agent guide: when to use Grail

- Use \`grail search\` + \`grail pick\` to find official docs quickly (prefer "docs." and "/docs" URLs).
- Use \`grail docs\` to fetch N top docs and persist a bundle for later reference.
- Use \`grail render\` when a page requires JS to fully load or when you need a screenshot.
- Use \`grail extract\` to turn HTML (from URL or file) into readable text + structured metadata.
- Use scripts for long-lived tasks:
  - \`./scripts/ai-session new server "pnpm dev"\` to keep a dev server running.
  - \`./scripts/ai-watch src "pytest -q"\` to re-run tests on change.
  - \`./scripts/ai-status\` to report sessions, watchers, and recent git diff.

Heuristics:
- If unsure which docs to trust, run \`grail pick\` and prefer URLs ranked highest.
- If Playwright isn’t installed, \`render\` and URL-based \`extract\` will return 501 with a hint.
- Persist artifacts are under \`.grail-cache\`; keep and reference \`bundle.json\` outputs.

## Quick start

- Start daemon in a long-lived shell:

\`node ./daemon/src/index.js\`

- Health:

\`grail health --pretty\`

- Docs bundle (example):

\`grail docs "nextjs static generation" --site vercel.com --n 3 --pretty\`

- Sessions & QA:

\`./scripts/ai-session new server "pnpm dev"\`

\`./scripts/ai-watch src "pytest -q"\`

\`./scripts/ai-status\`

## Environment

- Playwright: ${hasPlaywright ? "installed" : "missing"}
- tmux: ${hasTmux ? "installed" : "missing"}
- watcher (watchexec/entr): ${hasWatchexec || hasEntr ? "available" : "missing"}
- search provider: ${provider} (${providerReady ? "ready" : "not configured"})

## Commands

${manifest.commands.map(c=>`- ${c.name}: ${c.desc||""}`).join("\n")}

## Files

- This guide: GRAIL_INIT.md
- Manifest: grail.manifest.json (includes schemas and examples)
`;
    fs.writeFileSync("GRAIL_INIT.md", md, "utf8");
    fs.writeFileSync("grail.manifest.json", JSON.stringify(manifest, null, 2), "utf8");

    // Auto-start daemon and ensure deps
    const autoDeps = await ensurePlaywrightDeps();
    const autoDaemon = await ensureDaemonStarted();

    const output = { wrote: [ "GRAIL_INIT.md", "grail.manifest.json" ], doctor: { daemon: health, tools: { tmux: hasTmux, watchexec: hasWatchexec, entr: hasEntr }, playwright: hasPlaywright, search: { provider, ready: providerReady } }, auto: { deps: autoDeps, daemon: autoDaemon } };
    console.log(JSON.stringify(output, null, pretty ? 2 : 0));
    process.exit(0);
  } else if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    process.exit(0);
  } else if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    const help = `grail ${VERSION}\n\nCommands:\n  health [--pretty]\n  render <url> [outDir] [--wait-...]\n  extract <file|url> [outDir] [--wait-...]\n  search <query> [--site <domain>] [--n <int>]\n  pick <query> --prefer official [--site <domain>] [--n <int>]\n  docs <topic> --site <domain> [--n <int>] [--pretty]\n  doctor [--pretty]\n  init [--pretty]\n  version\n  help\n`;
    console.log(help);
    process.exit(0);
  } else if (cmd === "manifest") {
    const manifest = {
      name: "grail",
      version: VERSION,
      description: "Grail: research & QA toolkit for terminal AIs",
      commands: [
        { name: "health", outputs: "JSON", desc: "Daemon health" },
        { name: "render", args: ["url", "outDir?"], flags: ["wait-strategy", "wait-selector", "wait-ms", "pretty"], outputs: "JSON" },
        { name: "extract", args: ["file|url", "outDir?"], flags: ["wait-strategy", "wait-selector", "wait-ms", "pretty"], outputs: "JSON" },
        { name: "search", args: ["query"], flags: ["site", "n"], outputs: "JSONL" },
        { name: "pick", args: ["query"], flags: ["site", "n"], outputs: "JSONL" },
        { name: "docs", args: ["topic"], flags: ["site", "n", "pretty"], outputs: "JSON" },
      ],
      scripts: ["ai-session", "ai-watch", "ai-status", "ai-tree"],
      env: {
        GRAIL_CACHE_DIR: ".grail-cache (default)",
        GRAIL_MAX_PARALLEL: "4 (default)",
        GRAIL_RPS: "4 (default)",
        GRAIL_CACHE_MAX_RUNS: "100 (default)",
        GRAIL_DISABLE_BROWSER: "unset by default",
        GRAIL_SEARCH_PROVIDER: "ddg|google",
        GRAIL_GOOGLE_API_KEY: "required if provider=google",
        GRAIL_GOOGLE_CX: "required if provider=google"
      },
      schemas: {
        render: { schema_version: "string", url: "string", title: "string", final_html: "abs path", screenshot: "abs path?" },
        extract: { schema_version: "string", readable_txt: "abs path", meta_json: "abs path" },
        batch: { schema_version: "string", results: "array of render or error" },
        docs: { bundle_json: "abs path" },
        status: { sessions: "array", watchers: "array", git_diff_stat: "string" }
      },
      examples: [
        "grail health --pretty",
        "grail search 'nextjs static generation' --site vercel.com",
        "grail pick 'nextjs static generation' --site vercel.com --n 3",
        "grail docs 'nextjs static generation' --site vercel.com --n 3 --pretty"
      ]
    };
    console.log(JSON.stringify(manifest, null, 2));
    process.exit(0);
  } else {
    console.error("Usage: grail health [--json|--pretty] | grail render <url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty] | grail extract <file|url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty] | grail search <query> [--site <domain>] [--n <int>] | grail pick <query> --prefer official [--site <domain>] | grail docs <topic> --site <domain> [--path <path>] [--n <int>] [--json|--pretty]");
    process.exit(2);
  }
})();
