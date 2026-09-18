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
    fontSize: 11,
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
    fontSize: 9,
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
    fontSize: 8,
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

// Perceptually distinct, warm-to-cool scale: root is always red regardless of
// this (see node.root style), so distance 0 here only matters for full-graph
// (single-color) rendering.
const DISTANCE_COLORS = ["#e63946", "#f4a261", "#e9c46a", "#8ab17d", "#2a9d8f", "#457b9d", "#6d597a"];

export function colorForDistance(distance) {
  return DISTANCE_COLORS[Math.min(distance, DISTANCE_COLORS.length - 1)];
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
// the largest tier are now 50, 30, 27, 24, 21, 18 px out from the root, where
// before they were 50, 26, 20, 17, 17, 17.
const ROOT_BOOST = 1.45;
const DISTANCE_DECAY = 0.88;
const MIN_SCALE = 0.5;

function scaleForDistance(distance) {
  // No distance means the full-length view, where every word is equal.
  if (distance === undefined) return 1;
  if (distance === 0) return ROOT_BOOST;
  return Math.max(MIN_SCALE, DISTANCE_DECAY ** distance);
}

// The single source of truth for type size, so a node's box is always measured
// against the font it actually renders at.
export function fontSizeFor(tier, distance) {
  return tier.fontSize * scaleForDistance(distance);
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
  const w = Math.max(word.length * charWidth + fontSize * 1.6, fontSize * 3);
  const h = fontSize * 2.3;
  return { w, h };
}

export function buildStylesheet(tier) {
  const isPill = tier.shape === "round-rectangle";
  return [
    {
      selector: "node",
      style: {
        label: tier.labelAlways ? "data(label)" : "",
        "font-family": "system-ui, sans-serif",
        "font-size": tier.fontSize,
        "font-weight": 600,
        color: "#1d3557",
        "text-valign": "center",
        "text-halign": "center",
        "text-outline-width": tier.labelAlways ? 2 : 0,
        "text-outline-color": "#ffffff",
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
        "text-outline-width": 2,
        "text-outline-color": "#ffffff",
        "z-index": 5,
      },
    },
    {
      selector: "node.root",
      style: {
        "background-color": "#e63946",
        "border-width": 3,
        "border-color": "#7a1f27",
        // Must match the font nodeDimensions() measured the box against, or the
        // label overflows the box it was sized for.
        "font-size": fontSizeFor(tier, 0),
        // Always a box, even in the tiers that use circles for everything else.
        shape: "round-rectangle",
        label: "data(label)",
        "text-outline-width": 2,
        "text-outline-color": "#ffffff",
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
        "text-outline-color": "#ffffff",
        "border-width": 4,
        "border-color": "#f4a261",
        "z-index": 12,
      },
    },
    {
      selector: "edge.path-edge",
      style: {
        "line-color": "#f4a261",
        width: tier.edgeWidth + 2,
        opacity: 1,
        "z-index": 6,
      },
    },
  ];
}
