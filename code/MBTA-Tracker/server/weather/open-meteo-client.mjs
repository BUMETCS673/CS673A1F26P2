/*
 * AI Tool Assist
 * Tool: Codex and ChatGPT
 * Prompt Summary: Request batched Open-Meteo forecasts with timeout, retry, and rate-limit handling.
 * AI Contribution: (~75%)
 *
 * Description:
 * Builds forecast requests and fetches ordered weather responses from Open-Meteo.
 *
 * buildForecastUrl(): Creates a forecast URL for a batch of regions.
 * createOpenMeteoClient(): Provides batch fetching, retry handling, and request statistics.
 */

import { WEATHER_CONFIG, forecastPointCounts, validateConfig } from "./config.mjs";

/** Error with upstream status and optional retry time. */
export class WeatherUpstreamError extends Error {
  constructor(message, status, retryAfterMs = 0) {
    super(message); this.name = "WeatherUpstreamError"; this.status = status; this.retryAfterMs = retryAfterMs;
  }
}

export function buildForecastUrl(regions, config = WEATHER_CONFIG) {
  if (!regions.length || regions.length > config.MAX_BATCH_SIZE) throw new Error("Invalid weather batch size");
  const url = new URL(config.API_BASE_URL);
  const counts = forecastPointCounts(config);
  const params = new URLSearchParams({
    latitude: regions.map(region => region.requestedCoordinates.latitude).join(","),
    longitude: regions.map(region => region.requestedCoordinates.longitude).join(","),
    current: config.CURRENT_VARIABLES.join(","), minutely_15: config.MINUTELY_VARIABLES.join(","),
    hourly: config.HOURLY_VARIABLES.join(","), forecast_minutely_15: String(counts.minutely15),
    forecast_hours: String(counts.hourly), timezone: config.DISPLAY_TIMEZONE,
    temperature_unit: config.TEMPERATURE_UNIT, precipitation_unit: config.PRECIPITATION_UNIT,
    cell_selection: config.CELL_SELECTION, timeformat: "unixtime",
  });
  url.search = params.toString();
  return url;
}

function retryAfter(header, nowMs, cap) {
  if (!header) return 0;
  const seconds = /^\d+(?:\.\d+)?$/.test(header.trim()) ? Number(header) : NaN;
  const dateMs = Date.parse(header);
  return Math.min(cap, Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(dateMs) ? dateMs - nowMs : 0));
}

export function createOpenMeteoClient({ config = WEATHER_CONFIG, fetchImpl = globalThis.fetch,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  validateConfig(config);
  let cooldownUntil = 0;
  let httpRequests = 0;
  let locationsRequested = 0;
  async function fetchBatch(regions) {
    const url = buildForecastUrl(regions, config);
    for (let attempt = 0; attempt <= config.MAX_RETRIES; attempt++) {
      if (now() < cooldownUntil) await sleep(cooldownUntil - now());
      try {
        httpRequests++;
        locationsRequested += regions.length;
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(config.REQUEST_TIMEOUT_MS) });
        if (!response.ok) {
          const delay = response.status === 429 ? retryAfter(response.headers?.get?.("retry-after"), now(), config.MAX_RATE_LIMIT_COOLDOWN_MS) : 0;
          if (response.status === 429) cooldownUntil = Math.max(cooldownUntil, now() + Math.max(delay, config.RATE_LIMIT_COOLDOWN_MS));
          throw new WeatherUpstreamError(`Open-Meteo HTTP ${response.status}`, response.status, delay);
        }
        const payload = await response.json();
        const locations = Array.isArray(payload) ? payload : [payload];
        if (locations.length !== regions.length || locations.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
          throw new Error("Open-Meteo location count does not match requested batch order");
        }
        return locations;
      } catch (error) {
        const transient = !(error instanceof WeatherUpstreamError) || error.status === 429 || error.status >= 500;
        if (!transient || attempt === config.MAX_RETRIES) throw error;
        await sleep(Math.min(config.MAX_RETRY_DELAY_MS, config.RETRY_DELAY_MS * 2 ** attempt));
      }
    }
  }
  return { fetchBatch, getCooldownUntil: () => cooldownUntil,
    getRequestStats: () => ({ httpRequests, locationsRequested }) };
}
