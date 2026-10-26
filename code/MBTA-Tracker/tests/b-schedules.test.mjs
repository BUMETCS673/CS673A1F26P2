/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Verify scheduled fallback, trip matching, service dates, queue replenishment and shared refreshes.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { journeyScheduledTrains, scheduledFallback } from "../lib/b-schedules.mjs";
import { scheduleWindows, loadBSchedules } from "../server/b-schedules.mjs";
import { createSharedMbtaCache } from "../server/shared-mbta-cache.mjs";
import { createSnapshotClient } from "../app/components/b-snapshot-client.mjs";

const now = Date.parse("2026-10-26T03:15:00Z");
const time = minutes => new Date(now + minutes * 60000).toISOString();
function fixture(direction = 1) {
  const journey = { direction, destination: "Destination", stops: [
    { id: "origin", platforms: [direction ? "70106" : "70202"] },
    { id: "destination", platforms: [direction ? "70201" : "70107"] },
  ] };
  const row = (stop, sequence, minutes, terminal = false) => ({
    id: `${direction}-${sequence}`, serviceDate: "2026-10-25",
    attributes: { direction_id: direction, stop_sequence: sequence,
      departure_time: terminal ? null : time(minutes), arrival_time: time(minutes),
      pickup_type: terminal ? 1 : 0, drop_off_type: 0 },
    relationships: { route: { data: { id: "Green-B" } }, trip: { data: { id: "trip" + direction } }, stop: { data: { id: stop } } },
  });
  const schedules = { data: [row(journey.stops[0].platforms[0], 1, 7), row(journey.stops[1].platforms[0], 23, 51, true)],
    included: [], departureBefore: now + 7200000 };
  const snapshot = { schedules, schedulesCheckedAt: now, predictions: { data: [] }, predictionsCheckedAt: now };
  return { journey, schedules, snapshot };
}

for (const direction of [0, 1]) test(`scheduled fallback matches direction ${direction} and the same trip`, () => {
  const f = fixture(direction), result = scheduledFallback(f.snapshot, f.journey, [], now);
  assert.equal(result.length, 1); assert.equal(result[0].source, "scheduled");
  assert.equal(result[0].departure, time(7)); assert.equal(result[0].destinationArrival, time(51));
  assert.equal(result[0].rideMinutes, 44);
  f.journey.direction = 1 - direction;
  assert.deepEqual(journeyScheduledTrains(f.schedules, f.journey, now), []);
});

test("live predictions take priority without topping up with schedules", () => {
  const f = fixture();
  assert.deepEqual(scheduledFallback(f.snapshot, f.journey, [{ id: "live" }], now), []);
});

test("full outbound service does not imply full inbound service or combine fragments", () => {
  const outbound = fixture(0), inbound = fixture(1);
  assert.equal(journeyScheduledTrains(outbound.schedules, outbound.journey, now).length, 1);
  // The inbound trip begins partway along the line, not at the selected origin.
  inbound.schedules.data[0].relationships.stop.data.id = "sutherland-platform";
  assert.deepEqual(journeyScheduledTrains(inbound.schedules, inbound.journey, now), []);
  const fragmented = fixture(1);
  fragmented.schedules.data[1].relationships.trip.data.id = "second-fragment";
  assert.deepEqual(journeyScheduledTrains(fragmented.schedules, fragmented.journey, now), []);
  const shortTurn = fixture(1);
  shortTurn.schedules.data[1].relationships.stop.data.id = "intermediate-terminal";
  assert.deepEqual(journeyScheduledTrains(shortTurn.schedules, shortTurn.journey, now), []);
});

test("past departures, terminal arrivals and no-pickup schedules cannot become departures", () => {
  for (const attributes of [{ departure_time: time(-1) }, { departure_time: null }, { pickup_type: 1 }]) {
    const f = fixture(); Object.assign(f.schedules.data[0].attributes, attributes);
    assert.deepEqual(journeyScheduledTrains(f.schedules, f.journey, now), []);
  }
});

test("destination requires same service date, trip, forward sequence and permitted drop-off", () => {
  for (const change of [r => r.serviceDate = "2026-10-26", r => r.relationships.trip.data.id = "other",
    r => r.attributes.stop_sequence = 0, r => r.attributes.drop_off_type = 1,
    r => r.attributes.arrival_time = time(1)]) {
    const f = fixture(); change(f.schedules.data[1]);
    assert.deepEqual(journeyScheduledTrains(f.schedules, f.journey, now), []);
  }
});

test("after-midnight arrival stays tied to the original service day; expired departures disappear", () => {
  const f = fixture(), train = journeyScheduledTrains(f.schedules, f.journey, now)[0];
  assert.equal(train.serviceDate, "2026-10-25");
  assert.equal(train.destinationArrival, "2026-10-26T04:06:00.000Z");
  assert.deepEqual(journeyScheduledTrains(f.schedules, f.journey, now + 8 * 60000), []);
});

test("forecast/schedule failures and stale snapshots do not become scheduled reassurance", () => {
  for (const patch of [{ predictionsError: "failure" }, { schedulesError: "failure" },
    { predictions: null }, { predictionsCheckedAt: now - 90001 },
    { schedulesCheckedAt: now - 300001 }, { schedules: null }]) {
    const f = fixture(); Object.assign(f.snapshot, patch);
    assert.deepEqual(scheduledFallback(f.snapshot, f.journey, [], now), []);
  }
});

