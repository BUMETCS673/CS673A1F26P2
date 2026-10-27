/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Test station-label placement and collision rules for the Green B map.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { subwayLayout, fitPoints } from "../app/components/map-geometry.mjs";
import { placeStationLabels } from "../app/components/map-labels.mjs";

const network = JSON.parse(
  fs.readFileSync(new URL("../app/data/subway-network.json", import.meta.url)),
);

const { points } = subwayLayout(network);

const branch = network.patterns.find(
  (p) => p.route === "Green-B" && p.stops[0] === "place-gover",
).stops;

function layout(ids, width, height) {
  const ordered = [ids[0], ids.at(-1), ...ids.slice(1, -1)];

  const candidates = ordered.map((id) => ({
    id,
    point: points[id],
    important: true,
    text:
      (id === ids[0] ? "A · " : id === ids.at(-1) ? "B · " : "") +
      network.stations[id].name,
  }));

  const view = fitPoints(
    ids.map((id) => points[id]),
    width / height,
    180,
  );

  return placeStationLabels(
    candidates,
    Object.values(points),
    view,
    view.width / width,
  );
}

function noOverlaps(placements) {
  const boxes = [...placements.values()].map((p) => p.box);

  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];

      assert.ok(
        !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top),
      );
    }
}

test("BU Central endpoint and Blandford label use the same non-overlapping placement rules", () => {
  const ids = branch.slice(0, branch.indexOf("place-bucen") + 1);

  for (const width of [390, 1080]) {
    const placements = layout(ids, width, 550);

    assert.ok(placements.has("place-bucen"));
    assert.ok(placements.has("place-bland"));
    noOverlaps(placements);
  }
});

test("horizontal labels stay disjoint for short and full-branch journeys", () => {
  for (const ids of [branch, branch.slice(8, 10), [...branch].reverse()]) {
    for (const width of [390, 1080]) {
      const placements = layout(ids, width, 550);

      assert.ok(placements.has(ids[0]) && placements.has(ids.at(-1)));

      if (width === 1080) assert.equal(placements.size, ids.length);

      noOverlaps(placements);
    }
  }
});
