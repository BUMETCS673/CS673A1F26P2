/*
 * AI-ASSISTED
 * Tool: GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Test leave-time resolution, chronological stop sorting and untimed-stop inheritance for multi-stop itineraries.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { resolveLeaveTime, leaveTimes, sortStopsByTime } from "../lib/itinerary.mjs";

// 10:00 AM in Boston (EST) on Nov 14, 2025.
const now = Date.parse("2025-11-14T15:00:00Z");
const stop = (station, time = "") => ({ key: station, station, time });

test("leave times resolve to the next Boston occurrence with a short grace period", () => {
  assert.deepEqual(resolveLeaveTime("12:30", now), { at: Date.parse("2025-11-14T17:30:00Z"), tomorrow: false, passed: false });
  assert.deepEqual(resolveLeaveTime("09:45", now), { at: Date.parse("2025-11-14T14:45:00Z"), tomorrow: false, passed: true });
  assert.deepEqual(resolveLeaveTime("09:00", now), { at: Date.parse("2025-11-15T14:00:00Z"), tomorrow: true, passed: false });
  // Daylight-saving time uses the EDT offset.
  assert.equal(resolveLeaveTime("08:00", Date.parse("2025-07-01T11:00:00Z")).at, Date.parse("2025-07-01T12:00:00Z"));
  assert.equal(resolveLeaveTime("", now), null);
  assert.equal(resolveLeaveTime("25:00", now), null);
});

test("untimed stops inherit the previous leave time and the final stop has none", () => {
  const times = leaveTimes([stop("a"), stop("b"), stop("c", "11:00"), stop("d"), stop("e")], now);
  assert.equal(times[0].at, null);
  assert.equal(times[1].at, null);
  assert.equal(times[1].inherited, true);
  assert.equal(times[2].at, Date.parse("2025-11-14T16:00:00Z"));
  assert.equal(times[3].at, times[2].at);
  assert.equal(times[3].inherited, true);
  assert.equal(times[4], null);
});

test("stops re-order chronologically with untimed stops attached and the final stop fixed", () => {
  const names = (stops) => stops.map((item) => item.station).join("");
  assert.equal(names(sortStopsByTime([stop("a", "12:00"), stop("b", "10:30"), stop("c")], now)), "bac");
  assert.equal(names(sortStopsByTime(
    [stop("a", "12:00"), stop("b"), stop("c", "11:00"), stop("d", "10:30"), stop("e", "08:00")], now)), "dcabe");
  // An untimed first stop means now, so it stays ahead of later times.
  assert.equal(names(sortStopsByTime([stop("a"), stop("b", "10:30"), stop("c", "10:15"), stop("d")], now)), "acbd");
  const ordered = [stop("a", "10:15"), stop("b", "11:00"), stop("c")];
  assert.equal(sortStopsByTime(ordered, now), ordered);
});
