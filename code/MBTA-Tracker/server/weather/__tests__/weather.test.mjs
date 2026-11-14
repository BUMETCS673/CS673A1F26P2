import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEATHER_CONFIG, forecastPointCounts, estimateUsage } from "../config.mjs";
import { loadRegions } from "../regions.mjs";
import { buildForecastUrl, createOpenMeteoClient } from "../open-meteo-client.mjs";
import { normalizeLocation } from "../normalize.mjs";
import { createWeatherService } from "../service.mjs";

const mapping = loadRegions();
const config = WEATHER_CONFIG;
const base = Date.parse("2026-11-14T22:07:00Z");
const quiet = { error() {} };

function response(at = base, { badLength = false, code = 2, missing = false } = {}) {
  const first15 = Math.floor(at / 900_000) * 900;
  const firstHour = Math.floor(at / 3_600_000) * 3600;
  const { minutely15, hourly } = forecastPointCounts(config);
  const m = Array.from({ length: minutely15 }, (_, index) => first15 + index * 900);
  const h = Array.from({ length: hourly }, (_, index) => firstHour + index * 3600);
  return {
    latitude: 42.41, longitude: -70.99,
    current: { time: first15, temperature_2m: 0, weather_code: code },
    current_units: { temperature_2m: "°C", weather_code: "wmo code" },
    minutely_15: { time: m, temperature_2m: m.map(() => missing ? null : 0),
      apparent_temperature: m.map(() => 1), precipitation: m.map(() => 0),
      weather_code: m.map(() => code).slice(0, badLength ? -1 : undefined) },
    minutely_15_units: { temperature_2m: "°C", apparent_temperature: "°C", precipitation: "mm", weather_code: "wmo code" },
    hourly: { time: h, precipitation_probability: h.map(() => 30) },
    hourly_units: { precipitation_probability: "%" },
  };
}

test("reviewed region mapping excludes the old grid and preserves harbor split", () => {
  assert.equal(mapping.regions.length, 34);
  assert.equal(mapping.byStation.size, 164);
  assert.notEqual(mapping.byStation.get("17091"), mapping.byStation.get("30249"));
  assert.match(mapping.byStation.get("17091"), /2500m/);
  assert.equal(mapping.byStation.has("unknown"), false);
  const app = JSON.parse(readFileSync(new URL("../../../app/data/subway-network.json", import.meta.url), "utf8"));
  const missing = Object.values(app.stations).filter(station => !mapping.byStation.has(station.id));
  assert.equal(missing.length, 7);
  assert.ok(missing.every(station => station.routes.length === 1 && station.routes[0] === "Mattapan"));
});

test("public module import starts no network activity or timer", async () => {
  const publicApi = await import("../index.mjs");
  const status = publicApi.getWeatherStatus();
  assert.equal(status.configuredRegions, 34);
  assert.equal(status.refreshing, false);
  assert.equal(status.scheduling, false);
  assert.equal(status.batchOperationsAttempted, 0);
});

test("request batches select the seven required variables and a buffered horizon", () => {
  const url = buildForecastUrl(mapping.regions.slice(0, 2));
  assert.equal(url.searchParams.get("current"), "temperature_2m,weather_code");
  assert.equal(url.searchParams.get("minutely_15"), "temperature_2m,apparent_temperature,precipitation,weather_code");
  assert.equal(url.searchParams.get("hourly"), "precipitation_probability");
  assert.equal(url.searchParams.get("timeformat"), "unixtime");
  assert.equal(url.searchParams.get("latitude").split(",").length, 2);
  assert.equal(Number(url.searchParams.get("forecast_minutely_15")), 12);
  assert.equal(Number(url.searchParams.get("forecast_hours")), 5);
  assert.equal(estimateUsage(34).estimatedWeightedCallsPerDay, 4896);
});

