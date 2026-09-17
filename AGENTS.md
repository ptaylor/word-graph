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

## Technology Stack

_No technology choices have been made yet — this is a fresh repository. The
first contribution that picks a language/framework/library must fill in this
section per the template above, and must add corresponding entries under
"Development Commands"._

## Development Commands

_To be filled in once a language/build tool is chosen (install, build, test,
run, lint, etc.)._

## Repository Layout

- `dictionaries/` — word list resources used to build the graph, one
  subdirectory per dialect. See [`dictionaries/README.md`](dictionaries/README.md).

_To be kept up to date as the project structure grows further._

## Open Design Questions

These should be resolved (and documented above under Technology Stack /
Repository Layout) as work begins:

- ~~Word list / dictionary source and licensing.~~ Resolved — see "Data Sources"
  above.
- Graph construction algorithm for efficient adjacency discovery (e.g.
  bucketing words by length + wildcard pattern instead of pairwise
  comparison).
- Visualization approach (web-based graph rendering library, static site vs.
  client/server split).
- Where/how the precomputed graph data is stored, and whether the graph is
  precomputed at build time or generated on demand.
- Whether user session/view state (last search, saved views) is in scope.
- Whether proper nouns should be included in the graph (currently excluded by
  the `dictionaries/en-gb/words.txt` cleaning step).
