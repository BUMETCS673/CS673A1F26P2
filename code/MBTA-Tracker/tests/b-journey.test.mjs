import test from "node:test";
import assert from "node:assert/strict";
import { findJourney, journeyAlerts, suspensionAlerts, suspensionEnd, upcomingTrains } from "../lib/b-journey.mjs";
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
test("suspensions block a leg only when they cover two consecutive stops, in the leg's direction, while active", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const four = [...stops, { id: "d", platforms: ["d0"] }];
  const leg = (ids, extra = {}) => ({ route: "Green-B", direction: 0, stops: ids.map((id) => four.find((stop) => stop.id === id)), ...extra });
  const alert = (entities, extra = {}) => ({ id: "x", attributes: { effect: "SUSPENSION", active_period: [{ start: "2026-11-07T08:00:00Z", end: "2026-11-16T08:00:00Z" }],
    informed_entity: entities.map((entity) => ({ route: "Green-B", direction_id: 0, ...entity })), ...extra } });
  const blocked = (a, journey) => suspensionAlerts([a], journey, now).length === 1;
  const middle = alert([{ stop: "b0" }, { stop: "c0" }]);
  assert.equal(blocked(middle, leg(["a", "b", "c", "d"])), true);
  assert.equal(blocked(middle, leg(["b", "c"])), true);
  assert.equal(blocked(middle, leg(["a", "b"])), false);
  assert.equal(blocked(middle, leg(["c", "d"])), false);
  assert.equal(blocked(middle, leg(["a", "b", "c", "d"], { direction: 1 })), false);
  assert.equal(blocked(alert([{ route: "Green-B", direction_id: null }]), leg(["a", "b"])), true);
  assert.equal(blocked(alert([{ trip: "t1" }]), leg(["a", "b"])), false);
  assert.equal(blocked(alert([{ stop: "b0" }, { stop: "c0" }], { effect: "DELAY" }), leg(["a", "b", "c"])), false);
  assert.equal(blocked(alert([{ stop: "b0" }, { stop: "c0" }], { active_period: [{ start: "2026-11-01T08:00:00Z", end: "2026-11-10T08:00:00Z" }] }), leg(["a", "b", "c"])), false);
  const shared = leg(["b", "c"], { routes: ["Green-B", "Green-C"] });
  assert.equal(blocked(middle, shared), false);
  assert.equal(blocked(alert([{ stop: "b0" }, { stop: "c0" }, { route: "Green-C", stop: "b0" }, { route: "Green-C", stop: "c0" }]), shared), true);
  assert.equal(suspensionEnd(middle, now), "2026-11-16T08:00:00Z");
  assert.equal(suspensionEnd(alert([], { active_period: [] }), now), null);
});
