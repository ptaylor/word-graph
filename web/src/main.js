import cytoscape from "cytoscape";
import { loadManifest, loadLength, bfsDistances } from "./graph.js";

const FULL_GRAPH_CONFIRM_THRESHOLD = 2000;
const DATALIST_POPULATE_THRESHOLD = 3000;

const lengthSelect = document.getElementById("length-select");
const wordInput = document.getElementById("word-input");
const wordOptions = document.getElementById("word-options");
const distanceInput = document.getElementById("distance-input");
const exploreButton = document.getElementById("explore-button");
const fullGraphButton = document.getElementById("full-graph-button");
const status = document.getElementById("status");

let cy = null;
let currentLength = null;

function setStatus(message) {
  status.textContent = message;
}

function getCy() {
  if (!cy) {
    cy = cytoscape({
      container: document.getElementById("graph-container"),
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": 10,
            "background-color": "data(color)",
            width: 24,
            height: 24,
          },
        },
        {
          selector: "node.root",
          style: { "background-color": "#e63946", width: 34, height: 34 },
        },
        { selector: "edge", style: { width: 1, "line-color": "#999" } },
      ],
    });
  }
  return cy;
}

const DISTANCE_COLORS = ["#e63946", "#f4a261", "#e9c46a", "#2a9d8f", "#264653", "#457b9d"];
function colorForDistance(distance) {
  return DISTANCE_COLORS[Math.min(distance, DISTANCE_COLORS.length - 1)];
}

function renderElements(elements, layoutName) {
  const instance = getCy();
  instance.elements().remove();
  instance.add(elements);
  instance.layout({ name: layoutName, animate: false }).run();
  instance.fit(undefined, 30);
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
  const nodes = [...distances.entries()].map(([index, distance]) => ({
    data: {
      id: String(index),
      label: data.words[index],
      color: colorForDistance(distance),
    },
    classes: index === startIndex ? "root" : undefined,
  }));

  const edges = [];
  for (const index of distances.keys()) {
    for (const neighbor of data.adjacency[index]) {
      if (neighbor > index && distances.has(neighbor)) {
        edges.push({ data: { id: `${index}-${neighbor}`, source: String(index), target: String(neighbor) } });
      }
    }
  }

  renderElements([...nodes, ...edges], "breadthfirst");
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

  const nodes = data.words.map((word, index) => ({
    data: { id: String(index), label: word, color: "#457b9d" },
  }));
  const edges = [];
  data.adjacency.forEach((neighbors, index) => {
    for (const neighbor of neighbors) {
      if (neighbor > index) {
        edges.push({ data: { id: `${index}-${neighbor}`, source: String(index), target: String(neighbor) } });
      }
    }
  });

  const layoutName = data.words.length > FULL_GRAPH_CONFIRM_THRESHOLD ? "grid" : "cose";
  renderElements([...nodes, ...edges], layoutName);
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
