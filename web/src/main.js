import cytoscape from "cytoscape";
import { loadManifest, loadLength, bfsDistances, bfsPath } from "./graph.js";
import { tierFor, buildStylesheet, colorForDistance, nodeDimensions, fontSizeFor, labelInkFor } from "./styling.js";

const DEFAULT_MAX_DISTANCE = 4;
// Few enough matches and the words themselves are the answer, so they are listed
// under the bar. Above this the list would be longer than the graph it points at.
const FIND_LIST_LIMIT = 20;

const searchForm = document.getElementById("search-form");
const wordInput = document.getElementById("word-input");
const clearButton = document.getElementById("word-input-clear");
const distanceMaxSlider = document.getElementById("distance-max");
const distanceValue = document.getElementById("distance-value");
const pointed = document.getElementById("pointed");
const status = document.getElementById("status");
const legend = document.getElementById("legend");
const hoverWord = document.getElementById("hover-word");
const hoverMeta = document.getElementById("hover-meta");
const pathPanel = document.getElementById("path-panel");
const pathList = document.getElementById("path-list");
const findBar = document.getElementById("find-bar");
const findInput = document.getElementById("find-input");
const findCount = document.getElementById("find-count");
const findClose = document.getElementById("find-close");
const findResults = document.getElementById("find-results");
const layoutButtons = [...document.querySelectorAll(".layout-option")];

let cy = null;
let wordCountByLength = new Map();
let currentExplore = null; // { data, startIndex } for the active search, used by path-on-click
let layoutChoice = "rings";
let activeLayout = null; // so a new render can stop one still animating
let findMatches = []; // the current prefix's matches, nearest first
let findSelected = 0; // which row the arrow keys are on

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
    closeFind();
  }
}

// Cmd/Ctrl+F filters the words already on screen by prefix -- a different job
// from the header's search field, which starts a new search. Nothing is removed
// from the graph: non-matching words dim, so a match keeps its ring and you can
// still read how far away it is.
function openFind() {
  if (!currentExplore) return;
  findBar.hidden = false;
  // The field only accepts words of the length this graph is made of.
  findInput.maxLength = currentExplore.data.length;
  findInput.value = "";
  findInput.setAttribute("aria-expanded", "true");
  findInput.focus();
  applyFind("");
}

function closeFind() {
  findBar.hidden = true;
  findInput.value = "";
  findInput.setAttribute("aria-expanded", "false");
  findCount.textContent = "";
  findMatches = [];
  findSelected = 0;
  findResults.hidden = true;
  findResults.innerHTML = "";
  if (cy) cy.elements().removeClass("dimmed");
}

function applyFind(prefix) {
  if (!cy || !currentExplore) return;
  const wanted = prefix.toLowerCase();
  const matches = [];
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const hit = wanted === "" || node.data("label").startsWith(wanted);
      if (hit && wanted !== "") {
        matches.push({ word: node.data("label"), distance: node.data("distance") });
      }
      node.toggleClass("dimmed", !hit);
    });
    cy.edges().forEach((edge) => {
      const dim = edge.source().hasClass("dimmed") || edge.target().hasClass("dimmed");
      edge.toggleClass("dimmed", dim);
    });
  });
  // Nearest first: the same order the list reads in, and the same order Enter
  // and the arrow keys walk through it.
  matches.sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word));
  findMatches = matches;
  findSelected = 0;
  findCount.textContent =
    wanted === "" ? "" : matches.length === 0 ? "no matches" : `${matches.length} word${matches.length === 1 ? "" : "s"}`;
  renderFindResults();
}

function renderFindResults() {
  const show = findMatches.length > 0 && findMatches.length < FIND_LIST_LIMIT;
  findResults.hidden = !show;
  findResults.innerHTML = "";
  if (!show) return;
  findMatches.forEach((match, index) => {
    const item = document.createElement("li");
    item.dataset.word = match.word;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === findSelected));
    item.classList.toggle("is-selected", index === findSelected);
    const dot = document.createElement("span");
    dot.className = "find-dot";
    dot.style.setProperty("--dot", colorForDistance(match.distance));
    const word = document.createElement("span");
    word.className = "find-word";
    word.textContent = match.word;
    const distance = document.createElement("span");
    distance.className = "find-distance";
    distance.textContent =
      match.distance === 0 ? "the searched word" : `${match.distance} change${match.distance === 1 ? "" : "s"}`;
    item.append(dot, word, distance);
    findResults.appendChild(item);
  });
}

