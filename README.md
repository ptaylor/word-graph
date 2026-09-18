<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-inverse.svg" />
  <img src="web/public/logo.svg" alt="Word Graph" width="72" height="72" align="right" />
</picture>

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
  generates `graph/`, plus the `words-at-distance.mjs` CLI query.
- [`web/`](web) — the Vite + Cytoscape.js visualization app that reads
  `graph/*.json` and renders it in the browser. The logo and favicon are
  served from [`web/public/`](web/public).
- [`branding/`](branding/README.md) — the marque: what it means, the geometry and
  colour tokens that define it, and the explorations behind it.

## Building the graph

Requires Node.js 20+.

```sh
npm run build:graph
```

Regenerates every `graph/<length>.json` file and `graph/manifest.json` from
[`dictionaries/en-gb/words.txt`](dictionaries/en-gb/words.txt). Run this
whenever the source dictionary changes.

## Finding words with a long traversal

```sh
npm run words-at-distance -- <length> <distance> [word]
```

Lists every word of `<length>` letters that has a simple traversal (no word
revisited — no cycles, so no reversals either) of exactly `<distance>`
one-letter changes starting from it, printing the full path with `→` between
words. Each path is oriented to start from whichever endpoint sorts first
alphabetically (so `motet → motel → hotel` is shown as
`hotel → motel → motet`), and the full list is sorted. `<distance>` must be
an integer greater than 1. For example, `npm run words-at-distance -- 5 4`
lists 5-letter words with a 4-step ladder starting from them.

Pass an optional `word` (must be `<length>` letters) to restrict the search
to that word and list *every* distinct traversal of exactly `<distance>`
starting from it, e.g. `npm run words-at-distance -- 5 2 hotel` lists all six
2-step ladders starting at "hotel". The result count is capped at 10,000
paths to avoid runaway memory use on large distances.

## Running the visualization

```sh
cd web
npm install   # first time only
npm run dev
```

Then open the printed local URL (e.g. http://localhost:5173). The app opens on
a search screen — type any word and press **Enter** to see that word's
neighborhood. The word's own length picks the graph, so there is no length to
choose: `hotel` searches the 5-letter graph, `hotels` the 6-letter one.

Once a graph is up, the **Within** slider sets how many changes away to include
(1–8, default 5) and re-runs the search, and **Rings**/**Compact** switches how
that subgraph is laid out — rings draw the change distance as literal distance
from the searched word, compact packs the same words more tightly. Clicking a
node lists the shortest path to it in the left-hand panel. The × in the search
field — or **Escape** — clears back to the search screen.

To produce a static production build instead:

```sh
cd web
npm run build    # outputs to web/dist/
npm run preview  # serve that build locally
```
