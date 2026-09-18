import cytoscape from "cytoscape";
import { loadManifest, loadLength, bfsDistances, bfsPath } from "./graph.js";
import { tierFor, buildStylesheet, colorForDistance, nodeDimensions } from "./styling.js";

const FULL_GRAPH_CONFIRM_THRESHOLD = 2000;
const DEFAULT_MAX_DISTANCE = 5;

const searchForm = document.getElementById("search-form");
const wordInput = document.getElementById("word-input");
const clearButton = document.getElementById("word-input-clear");
const distanceMaxSlider = document.getElementById("distance-max");
const distanceValue = document.getElementById("distance-value");
const allWordsButton = document.getElementById("all-words-button");
const pointed = document.getElementById("pointed");
const status = document.getElementById("status");
const legend = document.getElementById("legend");
const hoverWord = document.getElementById("hover-word");
const hoverMeta = document.getElementById("hover-meta");
const pathPanel = document.getElementById("path-panel");
const pathList = document.getElementById("path-list");

let cy = null;
let currentLength = null;
let wordCountByLength = new Map();
let currentExplore = null; // { data, startIndex } for the active search, used by path-on-click

function setStatus(message, tone) {
  status.textContent = message;
  status.classList.toggle("is-error", tone === "error");
}

// The app is two states. "landing" is the mark, the name and the search field
// and nothing else; "graph" adds the canvas and the distance control. Both
// share one header, so there is nothing to keep in sync between them.
function setView(view) {
  document.body.dataset.view = view;
  clearButton.hidden = view !== "graph";
  if (view === "landing") {
    if (cy) cy.elements().remove();
    hidePathPanel();
    currentExplore = null;
    resetHoverTitle();
  }
}

function debounce(fn, delayMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

function getCy() {
  if (!cy) {
    cy = cytoscape({
      container: document.getElementById("graph-container"),
      minZoom: 0.05,
      maxZoom: 6,
      wheelSensitivity: 0.25,
    });
    // Dense tiers hide labels by default; reveal on hover so any word is
    // still reachable without cluttering the whole view.
    cy.on("mouseover", "node", (event) => {
      const node = event.target;
      node.addClass("show-label");
      showHoverTitle(node);
    });
    cy.on("mouseout", "node", (event) => {
      event.target.removeClass("show-label");
      resetHoverTitle();
    });
    cy.on("tap", "node", (event) => showPath(Number(event.target.id())));
  }
  return cy;
}

function showHoverTitle(node) {
  hoverWord.textContent = node.data("label");
  const distance = node.data("distance");
  if (node.hasClass("root")) {
    hoverMeta.textContent = "root word";
  } else if (distance !== undefined) {
    hoverMeta.textContent = `${distance} change${distance === 1 ? "" : "s"} away`;
  } else {
    hoverMeta.textContent = "";
  }
  pointed.hidden = false;
}

function resetHoverTitle() {
  hoverWord.textContent = "";
  hoverMeta.textContent = "";
  pointed.hidden = true;
}

// Renders the shortest path from the current search word to a clicked node
// as a vertical list on the left, and highlights it in the main graph.
function showPath(targetIndex) {
  if (!currentExplore) return;
  const { data, startIndex } = currentExplore;
  const instance = getCy();
  // The searched word is selectable like any other, in which case its path is
  // just itself. There is always something to show for the current selection.
  if (instance.getElementById(String(targetIndex)).length === 0) {
    hidePathPanel();
    return;
  }
  const path = bfsPath(data.adjacency, startIndex, targetIndex);
  instance.elements(".path-node, .path-edge").removeClass("path-node path-edge");

  if (!path) {
    hidePathPanel();
    return;
  }

  pathList.innerHTML = "";
  for (const index of path) {
    const item = document.createElement("li");
    item.textContent = data.words[index];
    pathList.appendChild(item);
  }
  pathPanel.hidden = false;

  for (const index of path) {
    instance.getElementById(String(index)).addClass("path-node");
  }
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i], path[i + 1]].sort((x, y) => x - y);
    instance.getElementById(`${a}-${b}`).addClass("path-edge");
  }
}

// Puts the searched word in the middle of the canvas and scales so the furthest
// word still fits around it. Fitting the whole graph and panning to the root
// afterwards is not enough: when the graph is lopsided the pan shoves the far
// side off screen. Sizing the view about the root keeps both -- the word
// centred, and every word still visible.
function centreOnRoot(padding = 40) {
  if (!cy || !currentExplore) return;
  const root = cy.getElementById(String(currentExplore.startIndex));
  if (!root || root.length === 0) return;

  const all = cy.elements().boundingBox();
  const box = root.boundingBox();
  const rx = (box.x1 + box.x2) / 2;
  const ry = (box.y1 + box.y2) / 2;
  // How far the graph reaches from the root, per axis, at its worst.
  const reachX = Math.max(rx - all.x1, all.x2 - rx) || 1;
  const reachY = Math.max(ry - all.y1, all.y2 - ry) || 1;

  const spaceX = Math.max((cy.width() - padding * 2) / 2, 1);
  const spaceY = Math.max((cy.height() - padding * 2) / 2, 1);
  cy.zoom(Math.min(spaceX / reachX, spaceY / reachY));
  cy.center(root);
}

