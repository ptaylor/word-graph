# Graph Data Format

This directory holds the precomputed word-adjacency graph used for queries and
visualization. It is a **generated build artifact** — produced from
[`dictionaries/en-gb/words.txt`](../dictionaries/en-gb/words.txt) by a build
step, never hand-edited. Regenerate it whenever the source dictionary changes
or a language/tooling choice lets that build step be implemented (see
[AGENTS.md](../AGENTS.md) Open Design Questions).

## Model

- **Node**: a word.
- **Edge**: an undirected connection between two words of the **same length**
  that differ in **exactly one letter position** (e.g. `cat` — `bat` — `bad`).
- Edges never cross word lengths, so the graph splits cleanly into one
  independent subgraph per length. There is no single "whole graph" file —
  each length is self-contained.

## File layout

```
graph/
  manifest.json
  1.json
  2.json
  3.json
  ...
  23.json
```

One file per distinct word length present in the source dictionary, named
`<length>.json`. A UI that limits exploration to a specific word length loads
exactly one file and nothing else.

`manifest.json` lists every generated length without requiring a directory
listing: `{ "lengths": [{ "length": 5, "wordCount": 5170, "edgeCount": 12274 }, ...] }`,
sorted ascending by `length`. Consumers (e.g. the visualization app) fetch
this first to populate a length selector.

## File schema

Each file is a single JSON object:

```json
{
  "length": 5,
  "words": ["aback", "abaft", "abase", "..."],
  "adjacency": [[], [], [12, 45], "..."]
}
```

| Field        | Type                | Description |
|--------------|---------------------|--------------|
| `length`     | integer             | Word length this file covers (matches the filename). |
| `words`      | array of strings    | All dictionary words of this length, **sorted alphabetically**. The array position of a word is its **node index**, used everywhere else in the file instead of repeating the string. |
| `adjacency`  | array of int arrays | Parallel to `words` — `adjacency[i]` is the list of node indices that are one-letter neighbors of `words[i]`. `[]` means an isolated word (no same-length one-letter neighbor in this dictionary). |

Properties consumers can rely on:

- `adjacency.length === words.length`.
- The graph is undirected: if `j` appears in `adjacency[i]`, then `i` appears
  in `adjacency[j]`.
- `words[i]` is stable for a given build of a given dictionary version, but is
  **not** guaranteed stable across dictionary updates (indices are
  recomputed on every regeneration) — don't persist raw indices outside a
  single load of the file.
- Neighbor lists are not required to be sorted or deduplicated beyond what
  the construction algorithm naturally produces (currently sorted ascending,
  deduplicated, since each pair of same-length words differs by construction
  in exactly one position and therefore appears in exactly one wildcard
  bucket — see below).

## Construction algorithm

Naive pairwise comparison is O(n²) per length. Instead, bucket by
**wildcard pattern**: for each word, generate one pattern per letter position
with that position blanked (`cat` → `_at`, `c_t`, `ca_`). Two words are
neighbors exactly when they share a wildcard pattern. This is O(n · L) to
build (L = word length) instead of O(n²), and every pair sharing a bucket is
guaranteed to differ in exactly the blanked position only (they're identical
everywhere else by construction).

```text
for each word w of length L:
    for i in 0..L-1:
        pattern = w with position i replaced by "_"
        bucket[pattern].append(w)

for each bucket with more than one word:
    every pair in the bucket is an edge
```

## Measured size (en-gb, ESDB size 60, 79,342 words)

| length | words | edges | isolated | JSON size |
|---|---|---|---|---|
| 5 | 5,170 | 12,274 | 681 | 166 KB |
| 6 | 8,376 | 11,473 | 2,360 | 202 KB |
| 7 (largest file) | 11,639 | 10,301 | 4,821 | 243 KB |
| 8 | 12,668 | 4,976 | 7,221 | 218 KB |
| **all lengths** | **79,342** | **62,895** | **44,439 (56%)** | **~1.7 MB total** |

Full build time from the raw word list: well under a second. See
[AGENTS.md](../AGENTS.md) "Graph Data Format" for the rationale behind this
format and the follow-up question about the high isolated-word rate.
