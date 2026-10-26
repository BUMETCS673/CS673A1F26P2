/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Test automatic and manual updates, visibility cleanup, backoff and preservation of last-known data.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotClient } from "../app/components/b-snapshot-client.mjs";
import { journeyTrains } from "../lib/b-trains.mjs";

test("initial request is coalesced; time, selections and cooldown refreshes do not fetch", async () => {
  let now = 1000000,
    calls = 0,
    active = 0,
    maxActive = 0;
  const client = createSnapshotClient(
    async () => {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return { predictionsCheckedAt: now, alertsCheckedAt: now };
    },
    () => now,
  );
  await Promise.all(Array.from({ length: 10 }, () => client.load()));
  assert.equal(calls, 1);
  now += 29999;
  for (let i = 0; i < 10; i++) await client.load(true);
  assert.equal(calls, 1);
  assert.equal(client.getState().notice, "Already up to date.");
  now += 1;
  await Promise.all(Array.from({ length: 10 }, () => client.load(true)));
  assert.equal(calls, 2);
  assert.equal(maxActive, 1);
  now += 3600000;
  assert.equal(client.getState().data.predictionsCheckedAt, 1030000);
  assert.equal(calls, 2, "without starting automatic updates, elapsed time does not request data");
});

test("explicit loads preserve 429 and transport failures and respect backoff", async () => {
  let now = 1000000,
    calls = 0;
  const client = createSnapshotClient(
    async () => {
      calls++;
      return {
        predictionsError: "MBTA API rate limit exceeded.",
        predictions: null,
        alerts: { data: [] },
        alertsCheckedAt: now,
        retryAt: now + 120000,
      };
    },
    () => now,
  );
  await client.load();
  for (let i = 0; i < 20; i++) await client.load(true);
  assert.equal(calls, 1);
  assert.equal(client.getState().data.predictions, null);
  assert.match(client.getState().data.predictionsError, /rate limit/);
  now += 120000;
  assert.equal(calls, 1);
  await client.load(true);
  assert.equal(calls, 2);
  let failures = 0;
  const failed = createSnapshotClient(
    async () => {
      failures++;
      throw new Error("Failed to fetch");
    },
    () => now,
  );
  await failed.load();
  await failed.load(true);
  assert.equal(failures, 1);
  assert.equal(failed.getState().data, null);
  assert.match(failed.getState().error, /Failed to fetch/);
});

test("absolute times support both directions, local countdown and removal of expired departures", () => {
  const start = Date.parse("2026-10-13T20:00:00Z");
  const record = (id, stop, direction, sequence, minutes, departure = true) => ({
    id,
    attributes: {
      direction_id: direction,
      stop_sequence: sequence,
      arrival_time: new Date(start + minutes * 60000).toISOString(),
      departure_time: departure
        ? new Date(start + minutes * 60000).toISOString()
        : null,
    },
    relationships: {
      route: { data: { id: "Green-B" } },
      stop: { data: { id: stop } },
      trip: { data: { id: "trip-" + direction } },
    },
  });
  const snapshot = {
    data: [
      record("o0", "70202", 0, 1, 3),
      record("d0", "70107", 0, 23, 45, false),
      record("o1", "70106", 1, 1, 4),
      record("d1", "70201", 1, 23, 46, false),
    ],
  };
  const saved = JSON.stringify(snapshot);
  for (const [direction, from, to] of [
    [0, "70202", "70107"],
    [1, "70106", "70201"],
  ]) {
    const journey = {
      direction,
      stops: [
        { id: "origin", platforms: [from] },
        { id: "destination", platforms: [to] },
      ],
    };
    const first = journeyTrains(snapshot, journey, start)[0];
    const later = journeyTrains(snapshot, journey, start + 60000)[0];
    assert.equal(first.destinationArrival, later.destinationArrival);
    assert.equal(
      Math.ceil((Date.parse(later.departure) - (start + 60000)) / 60000),
      direction ? 3 : 2,
    );
    assert.deepEqual(journeyTrains(snapshot, journey, start + 5 * 60000), []);
  }
  assert.equal(JSON.stringify(snapshot), saved);
});
