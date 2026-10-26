/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Verify automatic refresh lifetime, visibility, rate-limit recovery and last-known train and vehicle context.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotClient } from "../app/components/b-snapshot-client.mjs";
import { journeyVehicles, journeyTrains } from "../lib/b-trains.mjs";

function harness(fetcher) {
  let now = 1000000, visible = true, id = 0;
  const timers = new Map(), listeners = new Set();
  const client = createSnapshotClient(() => fetcher(now), () => now);
  const options = {
    isVisible: () => visible,
    subscribeVisibility: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    setTimer: (fn, delay) => { timers.set(++id, { fn, due: now + delay }); return id; },
    clearTimer: id => timers.delete(id),
  };
  return { client, timers, listeners, options,
    now: () => now, advance: ms => { now += ms; },
    visibility(value) { visible = value; for (const listener of listeners) listener(); },
    async next() { const [id, timer] = [...timers].sort((a,b) => a[1].due-b[1].due)[0]; timers.delete(id); now = timer.due; await timer.fn(); },
  };
}
const snapshot = now => ({ predictions: { data: [] }, predictionsCheckedAt: now, alertsCheckedAt: now });

test("automatic updates continue beyond two minutes with one timer and no manual action", async () => {
  let calls = 0; const h = harness(now => { calls++; return snapshot(now); });
  const stop = h.client.startAutoRefresh(h.options); await h.client.load();
  for (let i = 0; i < 5; i++) { assert.equal(h.timers.size, 1); await h.next(); }
  assert.equal(calls, 6); assert.equal(h.client.getState().data.predictionsCheckedAt, 1150000);
  stop(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test("visibility pauses polling, return refreshes, and cleanup removes timers and listeners", async () => {
  let calls = 0; const h = harness(now => { calls++; return snapshot(now); });
  const stop = h.client.startAutoRefresh(h.options); await h.client.load();
  h.visibility(false); assert.equal(h.timers.size, 0); h.advance(120000); assert.equal(calls, 1);
  h.visibility(true); await h.client.load(); assert.equal(calls, 2); assert.equal(h.timers.size, 1);
  stop(); h.visibility(true); assert.equal(calls, 2); assert.equal(h.listeners.size, 0);
});

test("manual and visibility events coalesce with an in-flight automatic refresh", async () => {
  let resolve, calls = 0;
  const h = harness(() => { calls++; return new Promise(r => { resolve = r; }); });
  const stop = h.client.startAutoRefresh(h.options);
  await Promise.resolve(); const manual = h.client.load(true);
  h.visibility(false); h.visibility(true); h.visibility(true);
  resolve(snapshot(h.now())); await manual; await Promise.resolve();
  assert.equal(calls, 1); assert.equal(h.timers.size, 1);
  stop();
});

test("429 retry time suppresses both automatic and manual requests then recovers", async () => {
  let calls = 0;
  const h = harness(now => { calls++; if (calls === 2) throw Object.assign(Error("rate limit"), { retryAt: now + 120000 }); return snapshot(now); });
  const stop = h.client.startAutoRefresh(h.options); await h.client.load(); await h.next();
  const failed = h.client.getState(); assert.equal(failed.data.predictionsCheckedAt, 1000000);
  assert.equal(failed.retryAt, 1150000); await h.client.load(true); assert.equal(calls, 2);
  assert.equal([...h.timers.values()][0].due, 1150000);
  await h.next(); assert.equal(calls, 3); assert.equal(h.client.getState().error, "");
  assert.equal(h.client.getState().data.predictionsCheckedAt, 1150000); stop();
});

test("resource failure preserves successful values and timestamps without hiding errors", async () => {
  let calls = 0;
  const original = { ...snapshot(1000000), vehicles: { data: [{ id: "vehicle" }] }, vehiclesCheckedAt: 1000000,
    schedules: { data: [{ id: "schedule" }] }, schedulesCheckedAt: 1000000 };
  const h = harness(now => ++calls === 1 ? original : { predictions: null, predictionsCheckedAt: null,
    predictionsError: "upstream failure", vehicles: null, vehiclesError: "vehicle failure",
    schedules: null, schedulesError: "schedule failure", alertsCheckedAt: now });
  const stop = h.client.startAutoRefresh(h.options); await h.client.load(); await h.next();
  const data = h.client.getState().data;
  assert.deepEqual(data.predictions, original.predictions); assert.equal(data.predictionsCheckedAt, 1000000);
  assert.deepEqual(data.vehicles, original.vehicles); assert.equal(data.vehiclesCheckedAt, 1000000);
  assert.deepEqual(data.schedules, original.schedules); assert.equal(data.schedulesCheckedAt, 1000000);
  assert.equal(data.predictionsError, "upstream failure"); stop();
});

test("successful empty data clears old cards instead of keeping a vanished train", async () => {
  let calls = 0;
  const h = harness(now => ({ ...snapshot(now), predictions: { data: ++calls === 1 ? [{id:"old"}] : [] } }));
  const stop = h.client.startAutoRefresh(h.options); await h.client.load(); await h.next();
  assert.deepEqual(h.client.getState().data.predictions.data, []); stop();
});

test("stopping while a request is pending cannot restart the timer", async () => {
  let resolve; const h = harness(() => new Promise(r => { resolve = r; }));
  const stop = h.client.startAutoRefresh(h.options); await Promise.resolve(); stop();
  resolve(snapshot(h.now())); await h.client.load(); await Promise.resolve();
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test("expired vehicle observations can remain historical, never a departure prediction", () => {
  const now = Date.parse("2026-10-26T03:40:00Z");
  const journey = { direction: 1, stops: [{id:"place-lake",platforms:["70106"]},{id:"place-gover",platforms:["70201"]}] };
  const document = { data: [{id:"vehicle",attributes:{direction_id:1,current_status:"STOPPED_AT",updated_at:new Date(now-91000).toISOString()},
    relationships:{route:{data:{id:"Green-B"}},stop:{data:{id:"70106"}},trip:{data:{id:"trip"}}}}] };
  assert.deepEqual(journeyVehicles(document,journey,now),[]);
  assert.equal(journeyVehicles(document,journey,now,true).length,1);
  assert.deepEqual(journeyTrains(document,journey,now),[]);
});
