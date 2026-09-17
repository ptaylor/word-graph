# en-gb — Standard British/Irish English words

## Source

- **Project**: [English Speller Database (ESDB)](https://wordlist.aspell.net/), formerly
  known as SCOWL (Spell Checker Oriented Word Lists), maintained by Kevin Atkinson.
  Repository: https://github.com/en-wl/wordlist
- **File**: `en_GB-ise.txt` — the British English word list ("-ise" spelling,
  e.g. `realise`, `colour`), ESDB size 60 ("medium-large", the size used for
  default spell-checking dictionaries — vetted for errors, no proper-noun-only
  or joke entries).
- **Exact download URL**:
  https://github.com/en-wl/wordlist-diff/blob/rel-2026.02.25/en_GB-ise.txt
  (release `rel-2026.02.25`, retrieved 2026-09-17).
- **License**: Copyright 2000-2026 Kevin Atkinson. Free to use, copy, modify,
  distribute and sell provided the copyright notice is retained. See
  [`LICENSE`](LICENSE) for the full notice. ESDB itself is a compilation of
  public-domain sources (12dicts, ENABLE2K) plus some restricted-use sources;
  only the base notice applies here (we don't use the Australian/`AU` region
  data or the >80 "UKACD" size tier).

## Why this source, and why it covers Irish English too

ESDB/SCOWL is the word list underlying the `en_GB` Hunspell/Aspell British
dictionaries and is the standard source used across spell-checking and word-game
tooling. There is no equivalently maintained, standalone "Irish English" word
list — Ireland follows British spelling conventions (colour, realise, centre,
...) for standard vocabulary, so the British list is used as the British/Irish
word list until/unless a dedicated Hiberno-English source is required (e.g. to
add distinctly Irish vocabulary not present here).

## Files

- `raw/en_GB-ise.txt` — unmodified upstream download (109,550 entries),
  kept for provenance. Includes proper nouns (`Aaron`), possessive/plural forms
  with apostrophes (`AA's`), and acronyms (`ABC`) — normal for a spell-checker
  word list but not what we want for the word graph.
- `words.txt` — cleaned list derived from the raw file: lowercase alphabetic
  entries only (`^[a-z]+$`), deduplicated, sorted (79,342 entries). Generated with:

  ```bash
  grep -E '^[a-z]+$' raw/en_GB-ise.txt | sort -u > words.txt
  ```

  This drops proper nouns, possessives/contractions, acronyms, and any
  multi-word or hyphenated entries. Revisit this filter if the graph should
  include proper nouns later — that's a graph-construction decision, tracked
  in the root [AGENTS.md](../../AGENTS.md).
