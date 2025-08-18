Docudex TODO

MVP 0.1
- Daemon: /health (done)
- Daemon: /render (HTML + screenshot, basic) (done)
- CLI: health (done)
- CLI: render <url> [outDir] (done)
- Project: consistent logging, error shapes, JSON schema notes

MVP 0.2
- Daemon: extract (Readability + metadata) → readable.txt, meta.json (done)
- Daemon: configurable wait strategies (networkidle | selector | timeout) (done)
- Daemon: parallel limit and basic rate limiting (done)
- CLI: extract <file|url> → calls /extract or /render+extract (done)
- CLI: JSON output flag passthrough (done)
- Cache dir management and absolute artifact paths; begin versioned JSON schema (done)

MVP 0.3
- Daemon: batch endpoint
- CLI: search "<query>" [--site ...] → JSONL results (provider stub)
- CLI: pick "<query>" --prefer official (heuristics)
- CLI: docs flow (search → pick → render) emits bundle.json (defined schema)
- Heuristics for official docs detection and ranking
- Cleanup policy for cache directory
- Robust timeouts, retries, backoff for transient errors

Sessions/QA (Phase 2)
- Scripts: ai-session (tmux wrapper) new|list|logs|kill
- Scripts: ai-watch (watchexec/entr wrapper)
- CLI: status snapshot (sessions, diffs) → ai-status (JSON: sessions, watchers, git diff --stat)
- Script: ai-tree (project snapshot; text/JSON)
- ai-session kill: graceful SIGINT → SIGTERM after timeout

Operational
- Add bun/npm scripts, versioning, release process
- Config envs (cache dir, headless toggles, concurrency)
- Basic tests for render/extract
- Dependencies: Node 20+, Playwright install, tmux, watchexec/entr, jq
- Security & compliance: identify User-Agent, obey robots where practical, 429 backoff & retries with jitter
- Soak/hardening: 24h daemon uptime check, memory profiling, crash auto-restart

Later
- PDF rendering option
- Multi-browser support if needed

CLI/Daemon Contracts
- Stable, versioned JSON schemas for all command outputs
- Absolute artifact paths for: final.html, readable.txt, meta.json, page.png (and optional page.pdf)
- Exit codes: pass-through for watched commands; non-zero on failures; consistent error payloads

Acceptance Criteria (aligns with POK-62 MVP v0.1)
1. ai-webd stays up for 24h under light load (≤ 1 rps) without memory leaks
2. ai-web render <vercel-next-doc-url> returns final.html, readable.txt, meta.json, page.png
3. ai-web docs "<topic>" --site vercel.com produces a bundle.json with ≥3 official doc pages
4. ai-session new server "pnpm dev" + ai-session logs server shows live server output
5. ai-watch <dir> "pytest -q" re-runs on file change and exits with correct code
6. ai-status outputs JSON with sessions and recent git diff --stat

