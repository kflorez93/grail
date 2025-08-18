Docudex (placeholder name)

Minimal scaffold: daemon exposes /health; CLI checks it.

Usage
- Sessions & QA scripts:

```
./scripts/ai-session list
./scripts/ai-session new server "pnpm dev"
./scripts/ai-session logs server 200
./scripts/ai-session kill server

./scripts/ai-watch src "pytest -q"
./scripts/ai-status
./scripts/ai-tree --max-depth 3 --json
```

- Start daemon:

```
node ./daemon/src/index.js
```

- Health:

```
node ./cli/src/index.js health --pretty
```

- Render a URL (writes final.html and page.png to cache dir):

```
node ./cli/src/index.js render "https://example.com" .docudex-cache --wait-strategy networkidle --pretty
```

- Extract from a local HTML file or fetch-and-extract from a URL:

```
node ./cli/src/index.js extract ./path/to/file.html --pretty
node ./cli/src/index.js extract "https://example.com/docs" --wait-strategy selector --wait-selector main --pretty
```

- Batch/docs workflow (stub search/pick, real batch render):

```
node ./cli/src/index.js search "nextjs static generation" --site vercel.com
node ./cli/src/index.js pick "nextjs static generation" --site vercel.com
node ./cli/src/index.js docs "nextjs static generation" --site vercel.com --n 3 --pretty
```

Environment

- `PORT`: daemon port (default 8787)
- `DOCUDEX_CACHE_DIR`: base cache directory (default `.docudex-cache`)
- `DOCUDEX_MAX_PARALLEL`: concurrent operations (default 4)
- `DOCUDEX_RPS`: requests per second rate limit (default 4)
- `DOCUDEX_CACHE_MAX_RUNS`: max run directories to keep in cache (default 100)
- `DOCUDEX_DISABLE_BROWSER`: set to `1` to disable Playwright usage
- `DOCUDEX_SEARCH_PROVIDER`: `ddg` (default) or `google`
- `DOCUDEX_GOOGLE_API_KEY` and `DOCUDEX_GOOGLE_CX`: set both to enable Google Custom Search provider

Install Playwright to enable browser rendering:

```
npm i -D playwright
npx playwright install --with-deps
```
