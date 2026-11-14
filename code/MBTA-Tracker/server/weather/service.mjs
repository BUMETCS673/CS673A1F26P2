import { WEATHER_CONFIG, estimateUsage, validateConfig } from "./config.mjs";
import { loadRegions } from "./regions.mjs";
import { createOpenMeteoClient } from "./open-meteo-client.mjs";
import { normalizeLocation } from "./normalize.mjs";

/** @typedef {{status: 'fresh'|'stale'|'unavailable'|'unknown_station', reason?: string|null, stationId: string, regionId?: string, ageMs?: number, weather: object|null}} StationWeatherResult */
/** @typedef {{status: string, requestedTime: string, matchedForecastTime?: string, approximate?: boolean, forecast: object|null}} ForecastResult */

function parseArrivalTime(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new TypeError("Invalid arrival time");
    return value.getTime();
  }
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    throw new TypeError("Arrival time must be an ISO 8601 string with a UTC offset, or a Date");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError("Invalid arrival time");
  return timestamp;
}

/** Create an isolated weather service. The public singleton is exported by index.mjs. */
export function createWeatherService({ config = WEATHER_CONFIG, mapping = loadRegions(config.REGION_MAPPING_URL),
  client, now = Date.now, scheduler = { setInterval, clearInterval }, logger = console } = {}) {
  validateConfig(config);
  const { regions, byStation } = mapping;
  if (!Array.isArray(regions) || !(byStation instanceof Map)) throw new Error("Invalid weather mapping fixture");
  const upstream = client ?? createOpenMeteoClient({ config, now });
  const cache = new Map();
  const failedRegions = new Set();
  let pending = null;
  let timer = null;
  let lastRefreshAttempt = null;
  let lastSuccessfulRefresh = null;
  let batchOperations = 0;
  let locationRefreshAttempts = 0;

  function regionFor(stationId) {
    if (typeof stationId !== "string" || !stationId.trim()) throw new TypeError("stationId must be a nonempty string");
    return byStation.get(stationId) ?? null;
  }
  function snapshot(regionId) {
    const entry = cache.get(regionId);
    if (!entry) return { status: "unavailable", reason: failedRegions.has(regionId) ? "refresh_failed" : "not_initialized", regionId, weather: null };
    const ageMs = Math.max(0, now() - Date.parse(entry.fetchedAt));
    if (ageMs > config.MAX_CACHE_AGE_MS) return { status: "unavailable", reason: "cache_expired", regionId, weather: null };
    const failed = failedRegions.has(regionId);
    const overdue = ageMs > config.REFRESH_INTERVAL_MS;
    return { status: failed || overdue ? "stale" : "fresh", reason: failed ? "refresh_failed" : overdue ? "refresh_overdue" : null,
      regionId, ageMs, weather: structuredClone(entry) };
  }
  /** Read current and forecast weather for a station from process-local cache.
   * @param {string} stationId Canonical MBTA station ID.
   * @returns {StationWeatherResult}
   */
  function getWeatherForStation(stationId) {
    const regionId = regionFor(stationId);
    return regionId ? { stationId, ...snapshot(regionId) } : { stationId, status: "unknown_station", weather: null };
  }
  /** Match an ETA to the nearest 15-minute forecast point; no extrapolation.
   * @param {string} stationId Canonical MBTA station ID.
   * @param {string|Date} arrivalTime Offset-bearing ISO 8601 string or Date.
   * @returns {ForecastResult}
   */
  function getForecastForStation(stationId, arrivalTime) {
    const eta = parseArrivalTime(arrivalTime);
    const requestedTime = new Date(eta).toISOString();
    const regionId = regionFor(stationId);
    if (!regionId) return { stationId, requestedTime, status: "unknown_station", forecast: null };
    if (eta < now() || eta > now() + config.FORECAST_HORIZON_MINUTES * 60_000) {
      return { stationId, regionId, requestedTime, status: "outside_business_horizon", forecast: null };
    }
    const entry = snapshot(regionId);
    if (!entry.weather) return { stationId, requestedTime, ...entry, forecast: null };
    const { forecast, hourlyPrecipitationProbability, forecastCoverage } = entry.weather;
    if (eta < Date.parse(forecastCoverage.start) || eta > Date.parse(forecastCoverage.end)) {
      return { stationId, regionId, requestedTime, status: "no_forecast_coverage", forecast: null,
        forecastCoverage, fetchedAt: entry.weather.fetchedAt };
    }
    const matched = forecast.reduce((best, item) =>
      Math.abs(Date.parse(item.validAt) - eta) < Math.abs(Date.parse(best.validAt) - eta) ? item : best);
    // The API labels this value by interval end: (end - 1 hour, end].
    const probability = hourlyPrecipitationProbability.find(item =>
      eta > Date.parse(item.intervalStart) && eta <= Date.parse(item.intervalEnd)) ?? null;
    return { stationId, regionId, status: entry.status, reason: entry.reason, requestedTime,
      matchedForecastTime: matched.validAt, approximate: matched.validAt !== requestedTime,
      forecast: matched, hourlyPrecipitationProbability: probability,
      fetchedAt: entry.weather.fetchedAt, forecastCoverage, ageMs: entry.ageMs,
      units: entry.weather.units, attribution: entry.weather.attribution };
  }
  /** One object per region, suitable for a map overlay.
   * @returns {Array<{regionId: string, stationIds: string[], status: string, weather: object|null}>}
   */
  function getAllRegionWeather() {
    return regions.map(region => ({ regionId: region.id, stationIds: [...region.stationIds], ...snapshot(region.id) }));
  }
  async function doRefresh() {
    lastRefreshAttempt = new Date(now()).toISOString();
    const batches = [];
    for (let index = 0; index < regions.length; index += config.MAX_BATCH_SIZE) batches.push(regions.slice(index, index + config.MAX_BATCH_SIZE));
    let cursor = 0;
    let successes = 0;
    const workers = Array.from({ length: Math.min(config.MAX_CONCURRENT_REQUESTS, batches.length) }, async () => {
      while (cursor < batches.length) {
        const batchIndex = cursor++;
        const batch = batches[batchIndex];
        batchOperations++;
        locationRefreshAttempts += batch.length;
        try {
          const responses = await upstream.fetchBatch(batch);
          if (!Array.isArray(responses) || responses.length !== batch.length) throw new Error("Batch response count mismatch");
          for (let index = 0; index < batch.length; index++) {
            const region = batch[index];
            try {
              const receivedAt = now();
              const normalized = normalizeLocation(responses[index], region, receivedAt, config);
              const requiredUntil = receivedAt + (config.FORECAST_HORIZON_MINUTES +
                config.REFRESH_INTERVAL_MS / 60_000 + config.COVERAGE_BUFFER_MINUTES) * 60_000;
              if (Date.parse(normalized.forecastCoverage.start) > receivedAt ||
                  Date.parse(normalized.forecastCoverage.end) < requiredUntil) throw new Error("Insufficient 15-minute forecast coverage");
              if (Date.parse(normalized.hourlyPrecipitationProbability.at(-1).intervalEnd) < requiredUntil) {
                throw new Error("Insufficient hourly probability coverage");
              }
              normalized.fetchedAt = new Date(now()).toISOString();
              cache.set(region.id, normalized);
              failedRegions.delete(region.id);
              successes++;
            } catch (error) {
              failedRegions.add(region.id);
              logger.error("Weather region refresh failed", { regionId: region.id, batchIndex, message: error.message });
            }
          }
        } catch (error) {
          for (const region of batch) failedRegions.add(region.id);
          logger.error("Weather batch refresh failed", { batchIndex, regionIds: batch.map(item => item.id),
            status: error.status ?? null, message: error.message });
        }
      }
    });
    await Promise.all(workers);
    if (successes) lastSuccessfulRefresh = new Date(now()).toISOString();
    return { successfulRegions: successes, failedRegions: [...failedRegions], totalRegions: regions.length };
  }
  /** Deduplicate all refresh callers against one in-flight Promise.
   * @returns {Promise<{successfulRegions: number, failedRegions: string[], totalRegions: number}>}
   */
  function refreshWeatherCache() {
    if (!pending) pending = doRefresh().finally(() => { pending = null; });
    return pending;
  }
  /** Start one periodic timer and perform the initial refresh.
   * @returns {Promise<object>} Initial refresh summary or current status if already started.
   */
  function startWeatherRefresh() {
    if (timer !== null) return pending ?? Promise.resolve(getWeatherStatus());
    timer = scheduler.setInterval(() => {
      refreshWeatherCache().catch(error => logger.error("Weather refresh failed", { message: error.message }));
    }, config.REFRESH_INTERVAL_MS);
    return refreshWeatherCache();
  }
  /** Stop future refreshes; an already running request may finish.
   * @returns {void}
   */
  function stopWeatherRefresh() {
    if (timer !== null) scheduler.clearInterval(timer);
    timer = null;
  }
  /** Return process-local operations, freshness and estimated API usage.
   * @returns {object}
   */
  function getWeatherStatus() {
    return { configuredRegions: regions.length, availableCacheEntries: [...cache.keys()].filter(id => snapshot(id).weather).length,
      lastRefreshAttempt, lastSuccessfulRefresh, failedRegions: [...failedRegions],
      refreshing: pending !== null, scheduling: timer !== null,
      batchOperationsAttempted: batchOperations, locationRefreshAttempts,
      httpRequestsAttempted: upstream.getRequestStats?.().httpRequests ?? null,
      estimatedUsage: estimateUsage(regions.length, config) };
  }
  return { getWeatherForStation, getForecastForStation, getAllRegionWeather, refreshWeatherCache,
    startWeatherRefresh, stopWeatherRefresh, getWeatherStatus };
}