test("normalization preserves zero and null, unknown codes and provider grid coordinates", () => {
  const normal = normalizeLocation(response(base, { code: 97, missing: true }), mapping.regions[0], base, config);
  assert.equal(normal.current.temperature, 0);
  assert.equal(normal.forecast[0].temperature, null);
  assert.equal(normal.forecast[0].precipitation, 0);
  assert.equal(normal.forecast[0].condition, "unknown");
  assert.notDeepEqual(normal.requestedCoordinates, normal.providerGridCoordinates);
  assert.equal(normal.hourlyPrecipitationProbability[1].intervalStart, "2026-11-14T22:00:00.000Z");
  assert.throws(() => normalizeLocation(response(base, { badLength: true }), mapping.regions[0], base, config), /array length/);
  const broken = response(); broken.minutely_15.time[1] = broken.minutely_15.time[0];
  assert.throws(() => normalizeLocation(broken, mapping.regions[0], base, config), /not ordered/);
});

test("single and multi-location responses keep requested order", async () => {
  const urls = [];
  const client = createOpenMeteoClient({ fetchImpl: async url => {
    urls.push(url);
    const count = url.searchParams.get("latitude").split(",").length;
    return { ok: true, json: async () => count === 1 ? response() : Array.from({ length: count }, () => response()) };
  }});
  assert.equal((await client.fetchBatch(mapping.regions.slice(0, 1))).length, 1);
  assert.equal((await client.fetchBatch(mapping.regions.slice(0, 2))).length, 2);
  assert.equal(urls.length, 2);
});

test("shared region cache, ETA matching, day boundaries and defensive copies", async () => {
  let nowMs = base;
  let requests = 0;
  const service = createWeatherService({ now: () => nowMs, logger: quiet,
    client: { fetchBatch: async regions => { requests++; return regions.map(() => response(nowMs)); } } });
  const station = mapping.regions.find(region => region.stationIds.length > 1);
  assert.equal(service.getWeatherForStation(station.stationIds[0]).status, "unavailable");
  assert.equal(service.getWeatherForStation("absent").status, "unknown_station");
  await service.refreshWeatherCache();
  assert.equal(requests, 4);
  const first = service.getWeatherForStation(station.stationIds[0]);
  assert.equal(first.status, "fresh");
  first.weather.current.temperature = 999;
  assert.equal(service.getWeatherForStation(station.stationIds[1]).weather.current.temperature, 0);
  const eta = "2026-11-14T18:26:00-05:00";
  const match = service.getForecastForStation(station.stationIds[0], eta);
  assert.equal(match.matchedForecastTime, "2026-11-14T23:30:00.000Z");
  assert.equal(match.approximate, true);
  assert.equal(match.hourlyPrecipitationProbability.intervalEnd, "2026-11-15T00:00:00.000Z");
  assert.equal(service.getForecastForStation(station.stationIds[0], "2026-11-15T02:08:00Z").status, "outside_business_horizon");
  assert.throws(() => service.getForecastForStation(station.stationIds[0], "2026-11-14T19:30:00"), TypeError);
  nowMs += 11 * 60_000;
  const edge = service.getForecastForStation(station.stationIds[0], new Date(nowMs + 120 * 60_000));
  assert.equal(edge.status, "stale");
  assert.equal(requests, 4);
  nowMs += config.MAX_CACHE_AGE_MS;
  assert.equal(service.getWeatherForStation(station.stationIds[0]).reason, "cache_expired");
});

test("partial failures retain prior data, deduplicate refresh, and timers stop", async () => {
  let nowMs = base;
  let fail = false;
  let calls = 0;
  let release;
  const scheduler = { timers: new Set(), setInterval(fn) { this.timers.add(fn); return fn; }, clearInterval(fn) { this.timers.delete(fn); } };
  const client = { fetchBatch: async regions => {
    calls++;
    if (fail && regions[0].id === mapping.regions[0].id) throw Object.assign(new Error("rate limited"), { status: 429 });
    if (release) await release;
    return regions.map(() => response(nowMs));
  }};
  const service = createWeatherService({ now: () => nowMs, client, scheduler, logger: quiet });
  await service.startWeatherRefresh();
  await service.startWeatherRefresh();
  assert.equal(scheduler.timers.size, 1);
  assert.equal(calls, 4);
  fail = true; nowMs += 10 * 60_000;
  const first = service.refreshWeatherCache();
  assert.equal(first, service.refreshWeatherCache());
  await first;
  assert.equal(service.getWeatherForStation(mapping.regions[0].stationIds[0]).status, "stale");
  assert.equal(service.getWeatherForStation(mapping.regions.at(-1).stationIds[0]).status, "fresh");
  service.stopWeatherRefresh();
  assert.equal(scheduler.timers.size, 0);
  assert.equal(service.getWeatherStatus().failedRegions.length, 10);
});

