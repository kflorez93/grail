#!/usr/bin/env node
import http from "node:http";

const cmd = process.argv[2] || "health";

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
      console.log(res.body);
      process.exit(res.statusCode === 200 ? 0 : 1);
    } catch (err) {
      console.error("Error: daemon not reachable on http://127.0.0.1:8787/health");
      process.exit(1);
    }
  } else if (cmd === "render") {
    const url = process.argv[3];
    if (!url) {
      console.error("Usage: docudex render <url> [outDir]");
      process.exit(2);
    }
    const outDir = process.argv[4] || "";
    try {
      const res = await request("POST", "/render", { url, outDir });
      console.log(res.body);
      process.exit(res.statusCode === 200 ? 0 : 1);
    } catch (err) {
      console.error("Error: render failed");
      process.exit(1);
    }
  } else if (cmd === "extract") {
    const input = process.argv[3];
    if (!input) {
      console.error("Usage: docudex extract <file|url> [outDir]");
      process.exit(2);
    }
    const outDir = process.argv[4] || "";
    try {
      // If input looks like a URL, send { url }; otherwise read file contents and send { html }
      const isUrl = /^(https?:)\/\//i.test(input);
      let payload;
      if (isUrl) {
        payload = { url: input, outDir };
      } else {
        const fs = await import("node:fs");
        const html = fs.readFileSync(input, "utf8");
        payload = { html, outDir };
      }
      const res = await request("POST", "/extract", payload);
      console.log(res.body);
      process.exit(res.statusCode === 200 ? 0 : 1);
    } catch (err) {
      console.error("Error: extract failed");
      process.exit(1);
    }
  } else {
    console.error("Usage: docudex health | docudex render <url> [outDir] | docudex extract <file|url> [outDir]");
    process.exit(2);
  }
})();
