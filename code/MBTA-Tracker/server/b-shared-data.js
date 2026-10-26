/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Connect the MBTA API wrapper to shared Green B live-data and timetable caches.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import { getBNetwork, getPredictions, getAlerts, getVehicles, getSchedules } from "./mbta-api";
import { createSharedMbtaCache } from "./shared-mbta-cache.mjs";
import { loadBSchedules } from "./b-schedules.mjs";

// Shared by both route handlers and retained across development module reloads.
const key = Symbol.for("mbta.b-shared-data.v3");
const cache = (globalThis[key] ??= createSharedMbtaCache({
  network: () => getBNetwork(),
  vehicles: () => getVehicles({ route: "Green-B", include: "trip" }),
  predictions: () =>
    getPredictions({ route: "Green-B", include: "trip" }, { fresh: true }),
  alerts: () => getAlerts({ route: "Green-B", datetime: "NOW" }, { fresh: true }),
  schedules: () => loadBSchedules(getSchedules),
}));

export async function getSharedBNetwork() {
  return (await cache.read("network")).data;
}

export function getBPredictionsSnapshot() {
  return cache.read("predictions");
}

export function getBAlertsSnapshot() {
  return cache.read("alerts");
}

export function getBVehiclesSnapshot() {
  return cache.read("vehicles");
}

export function getBSchedulesSnapshot() {
  return cache.read("schedules");
}
