# Weather service

This backend module retrieves Open-Meteo weather once per geographic region, normalizes the response, and keeps a process-local cache. It has no import-time network activity or timer. It does not add an HTTP route or change MBTA behavior.

## Files and region data

- `config.mjs`: operational settings, validation, forecast point counts, usage estimates.
- `regions.mjs`: loads and validates the local station-to-region mapping.
- `open-meteo-client.mjs`: batched Forecast API requests, timeout, retry, and shared rate-limit cooldown.
- `normalize.mjs`: response validation, WMO conditions, UTC timestamps, hourly probability intervals.
- `service.mjs`: cache, freshness, ETA lookup, refresh deduplication, timer lifecycle.
- `index.mjs`: one shared service instance for this Node.js process.
- `data/regions.json`: **34** finalized 2.5 km UTM Zone 19N regions, with the Logan Airport–Seaport split, **164** core stations, stable region IDs, representative coordinates, and member station IDs.

`data/regions.json` is derived from `analysis/weather-regions/weather-station-mapping.json` (generated 2026-11-11, including the 2.5 km candidate assignments) and the reviewed split in `analysis/weather-regions/special-split-comparison.json` (generated 2026-11-14). The source mapping's *recommended* assignment is the older **2 km / 48-region** version and is deliberately ignored. The reviewed split puts terminal stops `17091`, `17093`, `17094`, `27092` in `--logan-terminals` and drydock stops `30249`, `30250`, `30251`, `31257` in `--seaport-drydock`. No new coordinates or groups are invented. The 164 IDs are the source analysis's core rail and Silver Line stations; Mattapan-only stops are excluded. The analysis canonicalizes rail platforms to their MBTA parent station ID, while Silver Line curb stops remain distinct. Callers should use those canonical IDs, which are also used in `app/data/subway-network.json`; raw platform IDs absent from the local analysis cannot be resolved without a separate alias dataset.

To regenerate after the reviewed source files change, run from the project root:

```powershell
node server/weather/data/generate-mapping.mjs
```

The generator rejects a mismatched source timestamp or changed split configuration. The loader rejects the wrong grid, missing or duplicate assignments, empty regions, invalid representative coordinates, and a count other than 34. The 34-region assertion validates this finalized dataset; request loops and usage calculations use the loaded region count.

## Configuration and API request

`WEATHER_CONFIG` in `config.mjs` centralizes the URL, 10-minute refresh interval, 120-minute business horizon, 15-minute forecast step, 10-minute coverage buffer, 1-minute request-duration allowance, `America/New_York` metadata timezone, Celsius and mm units, land cell preference, 10-second timeout, one retry, retry delays, a 60-second minimum and five-minute maximum rate-limit cooldown, 30-minute maximum cache age, batch size 10, and concurrency 2. `forecastPointCounts()` derives `forecast_minutely_15=12` and `forecast_hours=5` for these defaults. Counts include the current aligned step, time until the next refresh, request duration, a buffer, and worst-case step alignment. Every accepted response is also checked against its **actual** timestamps: the 15-minute series must start no later than receipt time and both series must extend through receipt time + 120 + 10 + 10 minutes. This protects a 120-minute ETA just before the next normal refresh. A failed or delayed scheduled refresh can still exhaust coverage before the 30-minute cache-age limit; ETA reads report `no_forecast_coverage` then.

Each batch sends one request with comma-separated coordinates, `timeformat=unixtime`, automatic model selection, and exactly these selected variable occurrences:

| Dataset | Variables |
| --- | --- |
| `current` | `temperature_2m`, `weather_code` |
| `minutely_15` | `temperature_2m`, `apparent_temperature`, `precipitation`, `weather_code` |
| `hourly` | `precipitation_probability` |

The response array is matched to requested regions by index and count, as in the provider's multi-location response format. Provider model-grid coordinates are retained separately from the application's requested representative coordinates. The module never merges application regions based on model-grid coordinates.

## Public API

Import from `server/weather/index.mjs`:

