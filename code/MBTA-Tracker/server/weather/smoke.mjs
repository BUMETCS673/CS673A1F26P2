// Explicit opt-in live check: node server/weather/smoke.mjs
import { WEATHER_CONFIG } from "./config.mjs";
import { loadRegions } from "./regions.mjs";
import { createOpenMeteoClient } from "./open-meteo-client.mjs";
import { normalizeLocation } from "./normalize.mjs";

const regions = loadRegions().regions.slice(0, 2);
const client = createOpenMeteoClient();
const responses = await client.fetchBatch(regions);
for (let index = 0; index < regions.length; index++) {
  const receivedAt = Date.now();
  const weather = normalizeLocation(responses[index], regions[index], receivedAt, WEATHER_CONFIG);
  const required = receivedAt + (WEATHER_CONFIG.FORECAST_HORIZON_MINUTES +
    WEATHER_CONFIG.REFRESH_INTERVAL_MS / 60_000 + WEATHER_CONFIG.COVERAGE_BUFFER_MINUTES) * 60_000;
  if (Date.parse(weather.forecastCoverage.end) < required) throw new Error(`Insufficient coverage for ${regions[index].id}`);
  console.log(JSON.stringify({ regionId: regions[index].id, forecastCoverage: weather.forecastCoverage,
    points: weather.forecast.length, hourlyIntervals: weather.hourlyPrecipitationProbability.length }));
}
