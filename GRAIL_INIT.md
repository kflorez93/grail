# Grail Init

Grail is a CLI-first research & QA toolkit for terminal AIs.

## Quick start

- Start daemon in a long-lived shell:

`node ./daemon/src/index.js`

- Health:

`grail health --pretty`

- Docs bundle (example):

`grail docs "nextjs static generation" --site vercel.com --n 3 --pretty`

- Sessions & QA:

`./scripts/ai-session new server "pnpm dev"`

`./scripts/ai-watch src "pytest -q"`

`./scripts/ai-status`

## Environment

- Playwright: installed
- tmux: installed
- watcher (watchexec/entr): missing
- search provider: ddg (ready)

## Commands

- health: Daemon health
- render: 
- extract: 
- search: 
- pick: 
- docs: 
- doctor: Environment check
- init: Generate onboarding guide in project

## Files

- This guide: GRAIL_INIT.md
- Manifest: grail.manifest.json
