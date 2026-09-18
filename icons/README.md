# icons — Word Graph logo

The project's logo as SVG. A bold **W** with a routed graph drawn inside it: three
nodes joined by an edge that follows the letter's own strokes, so the graph sits
*in* the letterform rather than beside it. The node colours are the app's own BFS
distance ramp (`red → orange → sage`), and the letter's outer strokes are left
solid so the mark still reads as a `W` at 16 px.

## Files

| File | Use |
|---|---|
| [`mark-w-graph.svg`](mark-w-graph.svg) | **Light backgrounds** — navy letter, light routed edge. |
| [`mark-w-graph-inverse.svg`](mark-w-graph-inverse.svg) | **Dark backgrounds** — white letter, dark routed edge. |
| [`app-icon-w-graph.svg`](app-icon-w-graph.svg) | **Tab icon / installed app.** Supplies its own navy tile, so one file works on either background. |

There is no single-file mark on purpose. The letter has to contrast with the
background and the routed edge has to contrast with the *letter*, so on a dark
background both tones have to invert — a lone `mark-w-graph.svg` disappears into
a dark UI. Pick by background, or use the app icon and stop thinking about it.

## Usage

```html
<link rel="icon" href="/icons/app-icon-w-graph.svg" type="image/svg+xml" />

<img src="/icons/mark-w-graph.svg" width="26" height="26" alt="" />
<span class="wordmark">word graph</span>
```

All three are **72×72 square viewBoxes** (`app-icon` is 64×64), so setting equal
`width` and `height` never letterboxes.

## Geometry

```
viewBox          72 × 72
W vertices       (11,20) (23,52) (36,20) (49,52) (61,20)
letter stroke    15
routed edge      3.5
nodes            r 6.5 at red (17,36) · orange (36,20) · green (45.4,43)
```

Two constraints worth knowing before editing:

- **The notch between the two top vertices is `top spacing − stroke width`**, and
  the top spacing is capped by the canvas. At a 15-unit stroke that notch is 10
  units — anything much heavier closes it and the `W` reads as a blob. Thickening
  the letter means widening the box, not just the stroke.
- **Red sits 7 units above green** (y=36 against y=43). That offset is deliberate:
  it makes the routed edge a descending three-segment path rather than a symmetric
  ∨∧. The apex node stays at y=20 to hold the composition.

## Colours

| Token | Value | Notes |
|---|---|---|
| Letter, light UI | `#1d3557` | |
| Letter, dark UI | `#ffffff` | |
| Routed edge on a navy letter | `#9db0c6` | |
| Routed edge on a white letter | `#2b4c7a` | |
| App tile | `#2b4c7a` → `#16233b` gradient | |
| Node · 0 changes | `#e63946` | First entry of the app's `DISTANCE_COLORS` |
| Node · 1 change | `#f4a261` | |
| Node · 2 changes | `#8ab17d` | |

## Regenerating

The SVGs are hand-authored — no build step, nothing to regenerate. Everything is
pure geometry, so there are no font dependencies and no text needing outlining.

To add a raster `favicon.ico`, render the tile to PNG at 16/24/32/48 and combine:

```bash
magick icon-16.png icon-24.png icon-32.png icon-48.png favicon.ico
```

Note that ImageMagick's internal SVG renderer does **not** handle this file's
`linearGradient` — it silently renders it flat. Rasterise via a browser instead
of `magick icon.svg`, or drop the gradient from the tile first.

## Preview

[`preview.html`](preview.html) renders every asset here at real sizes on both light
and dark UI, plus a mock of the app control bar and a browser tab. Open it directly
in a browser — it needs no server, since it only loads these sibling SVGs.

## Design history

Explorations that led here (word tiles, node-path W, hub, ladder, chain) live in
[`../branding/`](../branding/) with preview sheets. That directory is working
material, not shipped assets.

## Verification

The marks were checked by rendering them at real sizes and sampling pixels rather
than by eye: node centroids land within 0.5 units of the authored coordinates, the
routed edge samples `(161,176,196)` at 16 px — identical to its value at 112 px —
and the top notch still samples pure white `(255,255,255)` at 16 px, confirming
the heavier stroke hasn't closed the letter up.