```javascript
import {
  startWeatherRefresh, stopWeatherRefresh,
  getWeatherForStation, getForecastForStation,
  getAllRegionWeather, getWeatherStatus, refreshWeatherCache,
} from "./server/weather/index.mjs";

await startWeatherRefresh(); // Initial load, then one refresh every 10 minutes.
const origin = getWeatherForStation("place-wondl");
const destination = getForecastForStation("place-wondl", "2026-11-14T19:30:00-05:00");
const regions = getAllRegionWeather();
const status = getWeatherStatus();
// During process shutdown:
stopWeatherRefresh();
```

`getWeatherForStation(stationId)` returns `{stationId, regionId, status, reason, ageMs, weather}`. `weather` contains `current`, `forecast`, `hourlyPrecipitationProbability`, `forecastCoverage`, UTC ISO `fetchedAt` and `validAt` timestamps, units, coordinates, and attribution. `getForecastForStation(stationId, arrivalTime)` accepts an offset-bearing ISO string or `Date` and returns the nearest 15-minute record with `requestedTime`, `matchedForecastTime`, and `approximate`; it includes the matching hourly probability **interval**, when available. Probability at an hour label represents the **preceding hour** `(intervalStart, intervalEnd]`, not a 15-minute probability. Precipitation amount at a 15-minute label represents the preceding 15 minutes. No categorical interpolation or extrapolation is performed.

`getAllRegionWeather()` returns one entry per region, including one forecast series per region and its member IDs. `refreshWeatherCache()` returns one shared in-flight Promise and a summary of successful and failed regions. `startWeatherRefresh()` starts one timer and triggers initial loading; subsequent calls do not add timers or duplicate a completed startup refresh. `stopWeatherRefresh()` clears the timer. An in-flight request may finish after stop, but it cannot schedule another refresh. `getWeatherStatus()` reports configured and available regions, refresh times, failed regions, process-local batch operations and location attempts, actual HTTP attempts including retries for the default client, and estimated usage. With an injected client that does not report request statistics, the actual HTTP attempt count is `null`.

Read methods never make network requests. Unknown IDs return `unknown_station`; an empty or expired entry returns `unavailable` with a reason. A failed refresh preserves previous data and reports `stale` until success; an entry older than the 10-minute refresh interval is also `stale` (`refresh_overdue`). Data older than 30 minutes is unavailable. ETAs outside the 120-minute business horizon or actual timestamp coverage have explicit statuses. Invalid time arguments throw `TypeError`. Return values are copied so callers cannot mutate the cache. Missing individual numeric values stay `null`; structural corruption rejects that region and preserves its prior entry.

## Usage and deployment limits

The default mapping and 10-minute cadence imply 34 estimated weighted location calls per refresh, 4,896/day, 146,880/30 days, and 151,776/31 days. With batch size 10, a normal refresh uses 4 HTTP requests for 34 locations. If every batch needed its single retry, the conservative estimate is 9,792 weighted location calls/day; actual provider billing may vary. Assumptions: one long-running instance, seven selected variable occurrences, automatic model, no extra development requests, redundant replicas, unexpected restarts, or further retries. These are estimates, not provider billing counters. Process-local counters reset on restart and do not enforce a rolling monthly limit.

**This implementation supports one long-running Node.js process.** Its memory cache is not shared across Node processes, Docker containers, replicas, or serverless instances. A future multi-instance deployment needs a shared cache such as Redis or a database. Starting a separate scheduled script cannot populate another Next.js process's memory. A future Node-backed Next.js API Route can import `index.mjs`, initialize the service in the intended long-running process, and serialize the structured return values; this task intentionally provides no route.

Open-Meteo's free API is for non-commercial use and has published 600/minute, 5,000/hour, 10,000/day, and 300,000/month limits, with no uptime guarantee. Its weather data requires attribution under CC BY 4.0. The normalized result includes provider, URL, licence, and a modification indicator so a future UI can display appropriate credit. Review commercial licensing before commercial deployment. [Forecast API documentation](https://open-meteo.com/en/docs) and [pricing and attribution](https://open-meteo.com/en/pricing) were checked for this implementation.

## Verification

From the project root:

```powershell
node --test server/weather/__tests__/weather.test.mjs
npx eslint server/weather --no-warn-ignored
```

The optional, explicitly invoked live smoke test makes one request for two regions and exits:

```powershell
node server/weather/smoke.mjs
```

It is never run by the unit suite and never starts scheduled refreshes.
