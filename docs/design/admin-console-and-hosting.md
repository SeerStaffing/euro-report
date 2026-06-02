# Design: Local Admin Console + Production Hosting

- **Status:** Draft / for discussion
- **Date:** 2026-06-02
- **Scope:** Two related-but-independent proposals — (1) a local admin console
  that edits content and pushes to GitHub, and (2) hosting for a production,
  publicly-accessible site.

---

## 1. Context

Today Euro Report runs as a decoupled pipeline:

```
parser (Action, cron) ──▶ review PR ──▶ merge = approval ──▶ publish (Action) ──▶ GitHub Pages
```

- The **public page** is fully static (`dist/index.html`), inlines approved data,
  and makes zero runtime API calls.
- **Approval** currently happens by reviewing/merging the parser's PR.
- The legacy `euro-report.html` (in-browser admin + `localStorage`) is retained
  for local use but is not deployed.

Two open desires:
- A nicer **admin console** than editing PR diffs — ideally local, pushing edits
  to GitHub "after the fact."
- Clarity on what a **production, public** deployment looks like for hosting.

These are orthogonal: the console governs *who writes content*; hosting governs
*where it's served*. They compose without conflict.

---

## 2. Goals / Non-goals

**Goals**
- Keep the public site fully static, no end-user-visible API calls.
- Keep recurring cost at/near $0.
- Preserve a human approval gate.
- Avoid standing servers where possible.

**Non-goals (for now)**
- Multi-admin accounts / role management.
- Per-visitor personalization, comments, or accounts.
- Full-text article storage (headlines + links only — see §5.1).

---

## 3. Part 1 — Local admin console (pushes to GitHub)

### 3.1 Key enabler
GitHub's REST API is **CORS-enabled**, so a static HTML page (including
`file://`) can read and write repo files directly with a token — no server,
no proxy. This makes the console essentially the existing `euro-report.html`
admin UI with its `localStorage` backend swapped for the GitHub Contents API.

### 3.2 Architecture

```
data/pending.json   (parser writes candidates here, server-side cron)
        │  read
        ▼
admin.html  (LOCAL, on the admin's machine)
   - paste fine-grained PAT once → localStorage
   - review / approve / reject / set priority,featured,keywords / reorder
        │  write (Contents API commit)
        ▼
data/approved.json on GitHub ──▶ publish Action ──▶ site updates
```

### 3.3 Auth
- **Fine-grained Personal Access Token (PAT)**, scoped to this repo only,
  `Contents: read/write`. Pasted once, stored in `localStorage`, never committed,
  revocable anytime.
- Alternative considered: GitHub OAuth **device flow** (no PAT to manage) — but
  it requires a small token-exchange backend (the client secret can't live in a
  static page), which breaks the "no infra" property. **Rejected** for a single
  trusted admin; PAT is the pragmatic choice.

### 3.4 Data flow / write-back options
The console reads `pending.json` + `approved.json`, lets the admin curate, then
commits the updated `approved.json` (and trimmed `pending.json`). The commit
triggers the existing publish workflow.

| Option | Pros | Cons |
|---|---|---|
| **A. Direct commit to `main`** | one click, fast | bypasses branch+PR rule (acceptable for *content*, not *code*) |
| **B. Commit to branch + auto-PR** | full audit trail | extra merge step |

**Recommendation:** Option A, with a documented carve-out that **content/data
edits (`data/*.json`) may commit directly to `main`**, while **code changes keep
the branch+PR rule**. Parser fills `pending.json`; console promotes
`pending → approved`. Clean separation, fast approvals, publish stays automatic.

### 3.5 Engineering notes
- Reuse the existing admin UI; add a small GitHub API client:
  `getFile(path) → {content, sha}`, `putFile(path, content, sha, message)`.
- Handle `409` (sha conflict) by refetching and re-applying.
- `approved.json` is small (~150 items); no pagination concerns.
- Rate limits are a non-issue for a single admin.

