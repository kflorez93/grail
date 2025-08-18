# Changelog

## 0.1.0

- Initial Grail branding and README logo (light/dark)
- CLI: health, render, extract, search, pick, docs, doctor, init
- Daemon: /health, /render, /extract, /batch with parallel+rate limiting
- Cache path normalized to `.grail-cache` with auto-migrate from legacy
- `grail init` writes `GRAIL_INIT.md` and `grail.manifest.json`
- Smoke tests and basic unit tests (flags, heuristics)
- GitHub Actions CI (lint, tests, smoke) and Playwright install step
