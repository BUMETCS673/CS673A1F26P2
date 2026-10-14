import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fitPoints, subwayLayout } from "../app/components/map-geometry.mjs";

const network = JSON.parse(
  fs.readFileSync(new URL("../app/data/subway-network.json", import.meta.url)),
);

const { points, missing } = subwayLayout(network);

test("official network includes every rail branch and Silver service with positioned stations", () => {
  assert.deepEqual(
    network.routes.map((route) => route.id).sort(),
    [
      "Red",
      "Mattapan",
      "Orange",
      "Blue",
      "Green-B",
      "Green-C",
      "Green-D",
      "Green-E",
      "741",
      "742",
      "743",
      "751",
      "749",
      "746",
    ].sort(),
  );
  assert.deepEqual(missing, []);

  for (const pattern of network.patterns) {
    assert.ok(pattern.stops.length > 1);

    for (const id of pattern.stops) {
      assert.ok(network.stations[id], id);
      assert.ok(points[id].every(Number.isFinite), id);
    }
  }
});

test("shared parent stations preserve rail interchanges and B scope", () => {
  for (const [id, routes] of [
    ["place-pktrm", ["Red", "Green-B", "Green-C", "Green-D", "Green-E"]],
    ["place-gover", ["Blue", "Green-B", "Green-C", "Green-D", "Green-E"]],
    ["place-state", ["Blue", "Orange"]],
    ["place-dwnxg", ["Red", "Orange"]],
    ["place-sstat", ["Red", "741", "742", "743"]],
  ])
    for (const route of routes)
      assert.ok(network.stations[id].routes.includes(route), id + " " + route);

  const bStops = new Set(
    network.patterns
      .filter((pattern) => pattern.route === "Green-B")
      .flatMap((pattern) => pattern.stops),
  );

  assert.equal(bStops.size, 23);
  assert.ok(bStops.has("place-lake") && bStops.has("place-gover"));
  assert.ok(!bStops.has("place-state") && !bStops.has("place-river"));
});

test("camera fits both journey directions and portrait/landscape viewports", () => {
  const journey = network.patterns
    .find((pattern) => pattern.route === "Green-B")
    .stops.map((id) => points[id]);

  for (const aspect of [0.46, 1, 1.4, 2.5]) {
    for (const positions of [
      journey,
      [...journey].reverse(),
      Object.values(points),
      [journey[0]],
    ]) {
      const view = fitPoints(positions, aspect);

      assert.ok(Math.abs(view.width / view.height - aspect) < 1e-10);

      for (const [x, y] of positions) {
        assert.ok(x >= view.x + 169 && x <= view.x + view.width - 169);
        assert.ok(y >= view.y + 169 && y <= view.y + view.height - 169);
      }
    }
  }

  assert.throws(() => fitPoints([], 1), /empty/);
  assert.throws(() => fitPoints(journey, 0), /aspect/);
});

test("Orange and Silver terminal geometry cannot imply a Chelsea interchange", () => {
  assert.deepEqual(network.stations["place-chels"].routes, ["743"]);
  assert.deepEqual(network.stations["place-ogmnl"].routes, ["Orange"]);

  const orange = network.patterns.filter((p) => p.route === "Orange");

  assert.ok(orange.every((p) => !p.stops.includes("place-chels")));

  const chelsea = points["place-chels"];

  // Require visible separation from every Orange segment, not just its endpoint.
  for (const pattern of orange)
    for (let i = 1; i < pattern.stops.length; i++) {
      const a = points[pattern.stops[i - 1]],
        b = points[pattern.stops[i]];

      const dx = b[0] - a[0],
        dy = b[1] - a[1];

      const t = Math.max(
        0,
        Math.min(
          1,
          ((chelsea[0] - a[0]) * dx + (chelsea[1] - a[1]) * dy) / (dx * dx + dy * dy),
        ),
      );

      assert.ok(
        Math.hypot(chelsea[0] - a[0] - t * dx, chelsea[1] - a[1] - t * dy) >= 180,
      );
    }
});
