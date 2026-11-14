/*
 * AI-ASSISTED
 * Tool: GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Serve cached live and planned-time journey snapshots for any station pair, scoping predictions, schedules and alerts to each leg.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import source from "@/app/data/subway-network.json";
import { findTransitJourney, plannerNetwork, parentStationRecords, journeyFilters } from "@/lib/transit-network.mjs";
import { getPredictions, getAlerts, getVehicles, getSchedules, MbtaApiError } from "./mbta-api";
import { createSharedMbtaCache } from "./shared-mbta-cache.mjs";
import { loadBSchedules } from "./b-schedules.mjs";

const network = plannerNetwork(source);
const key = Symbol.for("mbta.transit-shared-data.v2");
const shared = (globalThis[key] ??= { live: new Map(), schedules: new Map(), rateLimit: { until: 0 } });
shared.planned ??= new Map();
const MAX_PLAN_AHEAD_MS = 8 * 86400000;

function sharedCache(entries, key, loaders) {
  if (!entries.has(key)) {
    if (entries.size >= 64) entries.delete(entries.keys().next().value);
    entries.set(key, createSharedMbtaCache(loaders, Date.now, shared.rateLimit));
  }
  return entries.get(key);
}

// `time` (epoch ms) requests a timetable view from that leave time instead of live data.
export async function transitSnapshot(origin, destination, time = null) {
  const journey = findTransitJourney(network, origin, destination);
  if (!journey) throw new MbtaApiError("Choose two connected, different stations.", 400);
  const leaveAt = time == null || time === "" ? null : Number(time);
  if (leaveAt !== null && (!Number.isInteger(leaveAt) || leaveAt < Date.now() - 300000 || leaveAt > Date.now() + MAX_PLAN_AHEAD_MS))
    throw new MbtaApiError("Choose a leave time within the next week.", 400);
  const { route: routes, stop: stops } = journeyFilters(journey);
  const cacheKey = `${routes}:${stops}`;
  const loadSchedules = async (from) => parentStationRecords(await loadBSchedules(getSchedules, from, {
    route: routes, stop: stops, include: "trip,stop",
  }));
  const caches = leaveAt === null ? {
    live: sharedCache(shared.live, routes, {
      predictions: async () => parentStationRecords(await getPredictions({ route: routes, include: "trip,stop" }, { fresh: true })),
      alerts: () => getAlerts({ route: routes, datetime: "NOW" }, { fresh: true }),
      vehicles: async () => parentStationRecords(await getVehicles({ route: routes, include: "trip,stop" })),
    }),
    schedules: sharedCache(shared.schedules, cacheKey, { schedules: () => loadSchedules(Date.now()) }),
  } : {
    planned: sharedCache(shared.planned, `${cacheKey}@${leaveAt}`, {
      alerts: () => getAlerts({ route: routes, datetime: new Date(leaveAt).toISOString() }, { fresh: true }),
      schedules: () => loadSchedules(leaveAt),
    }),
  };
  const resources = leaveAt === null ? ["predictions", "alerts", "vehicles", "schedules"] : ["alerts", "schedules"];
  const results = await Promise.allSettled(resources.map((resource) =>
    (caches.planned ?? (resource === "schedules" ? caches.schedules : caches.live)).read(resource)));
  const snapshot = leaveAt === null ? { retryAt: 0, reused: true } : { retryAt: 0, reused: true, planned: true, leaveAt };
  results.forEach((result, index) => {
    const resource = resources[index];
    const value = result.status === "fulfilled" ? result.value : null;
    snapshot[resource] = value?.data ?? null;
    snapshot[`${resource}CheckedAt`] = value?.fetchedAt ?? null;
    snapshot[`${resource}Error`] = value ? null : result.reason.message;
    snapshot.retryAt = Math.max(snapshot.retryAt, result.reason?.retryAt ?? 0);
    snapshot.reused &&= Boolean(value?.reused);
  });
  return snapshot;
}