test("corrupt or short forecast responses preserve valid entries and initial failures stay unavailable", async () => {
  let state = "good";
  const client = { fetchBatch: async regions => regions.map(() => {
    const value = response();
    if (state === "corrupt") value.minutely_15.weather_code.pop();
    if (state === "short") {
      for (const list of Object.values(value.minutely_15)) list.splice(-3);
    }
    return value;
  }) };
  const station = mapping.regions[0].stationIds[0];
  const service = createWeatherService({ now: () => base, client, logger: quiet });
  state = "corrupt";
  await service.refreshWeatherCache();
  assert.equal(service.getWeatherForStation(station).reason, "refresh_failed");
  state = "good";
  await service.refreshWeatherCache();
  assert.equal(service.getWeatherForStation(station).status, "fresh");
  state = "short";
  await service.refreshWeatherCache();
  const weather = service.getWeatherForStation(station);
  assert.equal(weather.status, "stale");
  assert.equal(weather.weather.forecast.length, 12);
});

test("ETA beyond actual forecast coverage is unavailable even while cache age is valid", async () => {
  let nowMs = base;
  const longCache = { ...config, MAX_CACHE_AGE_MS: 45 * 60_000 };
  const service = createWeatherService({ config: longCache, now: () => nowMs, logger: quiet,
    client: { fetchBatch: async regions => regions.map(() => response(base)) } });
  await service.refreshWeatherCache();
  nowMs += 44 * 60_000;
  const station = mapping.regions[0].stationIds[0];
  assert.equal(service.getWeatherForStation(station).status, "stale");
  assert.equal(service.getForecastForStation(station, new Date(nowMs + 120 * 60_000)).status, "no_forecast_coverage");
});

test("bounded retry, invalid request and shared rate limit cooldown", async () => {
  let calls = 0;
  const delays = [];
  const client = createOpenMeteoClient({ now: () => base, sleep: async ms => delays.push(ms),
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 429, headers: { get: () => "120" } };
      return { ok: true, json: async () => response() };
    } });
  await client.fetchBatch(mapping.regions.slice(0, 1));
  assert.equal(calls, 2);
  assert.ok(delays.some(ms => ms >= 120_000));
  let badCalls = 0;
  const bad = createOpenMeteoClient({ fetchImpl: async () => { badCalls++; return { ok: false, status: 400 }; }, sleep: async () => {} });
  await assert.rejects(bad.fetchBatch(mapping.regions.slice(0, 1)), /HTTP 400/);
  assert.equal(badCalls, 1);
  let transientCalls = 0;
  const transient = createOpenMeteoClient({ fetchImpl: async () => { transientCalls++; throw new Error("network"); }, sleep: async () => {} });
  await assert.rejects(transient.fetchBatch(mapping.regions.slice(0, 1)), /network/);
  assert.equal(transientCalls, 2);
});

test("request timeout aborts and retries only once", async () => {
  let calls = 0;
  const timeoutConfig = { ...config, REQUEST_TIMEOUT_MS: 1 };
  const client = createOpenMeteoClient({ config: timeoutConfig, sleep: async () => {},
    fetchImpl: async (_url, { signal }) => {
      calls++;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    } });
  await assert.rejects(client.fetchBatch(mapping.regions.slice(0, 1)), /timeout/i);
  assert.equal(calls, 2);
  assert.deepEqual(client.getRequestStats(), { httpRequests: 2, locationsRequested: 2 });
});

test("UTC timestamps remain unambiguous across New York daylight-saving changes", () => {
  const before = Date.parse("2026-11-01T01:30:00-04:00");
  const after = Date.parse("2026-11-01T01:30:00-05:00");
  assert.equal(after - before, 3_600_000);
  const first = normalizeLocation(response(before), mapping.regions[0], before, config);
  const second = normalizeLocation(response(after), mapping.regions[0], after, config);
  assert.equal(Date.parse(second.current.validAt) - Date.parse(first.current.validAt), 3_600_000);
});
