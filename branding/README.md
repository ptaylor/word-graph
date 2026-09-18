# branding — the Word Graph marque

A bold **W** with a routed graph drawn inside it: three nodes joined by an edge
that follows the letter's own strokes, so the graph sits *in* the letterform
rather than beside it. The outer strokes stay solid, so the mark still reads as
a `W` at 16 px.

The shipped files live in [`web/public/`](../web/public/) because that is where
Vite serves static assets from. This directory holds the design documentation
and the explorations that led there.

## Files

| File | Use |
|---|---|
| [`web/public/logo.svg`](../web/public/logo.svg) | **Light backgrounds** — navy letter, light routed edge. |
| [`web/public/logo-inverse.svg`](../web/public/logo-inverse.svg) | **Dark backgrounds** — white letter, dark routed edge. |
| [`web/public/favicon.svg`](../web/public/favicon.svg) | **Tab icon / installed app.** Supplies its own navy tile, so one file works on either background. |
| [`web/public/favicon.ico`](../web/public/favicon.ico) | Raster fallback at 16/32/48, for surfaces that ignore SVG icons. |

There is deliberately no single-file mark. The letter has to contrast with the
background *and* the routed edge has to contrast with the letter, so on a dark
background both tones must invert — a lone `logo.svg` vanishes into a dark UI.

## Usage

```html
<!-- web/index.html -->
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />

<!-- app header -->
<img id="app-logo" src="/logo.svg" alt="" width="26" height="26" />
```

In Markdown, pick the ink by colour scheme rather than shipping one tone:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-inverse.svg" />
  <img src="web/public/logo.svg" alt="Word Graph" width="72" height="72" />
</picture>
```

All three are square viewBoxes (`logo*` are 72×72, `favicon` is 64×64), so
setting equal `width` and `height` never letterboxes.

## Geometry

```
viewBox          72 × 72
W vertices       (11,20) (23,52) (36,20) (49,52) (61,20)
letter stroke    15
routed edge      3.5
nodes            r 6.5 at red (17,36) · orange (36,20) · sage (45.4,43)
```

### Constraints before editing

**The notch between the two top vertices is `top spacing − stroke width`**, and
the top spacing is capped by the canvas. At a 15-unit stroke the notch is 10
units; much heavier and it closes, and the `W` reads as a blob. Thickening the
letter means widening the box, not just the stroke.

**Red sits 7 units above green** (y=36 against y=43). That offset is deliberate:
it makes the routed edge a descending three-segment path rather than a symmetric
∨∧. The apex node stays at y=20 to hold the composition.

**The routed edge must stay thin.** It competes with the letter for the same
pixels. Measured as a share of the mark's ink: the shipped 3.5-unit edge in a
15-unit stroke leaves the letter at 66.7% and the edge at 22.1%. An earlier
build with a 4.5-unit edge in an 11-unit stroke put the edge at 41% against the
letter's 48%, at which point the mark read as a *pale* W with navy edging rather
than a navy W with a line inside it.

**Nodes are inset 1 unit.** At r=6.5 the node is 86.7% of the 15-unit stroke.
Shrinking the outward nodes to manufacture root hierarchy was considered and
rejected: at r=4.2 they are 56% of the stroke and rasterise to 1.9 px at 16 px,
spending the mark's legibility to buy emphasis that only lands above ~200 px.

## Colours

| Token | Value | Notes |
|---|---|---|
| Letter, light UI | `#1d3557` | |
| Letter, dark UI | `#ffffff` | |
| Routed edge on a navy letter | `#9db0c6` | |
| Routed edge on a white letter | `#2b4c7a` | |
| Favicon tile | `#2b4c7a` → `#16233b` gradient | |
| Node · root | `#e63946` | `DISTANCE_COLORS[0]` |
| Node · next | `#f4a261` | `DISTANCE_COLORS[1]` |
| Node · last | `#8ab17d` | `DISTANCE_COLORS[3]` — see below |

The node hues come from the app's own BFS distance ramp
(`DISTANCE_COLORS` in [`web/src/styling.js`](../web/src/styling.js)), whose
legend paints distance *N* with entry *N*. If the three nodes are read strictly
as 0 → 1 → 2 changes out from the root, the third should be entry 2, `#e9c46a`.
That was tried and rejected: measured at 16 px, amber collapses against the
orange node (RGB separation falls from 90 to 33) so two of the three nodes stop
being distinguishable. Sage is entry 3 — a deliberate trade of strict indexing
for three hues that stay distinct at tab size.

## Verification

Checked by rendering at real sizes and sampling pixels rather than by eye:

- Node centroids land within 0.5 units of the authored coordinates.
- The routed edge samples `(161,176,196)` at 16 px — identical to its value at
  112 px — and a plain stroke samples `(34,53,85)`, so the graph survives to tab
  size without bleeding into the letter.
- The top notch still samples pure white `(255,255,255)` at 16 px, confirming the
  heavier stroke has not closed the letter up.

## Regenerating the favicon

`favicon.ico` is a raster fallback. Render `favicon.svg` at 16/24/32/48 and
combine:

```bash
magick icon-16.png icon-24.png icon-32.png icon-48.png favicon.ico
```

**Do not rasterise it with `magick favicon.svg` directly.** ImageMagick's internal
SVG renderer silently flattens the tile's `linearGradient` to a solid colour.
Screenshot it through a browser instead, or drop the gradient first.

## Design history

The pages here are the explorations that led to the shipped mark. Each generates
its SVG inline, so they need no build step — open them directly in a browser.
Their preview PNG captures are git-ignored.

| Page | Explores |
|---|---|
| [`options.html`](options.html) | The first round: chain, hub, ladder, and app tiles. |
| [`words.html`](words.html) | Marks built from actual words — letter tiles and word capsules. |
| [`w-nodes.html`](w-nodes.html) | The `W` as five coloured nodes joined by edges. |
| [`w-inset.html`](w-inset.html) | Smaller balls set inside the letterform. |
| [`w-graph.html`](w-graph.html) | A routed edge tracing the letter, with three placements. |
| [`w-graph2.html`](w-graph2.html) | The thicker letter and offset nodes that became the shipped mark. |

The `.svg` files beside them are the unshipped variants those pages render.
