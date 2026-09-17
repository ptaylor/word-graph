import cytoscape from "cytoscape";
import { loadManifest, loadLength, bfsDistances } from "./graph.js";
import { tierFor, buildStylesheet, colorForDistance, nodeDimensions } from "./styling.js";

const FULL_GRAPH_CONFIRM_THRESHOLD = 2000;
const DATALIST_POPULATE_THRESHOLD = 3000;

const lengthSlider = document.getElementById("length-slider");
const lengthValue = document.getElementById("length-value");
const wordInput = document.getElementById("word-input");
const wordOptions = document.getElementById("word-options");
const distanceMinSlider = document.getElementById("distance-min");
const distanceMaxSlider = document.getElementById("distance-max");
const distanceValue = document.getElementById("distance-value");
const exploreButton = document.getElementById("explore-button");
const fullGraphButton = document.getElementById("full-graph-button");
const status = document.getElementById("status");
const legend = document.getElementById("legend");
const hoverWord = document.getElementById("hover-word");
const hoverMeta = document.getElementById("hover-meta");
const DEFAULT_TITLE = hoverWord.textContent;

let cy = null;
let currentLength = null;
let wordCountByLength = new Map();

function setStatus(message) {
  status.textContent = message;
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
  if (currentLength === length) return loadLength(length);
  const data = await loadLength(length);
  currentLength = length;

  wordOptions.innerHTML = "";
  if (data.words.length <= DATALIST_POPULATE_THRESHOLD) {
    const fragment = document.createDocumentFragment();
    for (const word of data.words) {
      const option = document.createElement("option");
      option.value = word;
      fragment.appendChild(option);
    }
    wordOptions.appendChild(fragment);
  }
  return data;
}

async function explore() {
  const word = wordInput.value.trim().toLowerCase();
  const minDistance = Number(distanceMinSlider.value);
  const maxDistance = Number(distanceMaxSlider.value);

  if (!word) {
    setStatus("Enter a word to explore.");
    return;
  }

  // The word's own length determines which per-length graph to search --
  // sync the slider to match rather than trusting whatever it was set to.
  const length = word.length;
  if (!wordCountByLength.has(length)) {
    setStatus(`No ${length}-letter dictionary available.`);
    return;
  }
  if (Number(lengthSlider.value) !== length) {
    lengthSlider.value = String(length);
    updateLengthLabel(length);
  }

  setStatus(`Loading ${length}-letter graph...`);
  const data = await ensureLengthLoaded(length);
  const startIndex = data.wordIndex.get(word);
  if (startIndex === undefined) {
    setStatus(`"${word}" is not in the ${length}-letter dictionary.`);
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
    renderElements([], tier, { name: "grid" });
    renderLegend(minDistance, maxDistance);
    setStatus(`No words ${minDistance}\u2013${maxDistance} change(s) from "${word}".`);
    return;
  }

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
  const range = minDistance === maxDistance ? `${maxDistance}` : `${minDistance}–${maxDistance}`;
  setStatus(`${nodes.length} words ${range} change(s) from "${word}".`);
}

async function showFullGraph() {
  const length = Number(lengthSlider.value);
  setStatus(`Loading ${length}-letter graph...`);
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
  setStatus(`Showing all ${data.words.length} words of length ${length} (${edges.length} edges).`);
}

function updateLengthLabel(length) {
  const wordCount = wordCountByLength.get(length);
  lengthValue.textContent = wordCount === undefined ? `${length} letters` : `${length} letters (${wordCount})`;
}

function updateDistanceLabel() {
  const min = Number(distanceMinSlider.value);
  const max = Number(distanceMaxSlider.value);
  distanceValue.textContent = min === max ? `${max}` : `${min}–${max}`;
}

async function init() {
  setStatus("Loading manifest...");
  const lengths = await loadManifest();
  wordCountByLength = new Map(lengths.map(({ length, wordCount }) => [length, wordCount]));

  const minLength = lengths[0].length;
  const maxLength = lengths[lengths.length - 1].length;
  lengthSlider.min = String(minLength);
  lengthSlider.max = String(maxLength);

  const defaultLength = lengths.find((l) => l.length === 5) ?? lengths[0];
  lengthSlider.value = String(defaultLength.length);
  updateLengthLabel(defaultLength.length);
  updateDistanceLabel();
  await ensureLengthLoaded(defaultLength.length);
  setStatus("Ready.");
}

function handleLengthSliderChange() {
  const length = Number(lengthSlider.value);
  updateLengthLabel(length);
  const word = wordInput.value.trim().toLowerCase();
  if (word && word.length === length) {
    explore();
  } else {
    ensureLengthLoaded(length).then(() =>
      setStatus(`Loaded ${length}-letter dictionary (${wordCountByLength.get(length)} words). Enter a word or show the full graph.`)
    );
  }
}

function handleDistanceSliderChange() {
  if (Number(distanceMinSlider.value) > Number(distanceMaxSlider.value)) {
    distanceMinSlider.value = distanceMaxSlider.value;
  }
  updateDistanceLabel();
  if (wordInput.value.trim()) explore();
}

const debouncedLengthChange = debounce(handleLengthSliderChange, 200);
const debouncedDistanceChange = debounce(handleDistanceSliderChange, 200);

exploreButton.addEventListener("click", explore);
fullGraphButton.addEventListener("click", showFullGraph);
wordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") explore();
});
wordInput.addEventListener("input", debounce(() => {
  if (wordInput.value.trim()) explore();
}, 300));
lengthSlider.addEventListener("input", () => {
  updateLengthLabel(Number(lengthSlider.value));
  debouncedLengthChange();
});
for (const slider of [distanceMinSlider, distanceMaxSlider]) {
  slider.addEventListener("input", () => {
    updateDistanceLabel();
    debouncedDistanceChange();
  });
}

init().catch((err) => {
  console.error(err);
  setStatus(`Error: ${err.message}`);
});
