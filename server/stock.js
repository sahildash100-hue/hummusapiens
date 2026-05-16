// Per-flavour stock counts, persisted to server/data/stock.json with atomic
// writes. Seeded on first run. Dependency-free, same approach as orders.js.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(dirname(fileURLToPath(import.meta.url)), "data");
const FILE = join(DATA_DIR, "stock.json");
const TMP = join(DATA_DIR, "stock.tmp.json");

const SEED = {
  "The O.G": 40,
  "The Beetrooter": 30,
  "Paprika Twist": 30,
  "Caramelised Kick": 25,
  "Lemon-Garlic Tahini Dip": 20,
  "Jalapeño Punch": 35,
  "Spicy Harissa Hummus": 20,
  "Dark Choco Muse": 25,
};

function write(obj) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TMP, JSON.stringify(obj, null, 2));
  renameSync(TMP, FILE);
}

function read() {
  if (!existsSync(FILE)) {
    write(SEED);
    return { ...SEED };
  }
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) || { ...SEED };
  } catch {
    return { ...SEED };
  }
}

export function getStock() {
  return read();
}

// Admin: set absolute counts. Accepts a partial map; clamps to >= 0 integers.
export function setStock(partial) {
  const s = read();
  for (const [name, qty] of Object.entries(partial || {})) {
    if (name in s || name in SEED) {
      s[name] = Math.max(0, Math.floor(Number(qty) || 0));
    }
  }
  write(s);
  return s;
}

// Decrement on a paid order. Clamps at 0 so it can never go negative.
export function decrementStock(items) {
  const s = read();
  for (const it of items || []) {
    if (s[it.name] !== undefined) {
      s[it.name] = Math.max(0, s[it.name] - Number(it.qty || 0));
    }
  }
  write(s);
  return s;
}
