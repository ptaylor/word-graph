# AGENTS.md

Instructions for any human or AI agent working in this repository.

## Project Overview

Word Graph builds and visualizes a graph of words connected by a single letter
change (the classic "word ladder" adjacency): two words are connected by an
edge if they are the **same length** and differ in **exactly one letter
position** (e.g. `cat` -> `bat` -> `bad`).

The project has two parts:

1. **Graph construction** — build the word graph from a word list/dictionary.
2. **Visualization** — an interactive UI to explore, search, pan/zoom the
   graph, and run queries such as "find all words N changes away from word X".

## Core Requirements

- **Graph model**: nodes are words; an edge exists between two words of equal
  length that differ in exactly one character position.
- **Visualization**:
  - Explore the graph and move around it (pan/zoom).
  - Search for a specific word and center/highlight it.
  - Query: given a word and a distance N, find/highlight all words exactly
    (or within) N changes away, via BFS over the graph.
- **Scoping/filters**:
  - Limit the graph to words of a specific length (e.g. only 5-letter words).
  - Limit queries/traversal to a maximum distance N.
- Should scale to reasonably large dictionaries — graph construction and BFS
  queries should avoid naive O(n²) pairwise comparisons where possible (e.g.
  bucket words by length + wildcard pattern to find neighbors).

## Non-Goals (unless later requested)

- No insertions/deletions — only same-length substitutions (Hamming distance
  1, not general Levenshtein distance 1).
- No multi-language/i18n dictionary support.

## Repository Conventions for Agents

### 1. Documentation-first technology decisions

Whenever a new language, library, framework, or major dependency is
introduced to this repository, **update this AGENTS.md file in the same
change** with:

- What was added and why.
- A "Best Practices" sub-section for that technology covering idiomatic
  usage, project-specific conventions, and links to authoritative docs.
- Any new build/run/test/lint commands, added under "Development Commands".

Do not let this file go stale — it is the source of truth for how to work in
this repo. If you're unsure of current best practices for a technology,
research it (official docs) before writing the section rather than relying on
possibly outdated knowledge.

This includes keeping [`.gitignore`](.gitignore) up to date: when a language,
package manager, build tool, or IDE/editor tooling is introduced, add its
standard ignore patterns (build output, dependency/package directories,
caches, local env files, editor metadata, etc.) in the same change.

### 2. Technology Stack section format

Add new entries under "Technology Stack" using this template:

```markdown
### <Technology Name>
- **Role**: what it's used for in this project
- **Version**: pinned/minimum version
- **Best Practices**:
  - ...
- **Docs**: link(s) to official documentation
```

### 3. Testing

- Every new module/feature should ship with tests using the testing tool
  established for its stack (record the chosen tool in the relevant
  Technology Stack entry).
- Run the full test suite before considering a change complete.

### 4. Attribute AI-assisted commits

Any git commit containing code produced with the help of an AI coding
assistant must name the assistant, the model, and the model version in the
commit message (e.g. as a trailer). For example:

```
Assisted-by: GitHub Copilot (Claude Sonnet 4.5)
```

If the exact model version is unknown, state the assistant/product name and
whatever version identifier is available rather than omitting it.

## Data Sources

### Dictionaries (word lists)

