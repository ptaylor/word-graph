# word-graph

Builds and visualizes a graph of words connected by a single letter change
(the classic "word ladder" adjacency): two words are connected by an edge if
they are the **same length** and differ in **exactly one letter position**
(e.g. `cat` → `bat` → `bad`).

The visualization lets you explore that graph in a browser: search for a
word, pan/zoom around it, and query for all words within N letter-changes of
a starting word.

See [AGENTS.md](AGENTS.md) for the full project conventions, technology
choices, and open design questions.

## Repository layout

- [`dictionaries/`](dictionaries/README.md) — source word lists, one
  subdirectory per dialect (currently `en-gb`).
- [`graph/`](graph/README.md) — the precomputed word-adjacency graph: one
  JSON file per word length plus `manifest.json`. Generated from the
  dictionary by `scripts/build-graph.mjs` — never hand-edited.
- [`scripts/`](scripts/build-graph.mjs) — the Node.js build script that
  generates `graph/`.
- [`web/`](web) — the Vite + Cytoscape.js visualization app that reads
  `graph/*.json` and renders it in the browser.

## Building the graph

Requires Node.js 20+.

```sh
npm run build:graph
```

Regenerates every `graph/<length>.json` file and `graph/manifest.json` from
[`dictionaries/en-gb/words.txt`](dictionaries/en-gb/words.txt). Run this
whenever the source dictionary changes.

## Running the visualization

```sh
cd web
npm install   # first time only
npm run dev
```

Then open the printed local URL (e.g. http://localhost:5173). Pick a word
length, type a word, choose a max distance, and hit **Explore** to see that
word's neighborhood — or use **Show full graph** to render every word of the
selected length at once.

To produce a static production build instead:

```sh
cd web
npm run build    # outputs to web/dist/
npm run preview  # serve that build locally
```
