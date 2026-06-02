# Euro Report

A self-contained, single-file news aggregator front-end styled after a classic
headline-aggregator layout. EU & US headlines are curated through an in-page
admin console with a human-approval gate.

## Run

Open `euro-report.html` directly in a browser. No build step or server required.

## How it works

- **Public page** — renders only *approved* links, grouped into priority rows
  (P1 top → P3 bottom). Makes zero network calls; reads from `localStorage`.
- **Admin console** (footer → *Admin*) — add links manually or via the UK news
  aggregator; everything lands in *Pending* and only goes live once approved.
  Priority (hidden from end users) is assigned here.
- **Aggregator** — pulls live UK RSS feeds through a CORS proxy; runs only in the
  admin console so end users never see the API calls.
- **`window.EuroReportAPI`** — scriptable control surface; run
  `EuroReportAPI.help()` in the console for the method list.

## Data model

Each link: `{ id, title, url, region: 'EU'|'US', priority: 'p1'|'p2'|'p3',
featured, flash, source, status: 'pending'|'approved'|'rejected', createdAt,
decidedAt }`, persisted in `localStorage`.

## Contributing

All changes follow the workflow in [CHANGE_CONTROL.md](CHANGE_CONTROL.md).
