import { getBNetwork, getPredictions, getAlerts, getVehicles } from "./mbta-api";
import { createSharedMbtaCache } from "./shared-mbta-cache.mjs";

// Shared by both route handlers and retained across development module reloads.
const key = Symbol.for("mbta.b-shared-data.v2");
const cache = (globalThis[key] ??= createSharedMbtaCache({
  network: () => getBNetwork(),
  vehicles: () => getVehicles({ route: "Green-B", include: "trip" }),
  predictions: () =>
    getPredictions({ route: "Green-B", include: "trip" }, { fresh: true }),
  alerts: () => getAlerts({ route: "Green-B", datetime: "NOW" }, { fresh: true }),
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
