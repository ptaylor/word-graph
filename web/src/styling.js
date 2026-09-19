// Visual tiers for the graph: as rendered node count grows, nodes shrink and
// labels are hidden by default (shown on hover) to keep dense graphs legible.
// Small subgraphs (e.g. from a search) get large, always-labeled pill nodes.

const TIERS = [
  {
    max: 25,
    nodeSize: 46,
    fontSize: 15,
    shape: "round-rectangle",
    labelAlways: true,
    edgeWidth: 2,
    edgeOpacity: 0.55,
    curve: "bezier",
    spacingFactor: 1.75,
    locked: false,
  },
  {
    max: 90,
    nodeSize: 30,
    // 14 rather than 11: the deepest ring a 90-word search reaches sits at 0.681
    // of the tier size, and at 11 that was 7.5px -- under the legibility floor.
    // The floor would then flatten rings 1-3 onto the same size, so the tier has
    // to be big enough that the floor is a backstop rather than the rule.
    fontSize: 14,
    shape: "round-rectangle",
    labelAlways: true,
    edgeWidth: 1.5,
    edgeOpacity: 0.45,
    curve: "bezier",
    spacingFactor: 1.35,
    locked: false,
  },
  {
    max: 300,
    nodeSize: 18,
    fontSize: 11,
    shape: "ellipse",
    labelAlways: false,
    edgeWidth: 1,
    edgeOpacity: 0.35,
    curve: "bezier",
    spacingFactor: 1.1,
    locked: true,
  },
  {
    max: Infinity,
    nodeSize: 8,
    fontSize: 10,
    shape: "ellipse",
    labelAlways: false,
    edgeWidth: 0.6,
    edgeOpacity: 0.25,
    curve: "haystack",
    spacingFactor: 0.9,
    locked: true,
  },
];

export function tierFor(nodeCount) {
  return TIERS.find((tier) => nodeCount <= tier.max);
}

// Distance is an ordered quantity, so the ramp is one hue from deep to light
// rather than six unrelated colours. Position and node size already carry the
// distance; a single hue confirms it without inventing category boundaries, and
// it cannot collide under colour blindness -- every adjacent pair holds its ~9.5
// dE separation under deuteranopia and protanopia, where the old rainbow's
// orange-to-yellow step collapsed to 6.2. The searched word takes the deepest
// stop, so the biggest node is also the strongest thing on screen.
const DISTANCE_COLORS = ["#12395e", "#2d5375", "#486c8c", "#6386a3", "#7ea0ba", "#99b9d1", "#b4d3e8"];

export function colorForDistance(distance) {
  return DISTANCE_COLORS[Math.min(distance, DISTANCE_COLORS.length - 1)];
}

// One ink cannot serve a ramp this wide: against the deepest stop (#12395e)
// white scores 4.65:1 but the dark navy only 1.5:1, and against the lightest
// stop it is the other way round. So each node picks its own ink by measured
// contrast, and the halo takes the opposite one so a label still reads when it
// sits over an edge.
const LABEL_LIGHT = "#ffffff";
const LABEL_DARK = "#0f172a";

function channelToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => channelToLinear(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function labelInkFor(fill) {
  return contrastRatio(fill, LABEL_LIGHT) >= contrastRatio(fill, LABEL_DARK)
    ? { textColor: LABEL_LIGHT, textHalo: LABEL_DARK }
    : { textColor: LABEL_DARK, textHalo: LABEL_LIGHT };
}

// Nodes shrink with each hop out from the searched word, so the graph reads
// outward from a centre: the word you searched for is the largest thing on
// screen and every ring beyond it is smaller. The floor keeps the outermost
// ring legible and big enough to tap.
//
// The decay is deliberately gentle. At 0.76 a node lost almost half its size on
// the very first hop (1.45 -> 0.76 of the tier size) and flattened onto the
// floor by distance 3, so the default 0-5 range showed only three distinct
// sizes and rings 3, 4 and 5 were identical. 0.88 gives every ring in that
// range its own size and only reaches the floor at distance 6. Box heights for
// the largest tier are 50, 30, 27, 24, 21, 18 px out from the root, where
// before they were 50, 26, 20, 17, 17, 17.
//
// The first two rings are set explicitly rather than by the decay, because they
// are the ones a search actually gets read off: the words one and two changes
// away are the answer, and the pure curve left them only marginally larger than
// ring 3. Rings 3 and beyond still follow the decay, untouched.
const RING_SCALES = [1.45, 1.0, 0.9]; // root, 1 change, 2 changes
const DISTANCE_DECAY = 0.88;
const MIN_SCALE = 0.5;

function scaleForDistance(distance) {
  // No distance means the full-length view, where every word is equal.
  if (distance === undefined) return 1;
  if (distance < RING_SCALES.length) return RING_SCALES[distance];
  return Math.max(MIN_SCALE, DISTANCE_DECAY ** distance);
}

// Words are drawn in a monospace face (see --font-word in style.css, which has
// to hold the same stack). Every word in a view is the same length, so a fixed
// advance gives every box an identical width and lines the letters up between
// rings: the changed position is visible at a glance. It also has unambiguous
// l/I/1 and O/0, which matters when those are the letters being compared.
const LABEL_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

// Nothing below this is text, it is texture. The old ramp reached 4.2px in the
// dense tiers and 7.5px in the pill tiers.
const MIN_LABEL_FONT = 10;

// The single source of truth for type size, so a node's box is always measured
// against the font it actually renders at.
export function fontSizeFor(tier, distance) {
  return Math.max(MIN_LABEL_FONT, tier.fontSize * scaleForDistance(distance));
}

// Explicit pixel dimensions per node, computed from its label rather than
// relying on cytoscape's deprecated width/height: 'label' auto-sizing.
//
// The searched word always gets a rounded box, whatever the tier: it is the
// one node that has to hold a large label, and a box does that far better than
// a circle. Denser tiers keep circles for the outer words.
export function nodeDimensions(word, tier, distance) {
  const fontSize = fontSizeFor(tier, distance);
  const isRoot = distance === 0;
  if (!isRoot && tier.shape !== "round-rectangle") {
    const size = tier.nodeSize * scaleForDistance(distance);
    return { w: size, h: size };
  }
  const charWidth = fontSize * 0.62;
  const w = Math.max(word.length * charWidth + fontSize * 1.6, fontSize * 3);  const h = fontSize * 2.3;
  return { w, h };
}

export function buildStylesheet(tier) {
  const isPill = tier.shape === "round-rectangle";
  return [
    {
      selector: "node",
      style: {
        label: tier.labelAlways ? "data(label)" : "",
        "font-family": LABEL_FONT,
        // Per node, not per tier: the box was measured against this font, so
        // both have to come from the same scale or the label overflows.
        "font-size": "data(fontSize)",
        // 500, not 600: the heavier weight is what made the small sizes muddy.
        "font-weight": 500,
        // Per node, from labelInkFor(): one ink cannot stay legible across a
        // ramp this wide.
        color: "data(textColor)",
        "text-valign": "center",
        "text-halign": "center",
        "text-outline-width": tier.labelAlways ? 2 : 0,
        "text-outline-color": "data(textHalo)",
        "background-color": "data(color)",
        shape: tier.shape,
        width: "data(w)",
        height: "data(h)",
        padding: isPill ? "9px" : 0,
        "border-width": 1.5,
        "border-color": "rgba(0,0,0,0.15)",
        "transition-property": "background-color, border-color, width, height",
        "transition-duration": 150,
      },
    },
    {
      selector: "node.show-label",
      style: {
        label: "data(label)",
        // Tier font, not the ring-scaled one: in the dense tiers this is the
        // only way to read a word, and a label sized to an 8px node would be
        // illegible. It spills outside the node, which reads as a tooltip.
        ...(tier.labelAlways ? {} : { "font-size": Math.max(MIN_LABEL_FONT, tier.fontSize) }),
        "text-outline-width": 2,
        "text-outline-color": "data(textHalo)",
        "z-index": 5,
      },
    },
    {
      selector: "node.root",
      style: {
        // No background override: the root's own distance colour is the deepest
        // stop of the ramp, so it is already the strongest fill on screen.
        "border-width": 3,
        "border-color": "#0b2439",
        // Must match the font nodeDimensions() measured the box against, or the
        // label overflows the box it was sized for.
        "font-size": fontSizeFor(tier, 0),
        // Always a box, even in the tiers that use circles for everything else.
        shape: "round-rectangle",
        label: "data(label)",
        "text-outline-width": 2,
        "text-outline-color": "data(textHalo)",
        "z-index": 10,
      },
    },
    {
      selector: "edge",
      style: {
        width: tier.edgeWidth,
        "line-color": "#94a3b8",
        "curve-style": tier.curve,
        opacity: tier.edgeOpacity,
        "target-arrow-shape": "none",
      },
    },
    {
      selector: "node.path-node",
      style: {
        label: "data(label)",
        "text-outline-width": 2,
        "text-outline-color": "data(textHalo)",
        // Ink, not a hue: the old highlight reused the ramp's own orange, so
        // "route" was painted the colour that meant "one change away".
        "border-width": 4,
        "border-color": "#0f172a",
        "z-index": 12,
      },
    },
    {
      selector: "edge.path-edge",
      style: {
        "line-color": "#0f172a",
        width: tier.edgeWidth + 2,
        opacity: 1,
        "z-index": 6,
      },
    },
    {
      // Find (Cmd/Ctrl+F). The non-matching words are "out" without being taken
      // off the canvas, so the graph keeps its shape and the matches are simply
      // what is left to look at. Dimming rather than hiding matters here because
      // a node's ring is the thing worth keeping: a match still shows how many
      // changes away it is.
      selector: "node.dimmed",
      style: { opacity: 0.15 },
    },
    {
      // An edge stays bright only if both ends match, or the strands running off
      // to filtered-out words would read as part of the result.
      selector: "edge.dimmed",
      style: { opacity: 0.06 },
    },
  ];
}
