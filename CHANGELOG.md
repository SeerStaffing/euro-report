# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); this project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Tier-1 Google News discovery** (`data/discovery.json`) — per-region (EU/US)
  Google News RSS search surfaces articles from across the whole press, beyond the
  curated feeds. Driven by `<source>` attribution; titles de-sourced.
- **Self-healing parser** (`data/feed-health.json`) — per-source health tracking,
  RSS autodiscovery from a site homepage when a direct feed fails (remembers the
  resolved URL), and unhealthy-source flagging in the run summary.
- **US direct feeds** added to `data/feeds.json` (NYT, NPR, Politico, The Hill).
- Cross-source de-duplication by normalized title (in addition to URL).
- High-volume test settings (per-feed 40, per-query 80, approved cap 1000).

### Changed
- Bumped workflow actions to Node 24-compatible majors (checkout v6, setup-node v6,
  configure-pages v6, upload-pages-artifact v5, deploy-pages v5) to clear the
  Node 20 deprecation warning ahead of the 2026-06-16 runner change.

### Added
- Design doc: `docs/design/admin-console-and-hosting.md` — scopes a local
  GitHub-pushing admin console and production hosting options (Cloudflare Pages +
  custom domain).
- **Decoupled production pipeline** (GitHub Actions + Pages):
  - `scripts/parse.mjs` — scheduled parser fetches UK feeds server-side (no CORS
    proxy), adds new headlines to `data/approved.json`, opens a review PR.
  - `scripts/build.mjs` — inlines approved data + keywords into a fully static
    `dist/index.html` (no runtime fetch) and deploys to GitHub Pages.
  - `scripts/lib.mjs` — shared, dependency-free RSS parsing + helpers.
  - Workflows: `parser.yml` (cron → PR) and `publish.yml` (push → Pages).
- **Full UK feed buildout** — 21 verified UK feeds in `data/feeds.json`
  (BBC national/regional/nations, Guardian, Sky, Independent, Mirror, Metro,
  Standard, Express).
- **Topic/keyword filtering** — `data/keywords.json` topic groups; published page
  lets visitors filter headlines by topic, with tags computed at build time.
- PR-based approval model: merging the parser PR publishes; `data/seen.json`
  ledger prevents rejected items from returning.

## [1.0.0] - 2026-06-02

Initial baseline brought under change control. Captures all work to date.

### Added
- Single-file aggregator front-end with classic headline-aggregator styling
  (masthead, splash headline, EU & US region filter).
- Admin console with human-approval gate: links land in *Pending* and only go
  live once *Approved*.
- `window.EuroReportAPI` scriptable control surface (`add`, `addMany`, `approve`,
  `reject`, `remove`, `approveAll`, `removeAll`, `setPriority`, `list`,
  `pending`, `approved`, `export`, `import`, `fetchFeeds`, `clear`, `help`).
- UK news aggregator: fetches live RSS (BBC, Guardian, Sky) via a CORS-proxy
  fallback chain and queues items into *Pending*. Runs only in the admin console.
- Priority-row layout (hidden P1–P3 attribute) assignable from the admin console.
- Approve all / Remove all bulk actions.
- JSON export/import and sample-data seeding.

### Changed
- Rebranded from "Drudge"/"The Report" to **Euro Report**.
- Region **UK → EU** (filter tab, pills, tagging) with one-time data migration.
- Layout reworked from 3 columns to priority-based rows.
