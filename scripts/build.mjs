// Euro Report build — runs in the publish GitHub Action.
// Inlines approved.json + keyword labels into the template so the published
// page is fully static: no runtime fetch, nothing visible in the Network tab.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readJSON, computeKeywords } from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const DIST = join(ROOT, "dist");

const approved = readJSON(join(DATA, "approved.json"), []);
const keywords = readJSON(join(DATA, "keywords.json"), []);
const template = readFileSync(join(ROOT, "templates", "index.html"), "utf8");

// Recompute keyword tags at build time so edits to keywords.json take effect
// without re-running the parser.
const items = approved.map(it => ({
  id: it.id,
  title: it.title,
  url: it.url,
  source: it.source || "",
  region: it.region === "US" ? "US" : "EU",
  priority: ["p1", "p2", "p3"].includes(it.priority) ? it.priority : "p2",
  featured: !!it.featured,
  flash: !!it.flash,
  keywords: (it.keywords && it.keywords.length) ? it.keywords : computeKeywords(it.title, keywords)
}));

const labels = keywords.map(k => k.label);

const html = template
  .replace("__DATA__", JSON.stringify(items))
  .replace("__KEYWORDS__", JSON.stringify(labels))
  .replace("__BUILD_TIME__", new Date().toISOString());

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, "index.html"), html);

console.log(`Built dist/index.html with ${items.length} headline(s) and ${labels.length} keyword(s).`);
