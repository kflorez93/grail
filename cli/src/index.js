#!/usr/bin/env node
import http from "node:http";

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
  } else {
    console.error("Usage: docudex health [--json|--pretty] | docudex render <url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty] | docudex extract <file|url> [outDir] [--wait-strategy <networkidle|selector|timeout>] [--wait-selector <css>] [--wait-ms <ms>] [--json|--pretty]");
    process.exit(2);
  }
})();
