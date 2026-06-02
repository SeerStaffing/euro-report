// Euro Report parser — runs in the scheduled GitHub Action.
// Fetches UK feeds server-side (no CORS proxy), adds NEW headlines to
// data/approved.json (the PR that adds them IS the approval step), and records
// every fetched URL in data/seen.json so removed/rejected items never return.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJSON, writeJSON, idFor, parseFeed, computeKeywords } from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const PER_FEED = Number(process.env.PER_FEED || 10);
const MAX_APPROVED = Number(process.env.MAX_APPROVED || 150);
const MAX_SEEN = Number(process.env.MAX_SEEN || 3000);

const feeds = readJSON(join(DATA, "feeds.json"), []);
const keywords = readJSON(join(DATA, "keywords.json"), []);
const approved = readJSON(join(DATA, "approved.json"), []);
const seen = readJSON(join(DATA, "seen.json"), []);

const known = new Set(seen);
for (const it of approved) known.add(it.url);

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

const added = [];
const errors = [];

for (const feed of feeds) {
  try {
    const xml = await fetchText(feed.url);
    const items = parseFeed(xml).slice(0, PER_FEED);
    for (const it of items) {
      if (known.has(it.url)) continue;
      known.add(it.url);
      seen.push(it.url);
      added.push({
        id: idFor(it.url),
        title: it.title,
        url: it.url,
        source: feed.name,
        region: feed.region || "EU",
        priority: feed.priority || "p2",
        featured: false,
        flash: false,
        keywords: computeKeywords(it.title, keywords),
        addedAt: new Date().toISOString()
      });
    }
  } catch (e) {
    errors.push(`${feed.name}: ${e.message}`);
  }
}

// Newest first, capped.
const merged = [...added, ...approved].slice(0, MAX_APPROVED);
const trimmedSeen = seen.slice(-MAX_SEEN);

writeJSON(join(DATA, "approved.json"), merged);
writeJSON(join(DATA, "seen.json"), trimmedSeen);

const summary = [
  `Added **${added.length}** new headline(s) from ${feeds.length} feed(s).`,
  errors.length ? `\nFeed errors:\n- ${errors.join("\n- ")}` : ""
].join("");
console.log(summary.replace(/\*\*/g, ""));

// Expose results to the workflow.
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, `added=${added.length}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Parser run\n\n" + summary + "\n");
}
