# Design: Local Admin Console + Production Hosting

- **Status:** Draft / for discussion
- **Date:** 2026-06-02
- **Scope:** A two-plane architecture that keeps the content curator out of the
  source code, plus a local admin console and production hosting options.

---

## 1. Context

Today Euro Report runs as a decoupled pipeline where **approval = merging the
parser's PR into `main`**. That has two governance problems:

- It puts the curator **inside the source repo**.
- It creates a **source commit per link approval**.

Both are undesirable. The guiding principle going forward:

> **Link/content approval must not touch or commit to source code. Source code
> changes (everything non-content) are approval-based, with documented commits.**

---

## 2. Goals / Non-goals

**Goals**
- Curator can approve links **without any access to source code** and **without
  source commits**.
- Source code changes remain PR-governed with documented commits.
- Public site stays fully static, no end-user-visible API calls.
- Cost stays at/near $0.

**Non-goals (for now)**
- Multi-admin roles, per-visitor personalization, comments/accounts.
- Full-text article storage (headlines + links only — see §6.1).

---

## 3. Two-plane architecture

Split the system into two repositories with distinct ownership.

| | **Source / code plane** | **Content / data plane** |
|---|---|---|
| Repo | `euro-report` (existing) | `euro-report-content` (new) |
| Holds | template, `scripts/*.mjs`, workflows, `feeds.json`, `keywords.json`, docs | `approved.json`, `pending.json`, `seen.json` |
| Who writes | developers, via **PR + documented commit** | curator, via the **local console**; parser bot for candidates |
| Governance | branch + PR (CHANGE_CONTROL.md) | content commits isolated to this repo; never touches source |
| Curator access | **none** | collaborator on this repo only |

The **page template (`templates/index.html`), CSS, and layout are source code** —
changed only via PR. Only the link/headline **data** is curator-managed.

### 3.1 Permission boundary (the key control)
- **Curator**: collaborator on `euro-report-content` **only**, with a
  **fine-grained PAT scoped to that repo, `Contents: read/write`**. The token
  physically cannot write to `euro-report`. This is what enforces "out of source."
- **Developers**: write on `euro-report` via PRs; need not touch content repo.
- **Automation bot**: a least-privilege **GitHub App** (or dedicated fine-grained
  PAT) used by CI for the cross-repo steps in §5.

---

## 4. Part 1 — Local admin console

A static `admin.html` the curator opens on their machine. GitHub's REST API is
**CORS-enabled**, so a static page can read/write repo files directly with a
token — no server, no proxy. It is essentially the existing `euro-report.html`
console with its `localStorage` backend pointed at the **content repo**.

```
data/pending.json   (parser bot writes candidates → content repo)
        │  read (GitHub API, curator PAT)
        ▼
admin.html  (LOCAL on curator's machine; PAT scoped to content repo ONLY)
   - review / approve / reject / set priority,featured,keywords / reorder
        │  write approved.json (commit to CONTENT repo — not source)
        ▼
euro-report-content ──▶ triggers publish (§5) ──▶ site updates
```

- **Auth:** fine-grained PAT (content repo only), pasted once, stored in
  `localStorage`, never committed, revocable. OAuth device flow was considered but
  needs a token-exchange backend (breaks "no infra") — rejected for a single curator.
- **Write-back:** commits `approved.json` (and trims `pending.json`) to the content
  repo via the Contents API. Handle `409` sha conflicts by refetching.
- **Audit trail:** content commits live in the content repo's history — dated,
  attributable approvals — while **source history stays free of approval churn**.
- **Effort:** moderate; reuse the existing console UI + a small API client
  (`getFile`, `putFile`). No infra; $0.

---

## 5. Wiring the two planes (cross-repo)

The parser (code) lives in source; its **output** (candidates) goes to content.
The build (code) lives in source; it **reads** content at deploy time. Two
cross-repo links are needed:

