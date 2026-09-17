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

// Explicit pixel dimensions per node, computed from its label rather than
// relying on cytoscape's deprecated width/height: 'label' auto-sizing.
export function nodeDimensions(word, tier, isRoot) {
  if (tier.shape !== "round-rectangle") {
    const size = isRoot ? tier.nodeSize * 1.7 : tier.nodeSize;
    return { w: size, h: size };
  }
  const fontSize = isRoot ? tier.fontSize + 2 : tier.fontSize;
  const charWidth = fontSize * 0.62;
  const w = Math.max(word.length * charWidth + 24, fontSize * 3);
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
        "font-size": Math.max(tier.fontSize, 13),
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
  ];
}
