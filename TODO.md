Grail Roadmap & Tasks

Architecture & Planning
- [ ] Define plugin manifest spec (JSON schema) and JSON I/O contract (stdin/stdout or HTTP)
- [ ] Define `.grail/config.json` schema (enabled plugins, prefs, endpoints)

TypeScript (web daemon)
- [ ] Migrate daemon to TypeScript (tsconfig, types, build step)
- [ ] Keep API parity: `/health`, `/render`, `/extract`, `/batch`
- [ ] ESLint + TS rules aligned with repo

Go Wrapper (core CLI)
- [ ] Initialize Go module (`grail`) and choose CLI framework (Cobra)
- [ ] Commands: `prompt`, `run`, `init`, `plugins add|rm|list`, `auth`, `secrets`, `config`, `doctor`
- [x] Implement prompt aggregation (merge manifests into a single onboarding prompt)
- [ ] Implement `run` to inject prompt for Cursor; print/copy for other CLIs
- [ ] Load/validate `.grail/config.json`
- [ ] Secrets: OS keychain (Keychain/libsecret) with file-based encrypted fallback
- [ ] TUI (`grail config`) to toggle plugins and test connections

Built-in Plugins
- Web/Search/Sessions (bridge to TS daemon)
  - [x] Publish plugin manifest referencing daemon endpoints and schemas
  - [ ] Health check and error surfacing in wrapper
- Sessions/Watchers
  - [ ] Provide Go-backed commands or wrap existing scripts with manifests

Linear Plugin (Go)
- [ ] `grail auth linear` (token entry + secure storage)
- [ ] Commands: `linear me`, `linear issues`, `linear issue <id>` (read-only first)
- [ ] Manifest: commands, schemas, examples, “when to use” guidance

Jira Plugin (Go, scaffold)
- [ ] Config: base URL + token
- [ ] Stub commands: `jira me`, `jira issue <id>`; manifest + TODOs

Init & Onboarding
- [ ] Enhance `grail init` to aggregate all enabled plugin manifests into `grail.manifest.json`
- [ ] Expand `GRAIL_INIT.md` with plugin-specific “when to use” and examples

CI/CD
- [ ] Extend CI to build/test Go wrapper (Linux/macOS incl. Apple Silicon)
- [ ] Release: upload Go binaries (darwin/linux, x64/arm64) alongside TS tarballs

Tests & QA
- [ ] Unit: prompt aggregator (merging manifests) and config loader
- [ ] Unit: secrets store abstraction
- [ ] E2E: `grail run` with mocked agent; Linear API calls (token), web docs flow still green
- [ ] Soak: long-running daemon + wrapper exercising concurrency & pruning

Docs
- [ ] Wrapper mode docs (how to use with Cursor/Claude CLIs)
- [ ] Plugin authoring guide (manifest + handler contract)
- [ ] Auth & secrets guide; environment variables reference

Completed
- [x] Daemon: graceful shutdown; `/health` includes version+uptime
- [x] README: OSS sections; light/dark logo
- [x] CI: Ubuntu+macOS (Apple Silicon); artifact uploads; release assets (darwin/linux x64/arm64)
- [x] `grail init`: auto-start daemon; auto-install Playwright (opt-outs supported)
- [x] Default cache retention set to 30 runs; pruning on new runs
- [x] Bootstrap Go wrapper (prompt/run) and plugin manifests (web, sessions)