function hidePathPanel() {
  pathPanel.hidden = true;
  pathList.innerHTML = "";
  if (cy) cy.elements(".path-node, .path-edge").removeClass("path-node path-edge");
}

// One entry per change out from the searched word, plus the word itself.
function renderLegend(maxDistance) {
  legend.innerHTML = "";
  if (maxDistance === null) {
    legend.hidden = true;
    return;
  }
  legend.hidden = false;
  const addItem = (color, text) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${text}`;
    legend.appendChild(item);
  };
  addItem("#e63946", "root");
  for (let distance = 1; distance <= maxDistance; distance++) {
    addItem(colorForDistance(distance), `${distance} change${distance > 1 ? "s" : ""}`);
  }
}

function renderElements(elements, tier, layoutOptions, onSettled) {
  const instance = getCy();
  instance.style(buildStylesheet(tier));
  instance.elements().remove();
  instance.add(elements);
  instance.autoungrabify(tier.locked);
  // Pick up the container's real size. On a search from the landing screen the
  // canvas has just become visible, and a layout that fits itself to a
  // zero-width viewport produces a garbage zoom, which the minZoom clamp then
  // pins to its floor -- a smear of sub-pixel dots that only repairs itself if
  // something later resizes the window.
  instance.resize();

  const padding = layoutOptions.padding ?? 40;
  // The layout is told not to fit itself. An animated layout has not reached
  // its final positions when run() returns, so fitting then measures the
  // starting positions; and a fit on layoutstop fires in the same tick as
  // anything registered here, so it would undo a pan applied alongside it.
  // Fitting and recentring therefore both happen at the end, in this order.
  const layout = instance.layout({ ...layoutOptions, fit: false });
  layout.one("layoutstop", () => {
    // A search recentres on its own root, which subsumes fitting.
    if (onSettled) onSettled();
    else instance.fit(undefined, padding);
  });
  layout.run();
  instance.fit(undefined, padding); // stands in if layoutstop never arrives
}

async function ensureLengthLoaded(length) {
  const data = await loadLength(length);
  currentLength = length;
  allWordsButton.textContent = `All ${length}-letter words`;
  return data;
}

async function explore() {
  const word = wordInput.value.trim().toLowerCase();
  const maxDistance = Number(distanceMaxSlider.value);

  if (!word) {
    setStatus("Type a word to explore.", "error");
    return;
  }

  hidePathPanel();

  // The word's own length picks which per-length graph to search. There is no
  // length control to keep in step -- the word is the only input that matters.
  const length = word.length;
  if (!wordCountByLength.has(length)) {
    setStatus(`No ${length}-letter words in this dictionary.`, "error");
    return;
  }

  setStatus(`Loading ${length}-letter graph\u2026`);
  const data = await ensureLengthLoaded(length);
  const startIndex = data.wordIndex.get(word);
  if (startIndex === undefined) {
    setStatus(`"${word}" is not in the ${length}-letter dictionary.`, "error");
    return;
  }

  // Everything out to the maximum, with the searched word always included.
  const distances = bfsDistances(data.adjacency, startIndex, maxDistance);
  const tier = tierFor(distances.size);
  const nodes = [...distances.entries()].map(([index, distance]) => {
    const isRoot = index === startIndex;
    const label = data.words[index];
    return {
      data: {
        id: String(index),
        label,
        color: colorForDistance(distance),
        distance,
        // Sized by distance: the searched word is the biggest box on screen and
        // each ring outward is smaller.
        ...nodeDimensions(label, tier, distance),
      },
      classes: isRoot ? "root" : undefined,
    };
  });

  const edges = [];
  for (const index of distances.keys()) {
    for (const neighbor of data.adjacency[index]) {
      if (neighbor > index && distances.has(neighbor)) {
        edges.push({ data: { id: `${index}-${neighbor}`, source: String(index), target: String(neighbor) } });
      }
    }
  }

  if (nodes.length === 0) {
    currentExplore = null;
    renderElements([], tier, { name: "grid" });
    renderLegend(null);
    setView("graph");
    setStatus(`Nothing within ${maxDistance} change(s) of "${word}".`, "error");
    return;
  }

  currentExplore = { data, startIndex };
  // Reveal the canvas before laying out: the layout measures the viewport.
  setView("graph");
  renderLegend(maxDistance);
  // Force-directed. breadthfirst's circle mode was the original choice here
  // because it "radiates from the queried word", but its radius grows far
  // faster than the nodes do: it spread a 9-node result over 13,500 model
  // units (nodes are ~40 units wide) and 566 nodes over 7,600, so fitting the
  // result produced a zoom of 0.03-0.09 -- a smear of sub-pixel dots. cose
  // packs the same graphs into 570 and 846 units respectively, i.e. a fit zoom
  // of 0.65 in both cases. Measured over both sizes; grid scored similarly.
  renderElements(
    [...nodes, ...edges],
    tier,
    {
      name: "cose",
      idealEdgeLength: 70 * tier.spacingFactor,
      nodeRepulsion: 12000,
      gravity: 50,
      numIter: 500,
      randomize: false,
      animate: nodes.length <= 300,
      animationDuration: 300,
      padding: 40,
    },
    centreOnRoot
  );
  // The searched word starts selected, so the panel is populated the moment the
  // graph appears rather than waiting for a click.
  showPath(startIndex);
  // Showing that panel narrows the canvas by its width, which drags the root
  // off centre by half of it (measured: 117px on a 1167px canvas). Re-fit once
  // the panel is in place so "the searched word is centred" means centred in
  // the space the graph actually has.
  cy.resize();
  centreOnRoot();
  setStatus(`${nodes.length} words within ${maxDistance} change(s) of "${word}".`);
}

// Every word of the length already on screen. Reached from the graph view,
// never from the landing screen -- the landing is for one word at a time.
async function showAllWords() {
  if (currentLength === null) return;
  const length = currentLength;
  setStatus(`Loading ${length}-letter graph\u2026`);
  const data = await ensureLengthLoaded(length);

  if (
    data.words.length > FULL_GRAPH_CONFIRM_THRESHOLD &&
    !window.confirm(
      `This length has ${data.words.length} words. Rendering the full graph may be slow. Continue?`
    )
  ) {
    setStatus("Cancelled.");
    return;
  }

  currentExplore = null;
  hidePathPanel();

  const tier = tierFor(data.words.length);
  const nodes = data.words.map((word, index) => ({
    // No distance in the full-length view, so every word stays the same size.
    data: { id: String(index), label: word, color: "#457b9d", ...nodeDimensions(word, tier) },
  }));
  const edges = [];
  data.adjacency.forEach((neighbors, index) => {
    for (const neighbor of neighbors) {
      if (neighbor > index) {
        edges.push({ data: { id: `${index}-${neighbor}`, source: String(index), target: String(neighbor) } });
      }
    }
  });

  const useCose = data.words.length <= FULL_GRAPH_CONFIRM_THRESHOLD;
  // Same reason as explore(): reveal the canvas before the layout measures it.
  setView("graph");
  renderLegend(null);
  renderElements(
    [...nodes, ...edges],
    tier,
    useCose
      ? {
          name: "cose",
          animate: false,
          nodeRepulsion: 8000,
          idealEdgeLength: 60,
          avoidOverlap: true,
          fit: true,
          padding: 30,
        }
      : { name: "grid", fit: true, padding: 10, avoidOverlap: true }
  );
  setStatus(`Showing all ${data.words.length} words of length ${length} (${edges.length} edges).`);
}

function updateDistanceLabel() {
  distanceValue.textContent = distanceMaxSlider.value;
}

async function init() {
  const lengths = await loadManifest();
  wordCountByLength = new Map(lengths.map(({ length, wordCount }) => [length, wordCount]));

  updateDistanceLabel();
  // Nothing is fetched until a word is entered: the landing screen needs no
  // dictionary, so startup costs one small manifest request.
  setStatus("");
  wordInput.focus();
}

function handleDistanceSliderChange() {
  updateDistanceLabel();
  // Only meaningful when a graph is on screen; on the landing it would fire a
  // search for whatever happened to be in the field.
  if (document.body.dataset.view === "graph" && wordInput.value.trim()) explore();
}

function resetSearch() {
  wordInput.value = "";
  distanceMaxSlider.value = String(DEFAULT_MAX_DISTANCE);
  updateDistanceLabel();
  setView("landing");
  setStatus("");
  wordInput.focus();
}

const debouncedDistanceChange = debounce(handleDistanceSliderChange, 200);

// Searching is explicit. The previous build re-ran the BFS and rebuilt every
// element on a 300ms typing debounce, so spelling "hotel" meant five full
// rebuilds fighting the keyboard.
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  explore();
});

clearButton.addEventListener("click", resetSearch);

wordInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.dataset.view === "graph") resetSearch();
});

allWordsButton.addEventListener("click", showAllWords);

// Cytoscape measures its canvas once, at creation, and does not follow the
// container itself. Without this the canvas keeps its original width when the
// window changes and the graph drifts off-centre or off-screen entirely.
window.addEventListener("resize", debounce(() => {
  if (!cy) return;
  cy.resize();
  centreOnRoot();
}, 150));

distanceMaxSlider.addEventListener("input", () => {
  updateDistanceLabel();
  debouncedDistanceChange();
});

init().catch((err) => {
  console.error(err);
  setStatus(`Error: ${err.message}`, "error");
});
