Grail Roadmap – Ordered Checklist

- [ ] Define plugin manifest spec (JSON schema) and JSON I/O contract (stdin/stdout or HTTP)
- [ ] Define `.grail/config.json` schema (enabled plugins, prefs, endpoints)

- [x] Bootstrap Go wrapper (prompt/run) and plugin manifests (web, sessions)
- [x] Implement prompt aggregation (merge manifests into a single onboarding prompt)
- [ ] Implement `run` to inject prompt for Cursor; print/copy for other CLIs
- [x] Add `plugins list|add|rm` in wrapper (reads/writes `.grail/config.json`)
- [x] Load/validate `.grail/config.json` on startup
- [ ] Secrets store: OS keychain with encrypted file fallback
- [ ] TUI: `grail config` to toggle plugins and test connections

- [x] Publish built-in plugin manifests for Web/Search/Sessions
- [ ] Surface daemon health/errors in wrapper (web plugin bridge)
- [ ] Provide Go-backed sessions/watchers or wrap scripts with manifests

- [ ] Linear plugin (Go): `grail auth linear`; `linear me|issues|issue <id>`; manifest guidance
- [ ] Jira plugin (Go scaffold): config + token; `jira me|issue <id>`; manifest

- [ ] Enhance `grail init` to aggregate enabled plugin manifests into `grail.manifest.json`
- [ ] Expand `GRAIL_INIT.md` with plugin-specific “when to use” and examples

- [ ] Extend CI to build/test Go wrapper (Linux/macOS incl. Apple Silicon)
- [ ] Release: upload Go binaries (darwin/linux, x64/arm64) alongside TS tarballs

- [ ] Unit tests: prompt aggregator; config loader; secrets store abstraction
- [ ] E2E tests: `grail run` with mocked agent; Linear API calls; web docs flow
- [ ] Soak test: long-running daemon + wrapper exercising concurrency & pruning

- [ ] Docs: wrapper mode (Cursor/Claude); plugin authoring guide; auth & secrets; env reference

- [ ] Migrate daemon to TypeScript (tsconfig/types/build), keeping API parity and lint rules