1. **Parser → content:** the scheduled parser Action runs in `euro-report`, then
   writes `pending.json` + `seen.json` to `euro-report-content` using the
   automation bot token. (Bot commits to the content repo are content-plane.)
2. **Content change → publish:** when `approved.json` changes in the content repo,
   the source repo's publish workflow builds `dist/` from the source template +
   the content data, and deploys. No source commit occurs.

### 5.1 Trigger options (open decision)
| Option | How | Trade-off |
|---|---|---|
| **A. `repository_dispatch`** | content repo fires an event to source on push → publish runs immediately | needs a least-privilege token (GitHub App) with `actions: write` on source; lowest latency |
| **B. Schedule** | source publish runs every ~15–30 min, fetches latest content, rebuilds | no cross-repo trigger auth; adds latency + idle runs |

**Recommendation:** A via a **GitHub App** (least privilege, free), with B as a
simple fallback for v1.

### 5.2 Reads
- If the content repo is **public**, the build fetches `approved.json` via raw URL
  — no token needed.
- If **private**, the build needs a read token (the bot). Decision is tied to repo
  visibility (§7).

---

## 6. Part 2 — Production hosting (public site)

The site is fully static, so it scales trivially behind a CDN — no server to
load-test. "Production for any user" mostly means **custom domain + a host that
scales and lets repos go private**.

| Host | Cost | Private repo? | Notes |
|---|---|---|---|
| GitHub Pages (current) | $0 | needs Pro ($4/mo) | Integrated; soft limits ~100GB/mo, 1GB site |
| **Cloudflare Pages** | $0 | ✅ free | Unlimited bandwidth, global edge, preview deploys, free privacy-friendly analytics |
| Netlify / Vercel | $0 hobby | ✅ | Vercel commercial → Pro; strong DX |
| S3 + CloudFront / Azure SWA | pennies | ✅ | Most control, more setup; overkill |

**Recommendation: Cloudflare Pages + a custom domain** — ~$0 at real traffic, lets
both repos go **private** for free, edge CDN + free analytics. Recurring cost is
essentially **just the domain (~$12/yr)**.

### 6.1 Production concerns (non-obvious)
1. **Feed/content licensing** — public republishing touches BBC/Guardian/etc. RSS
   terms. Headlines + links + attribution is the safe zone; full article text or
   heavy commercial use is not. Review before "real" product use.
2. **Freshness vs caching** — CDNs purge on deploy, so content is as fresh as the
   publish cadence (fine — approval-gated).
3. **Public polish** — favicon, OG/meta tags, sitemap, analytics opt-in.

---

## 7. Open questions / decisions

- [x] Content lives in a **separate content repo** (curator out of source).
- [x] Template/layout = **source code** (PR-governed).
- [ ] Cross-repo trigger: **`repository_dispatch` via GitHub App** (§5.1 A) vs
      **schedule** (B)?
- [ ] Parser stays an Action in the **source** repo writing to content (assumed) —
      confirm.
- [ ] Are `feeds.json` / `keywords.json` source (PR-governed) — assumed yes — or
      should the curator manage feeds/topics too?
- [ ] Host: stay on GitHub Pages, or cut over to Cloudflare Pages?
- [ ] Repo visibility: keep public, or go private (drives §5.2 read auth)?
- [ ] Custom domain: register one? which?

---

## 8. Suggested rollout

1. **Phase 1 — content repo:** create `euro-report-content`, move
   `approved.json` / `pending.json` / `seen.json` there; grant curator access to it
   only. Repoint parser output + build input across repos (bot token / GitHub App).
2. **Phase 2 — console:** build local `admin.html` (PAT scoped to content repo;
   reads pending/approved, commits approved). Immediate curator UX win, no infra.
3. **Phase 3 — hosting:** Cloudflare Pages + custom domain; optionally flip repos
   to private.
4. **Phase 4 — polish:** analytics, meta tags, favicon, licensing review.