### 3.6 Effort & risk
- **Effort:** moderate — mostly reskinning the existing console + the API client.
- **Infra:** none; stays $0.
- **Risk:** the PAT is the soft spot — narrowly scoped + revocable, but it is a
  credential to guard. Mitigation: fine-grained scope, short expiry, easy rotation.

---

## 4. Part 2 — Production hosting (public site)

The site is fully static, so it scales trivially behind a CDN — there is no
server to load-test. "Production for any user" mostly means **custom domain +
a host that scales and lets the repo go private**.

### 4.1 Options

| Host | Cost | Private repo? | Notes |
|---|---|---|---|
| GitHub Pages (current) | $0 | needs Pro ($4/mo) | Integrated; soft limits ~100GB/mo, 1GB site |
| **Cloudflare Pages** | $0 | ✅ free | Unlimited bandwidth, global edge, preview deploys, free privacy-friendly analytics |
| Netlify / Vercel | $0 hobby | ✅ | Vercel commercial use → Pro; strong DX |
| S3 + CloudFront / Azure SWA | pennies | ✅ | Most control, more setup; overkill here |

### 4.2 Recommendation
**Cloudflare Pages + a custom domain.** It is the single move that:
- keeps cost ~$0 at real traffic (unlimited bandwidth on free),
- lets the repo **go private for free** (resolves the earlier deferred goal — no
  Pro needed),
- adds edge CDN + free Web Analytics (no cookies).

The publish workflow changes from "deploy to Pages" to "build + deploy to
Cloudflare" (Cloudflare's GitHub integration, or `wrangler` in the Action).

### 4.3 Cost
- Recurring cost is essentially **just the domain (~$12/yr)**.
- Everything else stays free unless dynamic features are added.

### 4.4 Migration steps (Pages → Cloudflare Pages)
1. Create a Cloudflare account + Pages project linked to the repo (or deploy via
   `wrangler` from the existing Action).
2. Point the build output (`dist/`) at the Pages project.
3. Add the custom domain + DNS (CNAME), enable automatic HTTPS.
4. (Optional) flip the GitHub repo to **private** — Cloudflare still deploys.
5. Retire the GitHub Pages deploy job (or keep as a staging mirror).

### 4.5 Production concerns (non-obvious)
1. **Feed/content licensing** — public republishing at scale touches BBC/Guardian/
   etc. RSS terms. Headlines + links + attribution is the safe zone; storing full
   article text or heavy commercial use is not. Review before "real" product use.
2. **Freshness vs caching** — CDNs cache aggressively; Pages/Cloudflare purge on
   deploy, so content is only as fresh as the publish cadence (fine — content is
   approval-gated anyway).
3. **Public polish** — favicon, OG/meta tags, sitemap, analytics opt-in: the small
   items separating "demo on github.io" from "product on a domain."

---

## 5. Combined target architecture

```
parser (Action, cron) ──▶ data/pending.json
                                  │
                   local admin.html (PAT) curates + commits
                                  │
                          data/approved.json (main)
                                  │
                     publish Action: build dist/index.html
                                  │
                     deploy ──▶ Cloudflare Pages (custom domain, CDN)
```

- Repo can be **private**; site stays public via Cloudflare.
- No standing servers; cost ≈ domain only.

---

## 6. Open questions / decisions

- [ ] Console write-back: confirm **Option A** (direct content commits to `main`)
      vs **Option B** (branch + PR).
- [ ] Reintroduce `data/pending.json` as the parser's target (so the console
      promotes to `approved.json`), instead of the parser writing `approved.json`
      directly?
- [ ] Host: stay on GitHub Pages for now, or cut over to Cloudflare Pages?
- [ ] Custom domain: register one? which?
- [ ] Repo visibility: keep public, or go private once Cloudflare is in place?

## 7. Suggested rollout

1. **Phase 1 — console:** build `admin.html` (local, PAT, reads pending/approved,
   commits approved). Lowest risk, no infra, immediate UX win.
2. **Phase 2 — pending split:** parser writes `pending.json`; console promotes.
3. **Phase 3 — hosting:** Cloudflare Pages + custom domain; optionally flip repo
   to private.
4. **Phase 4 — polish:** analytics, meta tags, favicon, licensing review.