- **Role**: source words for graph construction, one dialect per subdirectory.
- **Location**: [`dictionaries/`](dictionaries/README.md) at the repo root.
- **Current dictionaries**:
  - [`dictionaries/en-gb/`](dictionaries/en-gb/README.md) — standard British/Irish
    English words, sourced from the [English Speller Database (ESDB, formerly
    SCOWL)](https://github.com/en-wl/wordlist). See that folder's README for the
    exact file, version, license, and cleaning steps applied.
- **Convention**: each dictionary folder documents its own upstream source,
  license, and retrieval date. When adding a new dialect/word list, follow
  [`dictionaries/README.md`](dictionaries/README.md)'s "Adding a new dictionary"
  steps and update this section with the new entry.

### Graph Data Format

Full specification: [`graph/README.md`](graph/README.md).

- **Model**: nodes are words, edges connect same-length words differing in
  exactly one letter position. Edges never cross word lengths, so the graph
  splits cleanly into one independent subgraph per length.
- **Storage**: one JSON file per word length, e.g. `graph/5.json`,
  `graph/6.json`, ... See [`graph/README.md`](graph/README.md) for the exact
  schema (fields, index semantics, guarantees).
- **Why per-length JSON, not a database**: measured against the current
  `dictionaries/en-gb/words.txt` (79,342 words), the full graph has 62,895
  edges; the largest single length file (7 letters) is ~240 KB of JSON, and
  every length combined is ~1.7 MB raw (smaller gzipped). At this scale a
  database/binary format buys nothing — plain JSON is simplest to generate,
  diff, debug, and consume from any language, and per-length partitioning
  directly matches the "limit graph to a specific word length" requirement:
  loading a length means loading exactly one file, nothing more.
- **Build time**: constructing the full adjacency (bucket by length +
  wildcard pattern, e.g. `"c_t"` for `cat`) took well under a second for all
  79,342 words. Treat these files as a **generated build artifact**: produce
  them from `dictionaries/en-gb/words.txt` via a build step once a language
  is chosen, don't hand-edit them, and re-run the build whenever the source
  dictionary changes.
- **Known data characteristic**: at ESDB size 60, 56% of words (44,439 of
  79,342) have zero same-length one-letter neighbors and are isolated nodes.
  Degree of the remaining connected words averages 3.6, max 30 (short common
  words like `cot`, `mad`, `pat`). See the related open question below about
  whether a smaller/denser dictionary size is preferable for this game.

## Technology Stack

### Node.js
- **Role**: build tooling — generates `graph/*.json` from
  `dictionaries/en-gb/words.txt` (see [`scripts/build-graph.mjs`](scripts/build-graph.mjs)).
  Chosen for zero-friction scripting and because the eventual visualization
  is expected to be a web UI, keeping the whole stack in one language.
- **Version**: 20+ (native ESM, no transpilation needed). Developed against 25.8.1.
- **Best Practices**:
  - Use native ESM (`"type": "module"` in `package.json`, `.mjs`/`import`),
    not CommonJS `require`.
  - Prefer `node:fs/promises` async APIs over sync/callback variants.
  - No dependencies yet — keep it that way for the build script unless a
    real need arises (it's a straightforward file transform).
- **Docs**: https://nodejs.org/docs/latest/api/

### Vite
- **Role**: dev server and build tool for the visualization web app in
  [`web/`](web/). Serves `web/public/graph` (symlinked to the top-level
  `graph/` directory) so the app always reads the latest generated graph
  files without copying them.
- **Version**: ^7.
- **Best Practices**:
  - Static assets that must keep a fixed URL path (here, `/graph/*.json`)
    belong in `public/`, not `src/` — files under `public/` are served
    as-is and copied verbatim on build.
  - Keep `web/` as a self-contained npm project (its own `package.json`)
    rather than merging it into the root build-tooling `package.json`,
    since the two have unrelated dependency sets.
- **Docs**: https://vite.dev/guide/

### Cytoscape.js
- **Role**: renders and lays out the word graph in the browser — nodes/edges,
  pan/zoom, and the `breadthfirst`/`cose`/`grid` layouts used by the app.
  Chosen over a from-scratch D3/canvas implementation because it already
  provides graph-shaped interaction (pan/zoom, layouts, styling) out of the
  box.
- **Version**: ^3.30.
- **Best Practices**:
  - Build the full node/edge element array first, then call `cy.add()` once
    — avoid adding elements one at a time, which triggers repeated re-layout.
  - Pick the layout by graph size: `breadthfirst` for a BFS-rooted
    exploration (radiates from the queried word), `cose` (force-directed)
    only for smaller full-length graphs, `grid` as a fast fallback once node
    count gets large enough that force-directed layout would be slow.
  - Cytoscape's style parser doesn't support 4/8-digit hex colors
    (`#8888`) — use 3/6-digit hex or `rgba()`.
- **Docs**: https://js.cytoscape.org/

## Development Commands

- `npm run build:graph` — regenerate `graph/*.json` from
  `dictionaries/en-gb/words.txt`. Run whenever the source dictionary changes.
- `npm run words-at-distance -- <length> <distance> [word]` — list every word
  of `<length>` letters that has a simple (no revisited word) traversal of
  exactly `<distance>` one-letter changes starting from it, printing the full
  path with `→` between words. Each path is oriented to start from whichever
  endpoint sorts first alphabetically, and the list is sorted. `<distance>`
  must be an integer > 1. An optional `word` restricts the search to that
  word and instead lists every distinct traversal from it (capped at 10,000
  paths). See [`scripts/words-at-distance.mjs`](scripts/words-at-distance.mjs).
- `cd web && npm install` — install the visualization app's dependencies
  (first time only).
- `cd web && npm run dev` — start the Vite dev server for the visualization
  app.
- `cd web && npm run build` — produce a static production build of the
  visualization app in `web/dist/`.

## Repository Layout

- `dictionaries/` — word list resources used to build the graph, one
  subdirectory per dialect. See [`dictionaries/README.md`](dictionaries/README.md).
- `graph/` — precomputed word-adjacency graph, one JSON file per word length
  plus `manifest.json` (lengths present and their word/edge counts). Generated
  build artifact; see [`graph/README.md`](graph/README.md).
- `scripts/` — Node.js build scripts: `build-graph.mjs` (generates `graph/`)
  and `words-at-distance.mjs` (CLI query over a generated graph).
- `web/` — Vite + Cytoscape.js visualization app. Explore/search/pan-zoom the
  graph and run BFS distance queries. `web/public/graph` is a symlink to the
  top-level `graph/` directory.
- `icons/` — shipped logo assets: a bold `W` with a routed graph drawn inside it,
  as hand-authored SVG (light ink, dark ink, and a self-backgrounded app icon).
  See [`icons/README.md`](icons/README.md) for the geometry, colour tokens, and the
  constraints that govern editing them.
- `branding/` — logo design explorations and preview sheets. Working material that
  led to `icons/`, not shipped assets.

_To be kept up to date as the project structure grows further._

## Open Design Questions

These should be resolved (and documented above under Technology Stack /
Repository Layout) as work begins:

- ~~Word list / dictionary source and licensing.~~ Resolved — see "Data Sources"
  above.
- ~~Graph construction algorithm for efficient adjacency discovery.~~ Resolved
  — bucket by length + wildcard pattern; see "Graph Data Format" above.
- ~~Where/how the precomputed graph data is stored, and whether the graph is
  precomputed at build time or generated on demand.~~ Resolved — per-length
  JSON adjacency files, generated at build time; see "Graph Data Format" above.
- ~~Visualization approach (web-based graph rendering library, static site vs.
  client/server split).~~ Resolved — static client-side app, Vite +
  Cytoscape.js, in `web/`; see "Technology Stack" above. No backend: the app
  fetches `graph/*.json` directly and runs BFS queries in the browser.
- Whether user session/view state (last search, saved views) is in scope.
- Whether proper nouns should be included in the graph (currently excluded by
  the `dictionaries/en-gb/words.txt` cleaning step).
- Given 56% of the current word list is isolated (no same-length one-letter
  neighbor — see "Graph Data Format"), whether to trim the dictionary to a
  smaller/more-common ESDB size (e.g. 35 or 50) to produce a denser, more
  useful graph, or keep size 60 and simply let isolated words show as such.