function moveFindSelection(delta) {
  if (findResults.hidden || findMatches.length === 0) return;
  findSelected = (findSelected + delta + findMatches.length) % findMatches.length;
  renderFindResults();
}

// Walk to the closest match, which is what double-clicking it would do. Ties go
// to the alphabetically first, so which one you land on is not insertion order.
function walkToFind() {
  // With the list on screen the selection is the answer -- Enter and the arrow
  // keys are the same choice. Without it, take the closest.
  if (!findResults.hidden && findMatches.length > 0) {
    walkToWord(findMatches[findSelected].word);
    return;
  }
  const wanted = findInput.value.trim().toLowerCase();
  if (!wanted || !cy) return;
  const matches = cy.nodes().filter((node) => node.data("label").startsWith(wanted));
  if (matches.length === 0) return;
  let best = matches[0];
  matches.forEach((node) => {
    const closer = node.data("distance") < best.data("distance");
    const tie = node.data("distance") === best.data("distance") && node.data("label") < best.data("label");
    if (closer || tie) best = node;
  });
  walkToWord(best.data("label"));
}

function walkToWord(word) {
  closeFind();
  wordInput.value = word;
  explore();
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
    // Double-click to walk to a word: it becomes the searched word, so the whole
    // graph is rebuilt and centred on it. A single click still just lists the
    // path to it, which is what makes the second click meaningful.
    cy.on("dbltap", "node", (event) => {
      wordInput.value = event.target.data("label");
      explore();
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
  for (const [step, index] of path.entries()) {
    const item = document.createElement("li");
    item.textContent = data.words[index];
    // The path is a shortest path, so its position in the list *is* the number
    // of changes: the dot takes that ring's colour, and the panel agrees with
    // the graph rather than carrying its own palette.
    item.style.setProperty("--dot", colorForDistance(step));
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

// The ring counts, not a colour key. Colour is already the third encoding of
// distance -- after ring radius and node size -- so a legend that only restated
// it earned nothing. What is on screen nowhere else is the *shape* of the
// result: that 145 of a "hotel" search's 181 words sit in the outermost ring.
// Each item is the words a ring adds, which is why they are prefixed "+".
function renderLegend(ringCounts) {
  legend.innerHTML = "";
  if (ringCounts === null) {
    legend.hidden = true;
    return;
  }
  legend.hidden = false;
  const addItem = (color, text, title) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.title = title;
    item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${text}`;
    legend.appendChild(item);
  };
  ringCounts.forEach((count, distance) => {
    addItem(
      colorForDistance(distance),
      distance === 0 ? "root" : `+${count}`,
      distance === 0
        ? "the searched word"
        : `${distance} change${distance === 1 ? "" : "s"} away \u2014 ${count} word${count === 1 ? "" : "s"}`
    );
  });
}

function renderElements(elements, tier, layoutOptions, onSettled) {
  const instance = getCy();
  instance.style(buildStylesheet(tier));
  // A layout that is still animating keeps animating the elements it was given,
  // and remove()+add() below recreates those same element ids -- so the stale
  // animation drags the *new* nodes back to its own starting frame. Measured:
  // pressing Enter twice 50ms apart left all 181 nodes stacked at 0,0 with every
  // one of them reporting animated() === true, and a 81x43 bounding box at
  // maxZoom. Stopping the elements is the part that matters; stopping the layout
  // alone does not clear their animations.
  if (activeLayout) {
    activeLayout.stop();
    activeLayout = null;
  }
  instance.elements().stop();
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
  // Pin the zoom before laying out. Cytoscape's breadthfirst sizes its rings
  // from the nodes' screen-space dimensions, so whatever zoom it finds leaks
  // into the model-space geometry: the same 566-word search comes out 723 units
  // wide at zoom 1, 1413 at zoom 0.5 and -- at the 0.05 clamp a hidden
  // container used to leave behind -- 13,537, which was the real reason the
  // graph once rendered as an invisible smear. With the view neutralised the
  // geometry depends only on the graph, so toggling layouts no longer changes
  // the ring spacing. The final zoom is set below, once the layout has settled.
  instance.zoom(1);
  // The layout is told not to fit itself. An animated layout has not reached
  // its final positions when run() returns, so fitting then measures the
  // starting positions; and a fit on layoutstop fires in the same tick as
  // anything registered here, so it would undo a pan applied alongside it.
  // Fitting and recentring therefore both happen at the end, in this order.
  // makeLayout(), not layout(): cy.layout() runs the layout immediately, so
  // calling run() on it as well started the layout -- and its animation -- twice
  // over, and stop() then only cleared one of them.
  const layout = instance.makeLayout({ ...layoutOptions, fit: false });
  activeLayout = layout;
  layout.one("layoutstop", () => {
    if (activeLayout !== layout) return; // superseded by a newer render
    activeLayout = null;
    // A search recentres on its own root, which subsumes fitting.
    if (onSettled) onSettled();
    else instance.fit(undefined, padding);
  });  layout.run();
  // Only stand in if the layout has not already settled. A non-animated layout
  // fires layoutstop inside run(), and the handler above clears activeLayout, so
  // this no longer clobbers the centring it just did -- which an unconditional
  // fit() did, and which only looked harmless because a symmetric ring layout
  // fits about the same place as it centres.
  if (activeLayout === layout) instance.fit(undefined, padding);
}

// Two ways to read the same subgraph, offered side by side because neither wins
// outright. Rings put the change distance on screen as literal distance from the
// searched word, which is the app's whole idea, so that is the default; Organic
// packs tighter but leaves distance to colour and size.
function layoutOptionsFor(tier, nodeCount, rootId) {
  // No animation, anywhere. An animated layout keeps animating the element ids
  // it was given, and because a re-render recreates those ids, a second search
  // inside the first one's animation dragged the new nodes back to the old start
  // frame: measured, pressing Enter twice left all 181 nodes stacked at 0,0 in
  // an 81x43 box at maxZoom. stop() on the layout and on the elements did not
  // clear it. Both layouts are fast enough to place instantly -- breadthfirst is
  // 119ms at 566 words -- and the node styles still transition width and colour,
  // so the graph is not visibly abrupt.
  const animate = false;
  if (layoutChoice === "organic") {
    return {
      name: "cose",
      idealEdgeLength: 70 * tier.spacingFactor,
      nodeRepulsion: 12000,
      gravity: 50,
      // cose is O(n^2) per iteration and computes them in a tight loop, so the
      // iteration budget has to come down as the word count goes up. 500 is
      // under a second up to ~200 words, but on a 566-word search it blocked
      // the main thread for 59s; measured at 566 words, 40 iterations costs
      // 4.2s and 80 costs 6.0s (and packs tighter). Past 200 words trade
      // packing for time. (animate:true is not the answer -- it spreads the
      // same work across frames, still ~30s, with worse packing.)
      numIter: nodeCount <= 200 ? 500 : Math.max(60, Math.round(34000 / nodeCount)),
      randomize: false,
      animate,
      animationDuration: 300,
      padding: 40,
    };
  }
  return {
    name: "breadthfirst",
    roots: `#${rootId}`,
    circle: true,
    avoidOverlap: true,
    // Fixed, not the tier's spacingFactor: the tier values are tuned for the
    // force layout's edge length, and rings want their own spread. Anything in
    // this range is now stable, since renderElements() pins the zoom first.
    spacingFactor: 0.9,
    animate,
    animationDuration: 300,
    padding: 40,
  };
}

function setLayoutChoice(choice) {
  layoutChoice = choice;
  for (const button of layoutButtons) {
    const active = button.dataset.layout === choice;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

async function ensureLengthLoaded(length) {
  return loadLength(length);
}

async function explore() {
  const word = wordInput.value.trim().toLowerCase();

  if (!word) {
    setStatus("Type a word to explore.", "error");
    return;
  }

  hidePathPanel();
  // The nodes about to be replaced will never fire a mouseout, so the bar's
  // "pointed at" word would otherwise keep naming a node that no longer exists.
  resetHoverTitle();

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

  // One uncapped BFS. The searched set is then a filter of it, and the largest
  // distance it produced is how far this word can be walked at all -- which is
  // what the slider's right end should mean. It is a property of the word, so
  // walking to another one (double-click) can widen or narrow the range.
  const all = bfsDistances(data.adjacency, startIndex, Infinity);
  let reach = 0;
  for (const distance of all.values()) if (distance > reach) reach = distance;
  const requested = Number(distanceMaxSlider.value);
  updateDistanceRange(reach);
  // Assigning a smaller max clamps the slider, so read it back: the status, the
  // legend and the filter all have to agree with what the control shows. The set
  // is unchanged by that -- beyond a word's reach there is nothing to add.
  const maxDistance = Math.min(requested, Number(distanceMaxSlider.value));
  const distances = new Map();
  for (const [index, distance] of all) if (distance <= maxDistance) distances.set(index, distance);
  // How many words each ring contributes. The distances are contiguous from 0,
  // so this has no holes to guard against.
  const ringCounts = [];
  for (const distance of distances.values()) ringCounts[distance] = (ringCounts[distance] ?? 0) + 1;

  const tier = tierFor(distances.size);
  const nodes = [...distances.entries()].map(([index, distance]) => {
    const isRoot = index === startIndex;
    const label = data.words[index];
    const fill = colorForDistance(distance);
    return {
      data: {
        id: String(index),
        label,
        color: fill,
        // White or navy, whichever actually reads on this fill.
        ...labelInkFor(fill),
        distance,
        // Sized by distance: the searched word is the biggest box on screen and
        // each ring outward is smaller. The font travels with the scale, since
        // the box was measured from it -- a fixed font in a shrinking box just
        // pads the node out and lets the label spill over the edges.
        fontSize: fontSizeFor(tier, distance),
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
    // Nothing to place, so the layout is only there to satisfy renderElements.
    renderElements([], tier, { name: "grid" });
    renderLegend(null);
    setView("graph");
    setStatus(`Nothing within ${maxDistance} change(s) of "${word}".`, "error");
    return;
  }

  currentExplore = { data, startIndex };
  // Reveal the canvas before laying out: the layout measures the viewport.
  setView("graph");
  renderLegend(ringCounts);
  // The force layout works in a tight loop, so on a big search it blocks the
  // main thread for seconds. Paint the hint and let the browser actually draw
  // it first, or the freeze reads as a hang.
  if (layoutChoice === "organic" && nodes.length > 150) {
    setStatus(`Laying out ${nodes.length} words\u2026`);
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }
  // Force-directed or rings, choose in the bar. Both are measured against the
  // same word count, so the tier's own spread knob only applies to the former.
  renderElements(
    [...nodes, ...edges],
    tier,
    layoutOptionsFor(tier, nodes.length, startIndex),
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
  // A re-render rebuilds the elements, so any dimming is gone. Put it back if
  // the find bar is still open -- the distance slider and the layout switch both
  // re-render underneath it.
  if (!findBar.hidden) {
    findInput.maxLength = currentExplore.data.length;
    applyFind(findInput.value);
  }
  setStatus(`${nodes.length} words within ${maxDistance} change(s) of "${word}".`);
}

function updateDistanceLabel() {
  distanceValue.textContent = distanceMaxSlider.value;
}

// The slider's right end is "everything reachable from this word" rather than a
// fixed 8, which was arbitrary -- the graph is 26 deep at five letters and 51 at
// seven, while plenty of words cannot be walked anywhere near that far. The
// floor keeps the control usable for the words that are isolated outright (57%
// of eight-letter words have no same-length neighbour at all), where the honest
// answer would otherwise be a dead slider from 0 to 0.
function updateDistanceRange(reach) {
  const next = Math.max(reach, DEFAULT_MAX_DISTANCE);
  if (Number(distanceMaxSlider.max) === next) return;
  distanceMaxSlider.max = String(next);
  updateDistanceLabel();
}

async function init() {
  const lengths = await loadManifest();
  wordCountByLength = new Map(lengths.map(({ length, wordCount }) => [length, wordCount]));

  updateDistanceLabel();
  setLayoutChoice(layoutChoice);
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

// Switching re-renders the search on screen, so the choice is visible without
// re-typing the word. On the full-length view there is no distance to draw, so
// the setting just waits for the next search.
for (const button of layoutButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.layout === layoutChoice) return;
    setLayoutChoice(button.dataset.layout);
    if (currentExplore) explore();
  });
}

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

findClose.addEventListener("click", closeFind);

findInput.addEventListener("input", () => {
  // Letters only: every word in the dictionary is a-z.
  const cleaned = findInput.value.toLowerCase().replace(/[^a-z]/g, "");
  if (cleaned !== findInput.value) findInput.value = cleaned;
  applyFind(cleaned);
});

findInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeFind();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveFindSelection(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    walkToFind();
  }
});

// Clicking a row is the same as selecting it and pressing Enter.
findResults.addEventListener("click", (event) => {
  const item = event.target.closest("li");
  if (item) walkToWord(item.dataset.word);
});

// Cmd+F / Ctrl+F, but only when there is a graph to filter: on the landing
// screen the browser's own find is the right thing to leave alone.
document.addEventListener("keydown", (event) => {
  if (event.key !== "f" || !(event.metaKey || event.ctrlKey)) return;
  if (document.body.dataset.view !== "graph") return;
  event.preventDefault();
  if (findBar.hidden) openFind();
  else findInput.select();
});

init().catch((err) => {
  console.error(err);
  setStatus(`Error: ${err.message}`, "error");
});
