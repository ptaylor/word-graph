# Dictionaries

This directory holds the word list resources used to build the word graph.
Each subdirectory is one dictionary/dialect, downloaded from an upstream
authoritative source rather than hand-curated.

## Layout convention

```
dictionaries/
  <dialect>/
    README.md   - where this specific list came from, license, how it was derived
    LICENSE     - upstream copyright/license notice (required for redistribution)
    words.txt   - cleaned list: one lowercase word per line, alphabetic only, sorted, deduped
    raw/        - the untouched upstream download, kept for provenance/reproducibility
```

`words.txt` is the file graph-construction code should read. `raw/` is not
processed at runtime — it exists so the cleaning step is reproducible and
auditable.

## Available dictionaries

- [`en-gb/`](en-gb/README.md) — Standard British/Irish English words.

## Adding a new dictionary

1. Identify an authoritative upstream source (a maintained project, not a
   random word list) and check its license permits redistribution.
2. Add a new `dictionaries/<dialect>/` folder following the layout above.
3. Document the exact source URL, version/release, retrieval date, and any
   cleaning steps applied in that dialect's `README.md`.
4. Copy the upstream license/copyright notice into `LICENSE`.
5. Update this file's "Available dictionaries" list and the root
   [AGENTS.md](../AGENTS.md) "Data Sources" section.
