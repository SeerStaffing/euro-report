// Shared helpers for the Euro Report pipeline. Zero dependencies (Node >=18).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function readJSON(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return fallback; }
}

export function writeJSON(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function idFor(url) {
  return createHash("sha1").update(String(url)).digest("hex").slice(0, 12);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => (name.toLowerCase() in ENTITIES ? ENTITIES[name.toLowerCase()] : m));
}

export function stripTags(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "");
}

export function cleanText(s) {
  return decodeEntities(stripTags(s)).replace(/\s+/g, " ").trim();
}

// Extract { title, url } items from an RSS or Atom feed string.
export function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let url = "";
    const linkText = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (linkText && cleanText(linkText[1])) {
      url = cleanText(linkText[1]);
    } else {
      const linkHref = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (linkHref) url = linkHref[1];
    }
    const title = titleM ? cleanText(titleM[1]) : "";
    const srcM = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = srcM ? cleanText(srcM[1]) : "";
    if (title && /^https?:\/\//i.test(url)) out.push({ title, url, source });
  }
  return out;
}

// Labels of keyword groups whose terms appear in the title.
export function computeKeywords(title, keywords) {
  const lower = " " + String(title).toLowerCase() + " ";
  return keywords.filter(k => k.terms.some(t => lower.includes(String(t).toLowerCase()))).map(k => k.label);
}

// Google News titles look like "Headline - Source"; strip the trailing source.
export function stripTrailingSource(title, source) {
  if (source && title.endsWith(" - " + source)) return title.slice(0, -(source.length + 3)).trim();
  return title;
}

// Normalized form for de-duplicating headlines across feeds/queries.
export function normalizeTitle(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Build a Google News RSS search URL.
export function gnewsUrl(query, locale) {
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&" + locale;
}

// Best-effort RSS/Atom autodiscovery from a site homepage (self-healing).
export async function autodiscoverFeed(feedUrl, fetchText) {
  let origin;
  try { origin = new URL(feedUrl).origin; } catch { return null; }
  let html;
  try { html = await fetchText(origin); } catch { return null; }
  const links = html.match(/<link[^>]+>/gi) || [];
  for (const tag of links) {
    if (/rel=["']alternate["']/i.test(tag) && /type=["']application\/(rss|atom)\+xml["']/i.test(tag)) {
      const href = tag.match(/href=["']([^"']+)["']/i);
      if (href) {
        try { return new URL(href[1], origin).href; } catch { /* skip */ }
      }
    }
  }
  return null;
}
