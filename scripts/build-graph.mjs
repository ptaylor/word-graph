#!/usr/bin/env node
// Builds graph/<length>.json adjacency files from dictionaries/en-gb/words.txt.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dictionaryPath = path.join(rootDir, "dictionaries/en-gb/words.txt");
const outputDir = path.join(rootDir, "graph");

function groupByLength(words) {
  const byLength = new Map();
  for (const word of words) {
    const list = byLength.get(word.length);
    if (list) {
      list.push(word);
    } else {
      byLength.set(word.length, [word]);
    }
  }
  return byLength;
}

// Bucket by wildcard pattern (one blanked position) so every pair sharing a
// bucket is guaranteed to differ in exactly that position. O(n * L) instead
// of the O(n^2) naive pairwise comparison.
function buildAdjacency(words) {
  const adjacency = words.map(() => new Set());
  const buckets = new Map();

  words.forEach((word, index) => {
    for (let i = 0; i < word.length; i++) {
      const pattern = word.slice(0, i) + "_" + word.slice(i + 1);
      const bucket = buckets.get(pattern);
      if (bucket) {
        bucket.push(index);
      } else {
        buckets.set(pattern, [index]);
      }
    }
  });

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        adjacency[bucket[a]].add(bucket[b]);
        adjacency[bucket[b]].add(bucket[a]);
      }
    }
  }

  return adjacency.map((set) => [...set].sort((a, b) => a - b));
}

async function main() {
  const raw = await readFile(dictionaryPath, "utf8");
  const words = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const byLength = groupByLength(words);
  await mkdir(outputDir, { recursive: true });

  const manifest = [];
  for (const [length, lengthWords] of [...byLength.entries()].sort((a, b) => a[0] - b[0])) {
    lengthWords.sort();
    const adjacency = buildAdjacency(lengthWords);
    const edgeCount = adjacency.reduce((sum, n) => sum + n.length, 0) / 2;
    const payload = { length, words: lengthWords, adjacency };
    const outputPath = path.join(outputDir, `${length}.json`);
    await writeFile(outputPath, JSON.stringify(payload));
    manifest.push({ length, wordCount: lengthWords.length, edgeCount });
    console.log(`graph/${length}.json: ${lengthWords.length} words, ${edgeCount} edges`);
  }

  await writeFile(
    path.join(outputDir, "manifest.json"),
    JSON.stringify({ lengths: manifest })
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
