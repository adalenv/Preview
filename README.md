# Preview

Static GitHub Pages app to browse any public GitHub repository and preview `.html` / `.htm` files in-browser. No backend; uses GitHub REST API and raw content URLs.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 (Vite serves with base `/Preview/` so the app is at http://localhost:5173/Preview/).

## Build

```bash
npm run build
```

Output is in `dist/`. To try the production build locally:

```bash
npm run preview
```

## Deploy to GitHub Pages

1. Push the repo to GitHub (e.g. `adalenv/Preview`).
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to the `main` branch (or trigger the workflow manually). The workflow builds with Vite and deploys the `dist/` artifact to GitHub Pages.

The site will be available at:

- **Project site:** `https://<username>.github.io/Preview/`

`vite.config.js` uses `base: '/Preview/'` so assets and routing work under that path.

## Usage

1. Enter **owner/repo** (e.g. `adalenv/some-repo`) and optionally a **branch** (defaults to the repo’s default branch).
2. Click **Load** to show the file browser. Use the breadcrumb to navigate; click folders to open, click an `.html`/`.htm` file to preview.
3. **Open Raw** / **Open on GitHub** open the current file. **Copy share link** copies a URL with `?repo=...&ref=...&path=...` so others can open the same preview.
4. **Settings (⚙):** optional GitHub PAT stored in `localStorage` to avoid rate limits (unauthenticated requests are limited).

## Tech

- Vite + vanilla JS (no framework).
- GitHub API: `GET /repos/{owner}/{repo}` for default branch; `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}` for listing; raw content via `raw.githubusercontent.com`.
- HTML preview: fetch raw HTML, rewrite relative `href`/`src` to absolute raw URLs, inject into a sandboxed iframe (`srcdoc`).