test("live cancellations and skipped destination stops override the timetable", () => {
  for (const stopIndex of [0, 1]) {
    const f = fixture(), canceled = structuredClone(f.schedules.data[stopIndex]);
    canceled.attributes.schedule_relationship = "SKIPPED";
    f.snapshot.predictions.data.push(canceled);
    assert.deepEqual(scheduledFallback(f.snapshot, f.journey, [], now), []);
  }
});

test("Boston service windows cover midnight, 3 AM rollover and DST without using UTC date", () => {
  assert.deepEqual(scheduleWindows(now), [{ date: "2026-10-25", min_time: "22:15", max_time: "26:15" }]);
  assert.deepEqual(scheduleWindows(Date.parse("2026-10-26T04:30:00Z")), [
    { date: "2026-10-25", min_time: "23:30", max_time: "27:00" },
    { date: "2026-10-26", min_time: "03:00", max_time: "03:30" },
  ]);
  assert.equal(scheduleWindows(Date.parse("2026-10-26T07:00:00Z"))[0].date, "2026-10-26");
  assert.deepEqual(scheduleWindows(Date.parse("2026-11-01T05:45:00Z")), [
    { date: "2026-10-31", min_time: "24:45", max_time: "27:00" },
    { date: "2026-11-01", min_time: "03:00", max_time: "03:45" },
  ]);
});

test("schedule loader follows pagination and retains service-date provenance", async () => {
  const calls = [];
  const result = await loadBSchedules(async params => {
    calls.push(params);
    return { data: [{ id: String(params.page_offset) }], included: [],
      links: params.page_offset === 0 ? { next: "https://api-v3.mbta.com/schedules?page[offset]=1000" } : {} };
  }, now);
  assert.equal(calls.length, 2); assert.equal(calls[1].page_offset, 1000);
  assert.equal(calls[0].route, "Green-B"); assert.equal(calls[0].stop, undefined);
  assert.ok(result.data.every(row => row.serviceDate === "2026-10-25"));
  assert.equal(result.departureBefore, now + 7200000);
});

test("schedule pagination failure rejects the partial timetable", async () => {
  await assert.rejects(loadBSchedules(async params => {
    if (params.page_offset) throw Error("schedule unavailable");
    return { data: [{ id: "partial" }], links: { next: "?page[offset]=1000" } };
  }, now), /schedule unavailable/);
});

test("shared timetable has a five-minute TTL, coalesces requests and backs off after failure", async () => {
  let clock = now, calls = 0, fail = false;
  const cache = createSharedMbtaCache({ schedules: async () => { calls++; if (fail) throw Error("offline"); return { data: [] }; } }, () => clock);
  await Promise.all(Array.from({ length: 20 }, () => cache.read("schedules")));
  assert.equal(calls, 1); clock += 299999; await cache.read("schedules"); assert.equal(calls, 1);
  clock++; fail = true; await assert.rejects(cache.read("schedules"));
  await assert.rejects(cache.read("schedules")); assert.equal(calls, 2);
  clock += 30000; fail = false; await cache.read("schedules"); assert.equal(calls, 3);
});

test("repeated reversals use the same snapshot; schedule failure can be explicitly retried", async () => {
  let calls = 0; const a = fixture(1), b = fixture(0);
  const snapshot = { ...a.snapshot, schedules: { ...a.schedules, data: [...a.schedules.data, ...b.schedules.data] } };
  const client = createSnapshotClient(async () => { calls++; return calls === 1 ? { ...snapshot, schedulesError: "unavailable" } : snapshot; }, () => now);
  await client.load(); assert.equal(client.getState().data.schedulesError, "unavailable");
  await client.load(true);
  for (let i = 0; i < 20; i++) assert.equal(scheduledFallback(client.getState().data, i % 2 ? a.journey : b.journey, [], now).length, 1);
  assert.equal(calls, 2);
});

test("scheduled queue promotes saved trips across midnight and ends without inventing service", () => {
  const f = fixture();
  f.schedules.data = [40, 50, 60, 70, 80].flatMap((minute, i) => f.schedules.data.map(row => ({
    ...row, id: row.id + '-' + i,
    attributes: { ...row.attributes, departure_time: row.attributes.departure_time ? time(minute) : null,
      arrival_time: time(minute + (row.attributes.departure_time ? 0 : 44)) },
    relationships: { ...row.relationships, trip: { data: { id: 'trip-' + i } } },
  })));
  const trips = minute => journeyScheduledTrains(f.schedules, f.journey, now + minute * 60000).map(t => t.trip);
  assert.deepEqual(trips(0), ['trip-0', 'trip-1', 'trip-2']);
  assert.deepEqual(trips(41), ['trip-1', 'trip-2', 'trip-3']);
  assert.deepEqual(trips(51), ['trip-2', 'trip-3', 'trip-4']);
  assert.deepEqual(trips(71), ['trip-4']);
  assert.deepEqual(trips(81), []);
});
