# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); this project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
