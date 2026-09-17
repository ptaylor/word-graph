import cytoscape from "cytoscape";
import { loadManifest, loadLength, bfsDistances } from "./graph.js";
import { tierFor, buildStylesheet, colorForDistance, nodeDimensions } from "./styling.js";

const FULL_GRAPH_CONFIRM_THRESHOLD = 2000;
const DATALIST_POPULATE_THRESHOLD = 3000;

const lengthSelect = document.getElementById("length-select");
const wordInput = document.getElementById("word-input");
const wordOptions = document.getElementById("word-options");
const distanceInput = document.getElementById("distance-input");
const exploreButton = document.getElementById("explore-button");
const fullGraphButton = document.getElementById("full-graph-button");
const status = document.getElementById("status");
const legend = document.getElementById("legend");

let cy = null;
let currentLength = null;

function setStatus(message) {
  status.textContent = message;
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
    cy.on("mouseover", "node", (event) => event.target.addClass("show-label"));
    cy.on("mouseout", "node", (event) => event.target.removeClass("show-label"));
  }
  return cy;
}

function renderLegend(maxDistance) {
  legend.innerHTML = "";
  if (maxDistance === null) {
    legend.hidden = true;
    return;
  }
  legend.hidden = false;
  const rootItem = document.createElement("span");
  rootItem.className = "legend-item";
  rootItem.innerHTML = `<span class="legend-swatch" style="background:#e63946"></span>root`;
  legend.appendChild(rootItem);
  for (let distance = 1; distance <= maxDistance; distance++) {
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
  const length = Number(lengthSelect.value);
  const word = wordInput.value.trim().toLowerCase();
  const maxDistance = Number(distanceInput.value);

  if (!word) {
    setStatus("Enter a word to explore.");
    return;
  }

  setStatus(`Loading ${length}-letter graph...`);
  const data = await ensureLengthLoaded(length);
  const startIndex = data.wordIndex.get(word);
  if (startIndex === undefined) {
    setStatus(`"${word}" is not in the ${length}-letter dictionary.`);
    return;
  }

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

  renderElements([...nodes, ...edges], tier, {
    name: "breadthfirst",
    roots: `#${startIndex}`,
    circle: true,
    avoidOverlap: true,
    spacingFactor: tier.spacingFactor,
    animate: nodes.length <= 300,
    animationDuration: 300,
    fit: true,
    padding: 40,
  });
  renderLegend(maxDistance);
  setStatus(`${nodes.length} words within ${maxDistance} change(s) of "${word}".`);
}

async function showFullGraph() {
  const length = Number(lengthSelect.value);
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
  renderLegend(null);
  setStatus(`Showing all ${data.words.length} words of length ${length} (${edges.length} edges).`);
}

async function init() {
  setStatus("Loading manifest...");
  const lengths = await loadManifest();
  lengthSelect.innerHTML = "";
  for (const { length, wordCount } of lengths) {
    const option = document.createElement("option");
    option.value = length;
    option.textContent = `${length} letters (${wordCount})`;
    lengthSelect.appendChild(option);
  }
  const defaultLength = lengths.find((l) => l.length === 5) ?? lengths[0];
  lengthSelect.value = String(defaultLength.length);
  await ensureLengthLoaded(defaultLength.length);
  setStatus("Ready.");
}

exploreButton.addEventListener("click", explore);
fullGraphButton.addEventListener("click", showFullGraph);
wordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") explore();
});
lengthSelect.addEventListener("change", () => ensureLengthLoaded(Number(lengthSelect.value)));

init().catch((err) => {
  console.error(err);
  setStatus(`Error: ${err.message}`);
});
