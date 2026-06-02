// Euro Report parser — runs in the scheduled GitHub Action.
//
// Sources:
//   1. Direct feeds (data/feeds.json) — curated EU + US RSS.
//   2. Tier-1 discovery (data/discovery.json) — Google News RSS search per region,
//      pulling articles from across the whole press (sources nobody pre-listed).
//
// Self-healing (data/feed-health.json):
//   - tracks per-source success/failure across runs;
//   - on a direct-feed failure, tries RSS autodiscovery from the site homepage and
//     remembers the resolved URL for next time;
//   - flags sources unhealthy after repeated failures (reported, still retried).
//
// New, deduped headlines (by URL and by normalized title) are added to
// data/approved.json; every fetched URL is recorded in data/seen.json.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync } from "node:fs";
import {
  readJSON, writeJSON, idFor, parseFeed, computeKeywords,
  normalizeTitle, stripTrailingSource, gnewsUrl, autodiscoverFeed
} from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

const PER_FEED = Number(process.env.PER_FEED || 40);
const PER_QUERY = Number(process.env.PER_QUERY || 80);
const MAX_APPROVED = Number(process.env.MAX_APPROVED || 1000);
const MAX_SEEN = Number(process.env.MAX_SEEN || 12000);
const FAIL_THRESHOLD = Number(process.env.FAIL_THRESHOLD || 4);

const feeds = readJSON(join(DATA, "feeds.json"), []);
const discovery = readJSON(join(DATA, "discovery.json"), { regions: [] });
const keywords = readJSON(join(DATA, "keywords.json"), []);
const approved = readJSON(join(DATA, "approved.json"), []);
const seen = readJSON(join(DATA, "seen.json"), []);
const health = readJSON(join(DATA, "feed-health.json"), {});

const knownUrls = new Set(seen);
const knownTitles = new Set();
for (const it of approved) {
  knownUrls.add(it.url);
  knownTitles.add(normalizeTitle(it.title));
}

const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const added = [];
const errors = [];
const healed = [];
const perRegion = {};
const perSource = {};

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "EuroReportBot/1.0 (+https://github.com/SeerStaffing/euro-report)" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function recordOk(key) {
  const h = health[key] || (health[key] = {});
  h.fails = 0; h.lastOk = now(); h.lastError = null; h.unhealthy = false;
}
function recordFail(key, msg) {
  const h = health[key] || (health[key] = {});
  h.fails = (h.fails || 0) + 1; h.lastError = msg;
  if (h.fails >= FAIL_THRESHOLD) h.unhealthy = true;
}

// Fetch a source, self-healing via autodiscovery for direct feeds.
async function fetchSource(key, url, allowDiscovery) {
  const h = health[key] || (health[key] = {});
  const tryUrl = h.resolvedUrl || url;
  try {
    const xml = await fetchText(tryUrl);
    recordOk(key);
    return xml;
  } catch (e) {
    if (allowDiscovery) {
      try {
        const found = await autodiscoverFeed(url, fetchText);
        if (found && found !== tryUrl) {
          const xml = await fetchText(found);
          h.resolvedUrl = found;
          recordOk(key);
          healed.push(`${key} → ${found}`);
          return xml;
        }
      } catch { /* fall through to failure */ }
    }
    recordFail(key, e.message);
    throw e;
  }
}

function addCandidate({ title, url, source, region, priority }) {
  if (!title || !/^https?:\/\//i.test(url || "")) return;
  if (knownUrls.has(url)) return;
  const nt = normalizeTitle(title);
  if (nt.length < 8) return;            // skip junk/empty titles
  if (knownTitles.has(nt)) return;      // de-dup identical headlines across sources
  knownUrls.add(url); knownTitles.add(nt); seen.push(url);
  added.push({
    id: idFor(url),
    title,
    url,
    source: source || "",
    region: region === "US" ? "US" : "EU",
    priority: ["p1", "p2", "p3"].includes(priority) ? priority : "p3",
    featured: false,
    flash: false,
    keywords: computeKeywords(title, keywords),
    addedAt: now()
  });
  perRegion[region] = (perRegion[region] || 0) + 1;
  if (source) perSource[source] = (perSource[source] || 0) + 1;
}

// 1) Direct curated feeds.
for (const feed of feeds) {
  try {
    const xml = await fetchSource(feed.url, feed.url, true);
    for (const it of parseFeed(xml).slice(0, PER_FEED)) {
      addCandidate({ title: it.title, url: it.url, source: feed.name, region: feed.region, priority: feed.priority });
    }
  } catch (e) {
    errors.push(`${feed.name}: ${e.message}`);
  }
}

// 2) Tier-1 Google News discovery per region.
const perQuery = Number(discovery.perQuery || PER_QUERY);
for (const block of discovery.regions || []) {
  for (const q of block.queries || []) {
    const qurl = gnewsUrl(q, block.locale);
    try {
      const xml = await fetchSource(qurl, qurl, false);
      for (const it of parseFeed(xml).slice(0, perQuery)) {
        const title = stripTrailingSource(it.title, it.source);
        addCandidate({ title, url: it.url, source: it.source || "Google News", region: block.region, priority: block.priority });
      }
    } catch (e) {
      errors.push(`GNews ${block.region} "${q}": ${e.message}`);
    }
    await sleep(250);   // be polite to Google News between queries
  }
}

// Newest first, capped.
const merged = [...added, ...approved].slice(0, MAX_APPROVED);

writeJSON(join(DATA, "approved.json"), merged);
writeJSON(join(DATA, "seen.json"), seen.slice(-MAX_SEEN));
writeJSON(join(DATA, "feed-health.json"), health);

const unhealthy = Object.entries(health).filter(([, h]) => h.unhealthy).map(([k]) => k);
const topSources = Object.entries(perSource).sort((a, b) => b[1] - a[1]).slice(0, 15);

const lines = [];
lines.push(`Added ${added.length} new headline(s).`);
lines.push(`By region: ${Object.entries(perRegion).map(([r, n]) => `${r}=${n}`).join(", ") || "none"}.`);
lines.push(`Total in approved.json: ${merged.length} (cap ${MAX_APPROVED}).`);
if (healed.length) lines.push(`\nSelf-healed feeds (${healed.length}):\n- ${healed.join("\n- ")}`);
if (unhealthy.length) lines.push(`\nUnhealthy sources (${unhealthy.length}):\n- ${unhealthy.join("\n- ")}`);
if (topSources.length) lines.push(`\nTop sources:\n${topSources.map(([s, n]) => `  ${n}  ${s}`).join("\n")}`);
if (errors.length) lines.push(`\nFetch errors (${errors.length}):\n- ${errors.join("\n- ")}`);
const summary = lines.join("\n");
console.log(summary);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `added=${added.length}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Parser run\n\n```\n" + summary + "\n```\n");
