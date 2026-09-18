import cytoscape from "cytoscape";
import { loadManifest, loadLength, bfsDistances, bfsPath } from "./graph.js";
import { tierFor, buildStylesheet, colorForDistance, nodeDimensions } from "./styling.js";

const FULL_GRAPH_CONFIRM_THRESHOLD = 2000;
const DEFAULT_MAX_DISTANCE = 2;

const searchForm = document.getElementById("search-form");
const wordInput = document.getElementById("word-input");
const clearButton = document.getElementById("word-input-clear");
const distanceMinSlider = document.getElementById("distance-min");
const distanceMaxSlider = document.getElementById("distance-max");
const distanceValue = document.getElementById("distance-value");
const allWordsButton = document.getElementById("all-words-button");
const status = document.getElementById("status");
const legend = document.getElementById("legend");
const hoverWord = document.getElementById("hover-word");
const hoverMeta = document.getElementById("hover-meta");
const pathPanel = document.getElementById("path-panel");
const pathList = document.getElementById("path-list");
const DEFAULT_TITLE = hoverWord.textContent;

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
}

function resetHoverTitle() {
  hoverWord.textContent = DEFAULT_TITLE;
  hoverMeta.textContent = "";
}

// Renders the shortest path from the current search word to a clicked node
// as a vertical list on the left, and highlights it in the main graph.
function showPath(targetIndex) {
  if (!currentExplore) return;
  const { data, startIndex } = currentExplore;
  const path = bfsPath(data.adjacency, startIndex, targetIndex);
  const instance = getCy();
  instance.elements(".path-node, .path-edge").removeClass("path-node path-edge");

  if (!path || path.length < 2) {
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

function hidePathPanel() {
  pathPanel.hidden = true;
  pathList.innerHTML = "";
  if (cy) cy.elements(".path-node, .path-edge").removeClass("path-node path-edge");
}

function renderLegend(minDistance, maxDistance) {
  legend.innerHTML = "";
  if (minDistance === null) {
    legend.hidden = true;
    return;
  }
  legend.hidden = false;
  if (minDistance === 0) {
    const rootItem = document.createElement("span");
    rootItem.className = "legend-item";
    rootItem.innerHTML = `<span class="legend-swatch" style="background:#e63946"></span>root`;
    legend.appendChild(rootItem);
  }
  for (let distance = Math.max(minDistance, 1); distance <= maxDistance; distance++) {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${colorForDistance(distance)}"></span>${distance} change${distance > 1 ? "s" : ""}`;
    legend.appendChild(item);
  }
}

function renderElements(elements, tier, layout) {
  const instance = getCy();
  instance.style(buildStylesheet(tier));
  instance.elements().remove();
  instance.add(elements);
  instance.autoungrabify(tier.locked);
  instance.layout(layout).run();
  instance.fit(undefined, 40);
}

async function ensureLengthLoaded(length) {
  const data = await loadLength(length);
  currentLength = length;
  allWordsButton.textContent = `All ${length}-letter words`;
  return data;
}

async function explore() {
  const word = wordInput.value.trim().toLowerCase();
  const minDistance = Number(distanceMinSlider.value);
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

  const allDistances = bfsDistances(data.adjacency, startIndex, maxDistance);
  const distances = new Map([...allDistances].filter(([, distance]) => distance >= minDistance));
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
        ...nodeDimensions(label, tier, isRoot),
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
    renderLegend(minDistance, maxDistance);
    setView("graph");
    setStatus(`No words ${minDistance}\u2013${maxDistance} change(s) from "${word}".`, "error");
    return;
  }

  currentExplore = { data, startIndex };
  const layoutRoot = distances.has(startIndex)
    ? startIndex
    : [...distances.entries()].sort((a, b) => a[1] - b[1])[0][0];
  renderElements([...nodes, ...edges], tier, {
    name: "breadthfirst",
    roots: `#${layoutRoot}`,
    circle: true,
    avoidOverlap: true,
    spacingFactor: tier.spacingFactor,
    animate: nodes.length <= 300,
    animationDuration: 300,
    fit: true,
    padding: 40,
  });
  renderLegend(minDistance, maxDistance);
  setView("graph");
  const range = minDistance === maxDistance ? `${maxDistance}` : `${minDistance}\u2013${maxDistance}`;
  setStatus(`${nodes.length} words ${range} change(s) from "${word}".`);
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
    data: { id: String(index), label: word, color: "#457b9d", ...nodeDimensions(word, tier, false) },
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
  renderLegend(null, null);
  setView("graph");
  setStatus(`Showing all ${data.words.length} words of length ${length} (${edges.length} edges).`);
}

function updateDistanceLabel() {
  const min = Number(distanceMinSlider.value);
  const max = Number(distanceMaxSlider.value);
  distanceValue.textContent = min === max ? `${max}` : `${min}–${max}`;
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
  if (Number(distanceMinSlider.value) > Number(distanceMaxSlider.value)) {
    distanceMinSlider.value = distanceMaxSlider.value;
  }
  updateDistanceLabel();
  // Only meaningful when a graph is on screen; on the landing it would fire a
  // search for whatever happened to be in the field.
  if (document.body.dataset.view === "graph" && wordInput.value.trim()) explore();
}

function resetSearch() {
  wordInput.value = "";
  distanceMinSlider.value = "0";
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

for (const slider of [distanceMinSlider, distanceMaxSlider]) {
  slider.addEventListener("input", () => {
    updateDistanceLabel();
    debouncedDistanceChange();
  });
}

init().catch((err) => {
  console.error(err);
  setStatus(`Error: ${err.message}`, "error");
});
