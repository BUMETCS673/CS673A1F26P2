import test from "node:test";
import assert from "node:assert/strict";
import { findJourney, journeyAlerts, upcomingTrains } from "../lib/b-journey.mjs";
const stops = [{ id: "a", platforms: ["a0"] }, { id: "b", platforms: ["b0"] }, { id: "c", platforms: ["c0"] }];
const patterns = [{ direction: 0, stops }, { direction: 1, stops: [...stops].reverse() }];
test("journeys choose direction, include intermediate stops, reject equal or unknown stations", () => {
  assert.equal(findJourney(patterns, "a", "c").direction, 0);
  assert.equal(findJourney(patterns, "c", "a").direction, 1);
  assert.equal(findJourney(patterns, "a", "c").stops.length, 3);
  assert.equal(findJourney(patterns, "a", "a"), null);
  assert.equal(findJourney(patterns, "x", "a"), null);
});
test("journey alerts include intermediate platforms and branch-wide alerts but omit other stops and directions", () => {
  const alert = (id, entity) => ({ id, attributes: { informed_entity: [entity] } });
  const data = [alert("branch", { route: "Green-B" }), alert("platform", { route: "Green-B", stop: "b0" }), alert("outside", { stop: "z" }), alert("wrong-way", { route: "Green-B", direction_id: 1 }), alert("other-route", { route: "Green-C" })];
  assert.deepEqual(journeyAlerts({ data }, findJourney(patterns, "a", "c")).map((a) => a.id), ["branch", "platform"]);
});
test("next three trains deduplicate trips, filter past and canceled predictions, and sort by time", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const item = (id, minutes, extra = {}) => ({ id, relationships: { route: { data: { id: "Green-B" } }, trip: { data: { id: extra.trip ?? id } } }, attributes: { direction_id: 0, departure_time: new Date(now + minutes * 60000).toISOString(), ...extra } });
  const data = [item("later", 10), item("first", 1), item("duplicate", 2, { trip: "first" }), item("past", -1), item("canceled", 3, { schedule_relationship: "CANCELED" }), item("second", 5), item("fourth", 20), item("wrong", 2, { direction_id: 1 })];
  assert.deepEqual(upcomingTrains({ data }, 0, now).map((p) => p.id), ["first", "second", "later"]);
});
