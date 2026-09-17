// Loads per-length graph JSON files and runs BFS distance queries over them.

const cache = new Map();

export async function loadManifest() {
  const res = await fetch("/graph/manifest.json");
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
  const { lengths } = await res.json();
  return lengths.sort((a, b) => a.length - b.length);
}

export async function loadLength(length) {
  if (cache.has(length)) return cache.get(length);
  const res = await fetch(`/graph/${length}.json`);
  if (!res.ok) throw new Error(`Failed to load graph/${length}.json: ${res.status}`);
  const data = await res.json();
  const wordIndex = new Map(data.words.map((word, i) => [word, i]));
  const entry = { ...data, wordIndex };
  cache.set(length, entry);
  return entry;
}

// Returns a Map of node index -> distance from startIndex, for nodes within maxDistance.
export function bfsDistances(adjacency, startIndex, maxDistance) {
  const distances = new Map([[startIndex, 0]]);
  const queue = [startIndex];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentDistance = distances.get(current);
    if (currentDistance === maxDistance) continue;
    for (const neighbor of adjacency[current]) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, currentDistance + 1);
      queue.push(neighbor);
    }
  }
  return distances;
}
