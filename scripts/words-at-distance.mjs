#!/usr/bin/env node
// CLI: list words of a given length that have a simple traversal of exactly
// the given distance (a path of that many one-letter-change edges, visiting
// no word twice -- no cycles, and therefore no immediate reversals either).
// Each match is printed as the full path, e.g. "board \u2192 hoard \u2192 hoary".
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function printUsage() {
  console.error("Usage: node scripts/words-at-distance.mjs <length> <distance>");
  console.error("  length    word length (must have a matching graph/<length>.json)");
  console.error("  distance  exact traversal distance, an integer > 1");
}

function parseArgs(argv) {
  const [lengthArg, distanceArg] = argv;
  const length = Number(lengthArg);
  const distance = Number(distanceArg);
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`Invalid length: ${lengthArg}`);
  }
  if (!Number.isInteger(distance) || distance <= 1) {
    throw new Error(`Invalid distance: ${distanceArg} (must be an integer > 1)`);
  }
  return { length, distance };
}

// Finds a simple path (no repeated words) of exactly `distance` edges
// starting at `start`. Backtracking DFS, exits as soon as one is found.
// Returns the path as an array of node indices, or null if none exists.
function findExactSimplePath(adjacency, start, distance) {
  const visited = new Set([start]);
  const path = [start];

  function dfs(node, remaining) {
    if (remaining === 0) return true;
    for (const neighbor of adjacency[node]) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      path.push(neighbor);
      if (dfs(neighbor, remaining - 1)) return true;
      path.pop();
      visited.delete(neighbor);
    }
    return false;
  }

  return dfs(start, distance) ? path.slice() : null;
}

// A simple path from `start` visits at most componentSize distinct words, so
// it has at most componentSize - 1 edges. Computing this up front lets us
// reject impossible distances instantly instead of exhausting the backtracking
// search space proving a negative (which is what makes longest-simple-path
// search NP-hard in general).
function componentSizes(adjacency) {
  const sizeOf = new Array(adjacency.length).fill(0);
  const seen = new Array(adjacency.length).fill(false);
  for (let i = 0; i < adjacency.length; i++) {
    if (seen[i]) continue;
    const component = [i];
    seen[i] = true;
    let head = 0;
    while (head < component.length) {
      const current = component[head++];
      for (const neighbor of adjacency[current]) {
        if (seen[neighbor]) continue;
        seen[neighbor] = true;
        component.push(neighbor);
      }
    }
    for (const index of component) sizeOf[index] = component.length;
  }
  return sizeOf;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const { length, distance } = args;
  const graphPath = path.join(rootDir, "graph", `${length}.json`);
  let data;
  try {
    data = JSON.parse(await readFile(graphPath, "utf8"));
  } catch (err) {
    console.error(`Failed to load ${graphPath}: ${err.message}`);
    console.error("Run `npm run build:graph` first if graph/*.json is missing.");
    process.exitCode = 1;
    return;
  }

  const { words, adjacency } = data;
  const sizeOf = componentSizes(adjacency);
  const matches = [];
  for (let i = 0; i < words.length; i++) {
    if (sizeOf[i] <= distance) continue; // component too small for a path this long
    const path = findExactSimplePath(adjacency, i, distance);
    if (path) matches.push(path.map((index) => words[index]).join(" \u2192 "));
  }

  for (const line of matches) {
    console.log(line);
  }
  console.error(`${matches.length} of ${words.length} ${length}-letter words have a traversal of exactly ${distance}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
