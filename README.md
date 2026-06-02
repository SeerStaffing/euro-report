# Euro Report

A curated UK/EU & US headline aggregator. Two ways it runs:

1. **Production pipeline** (recommended) — a scheduled parser fetches UK feeds,
   proposes headlines via a pull request, and a static site publishes to GitHub
   Pages once the PR is merged. Fully decoupled, ~$0, no runtime visible to end
   users. See [Production pipeline](#production-pipeline).
2. **Standalone file** — `euro-report.html`, a self-contained single file with an
   in-browser admin console and `localStorage`. Handy for local use; see
   [Standalone file](#standalone-file).

## Production pipeline

```
parser (GitHub Action, cron)  ->  PR adds items to data/approved.json
        |                                  |
   fetches UK feeds                 admin reviews / merges  (= approval)
   server-side, no CORS             |
                                    v
                            publish (GitHub Action) builds dist/index.html
                            and deploys to GitHub Pages (static, no API calls)
```

- **`scripts/parse.mjs`** — runs in `.github/workflows/parser.yml` on a cron.
  Pulls from two source types, adds *new* headlines (deduped by URL **and**
  normalized title via `data/seen.json`) to `data/approved.json`, and opens/updates
  a review PR:
  - **Direct feeds** (`data/feeds.json`) — curated EU + US RSS.
  - **Tier-1 discovery** (`data/discovery.json`) — Google News RSS search per
    region (EU/US), surfacing articles from across the whole press, not just the
    curated feeds.
- **Self-healing** (`data/feed-health.json`) — tracks each source's success/
  failure; on a direct-feed failure it tries RSS autodiscovery from the site
  homepage and remembers the resolved URL; repeatedly failing sources are flagged
  unhealthy in the run summary.
- **Approval = merging the PR.** Trim entries from the diff to reject them
  (`seen.json` stops them returning); edit `priority`/`featured` inline to re-rank.
- **`scripts/build.mjs`** — runs in `.github/workflows/publish.yml` on push to
  `main`. Inlines `approved.json` + keyword labels into `templates/index.html`,
  producing a fully static `dist/index.html` (no runtime fetch — nothing in the
  Network tab). Deploys to GitHub Pages.
- **Topics** — `data/keywords.json` defines keyword groups; the published page
  lets visitors filter headlines by topic. Tags are computed at build time.

### Local checks

```
node scripts/parse.mjs    # fetch feeds -> update data/approved.json + seen.json
node scripts/build.mjs    # render dist/index.html from approved.json
```

## Standalone file

Open `euro-report.html` directly in a browser. No build step or server required.

## How it works

- **Public page** — renders only *approved* links, grouped into priority rows
  (P1 top → P3 bottom). Makes zero network calls; reads from `localStorage`.
- **Admin console** (footer → *Admin*) — add links manually or via the in-browser
  UK news aggregator; everything lands in *Pending* and only goes live once
  approved. Priority (hidden from end users) is assigned here.
- **Aggregator** — pulls live UK RSS feeds through a CORS proxy; runs only in the
  admin console so end users never see the API calls. (The production pipeline
  above does this server-side instead.)
- **`window.EuroReportAPI`** — scriptable control surface; run
  `EuroReportAPI.help()` in the console for the method list.

## Data model

Each link: `{ id, title, url, region: 'EU'|'US', priority: 'p1'|'p2'|'p3',
featured, flash, source, status: 'pending'|'approved'|'rejected', createdAt,
decidedAt }`, persisted in `localStorage`.

## Contributing

All changes follow the workflow in [CHANGE_CONTROL.md](CHANGE_CONTROL.md).
