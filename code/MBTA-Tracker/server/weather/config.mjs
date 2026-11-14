/** Operational configuration. Durations are milliseconds unless named otherwise. */
export const WEATHER_CONFIG = Object.freeze({
  API_BASE_URL: "https://api.open-meteo.com/v1/forecast",
  REFRESH_INTERVAL_MS: 10 * 60_000,
  FORECAST_HORIZON_MINUTES: 120,
  FORECAST_STEP_MINUTES: 15,
  COVERAGE_BUFFER_MINUTES: 10,
  REQUEST_DURATION_BUFFER_MINUTES: 1,
  DISPLAY_TIMEZONE: "America/New_York",
  TEMPERATURE_UNIT: "celsius",
  PRECIPITATION_UNIT: "mm",
  CELL_SELECTION: "land",
  REQUEST_TIMEOUT_MS: 10_000,
  MAX_RETRIES: 1,
  RETRY_DELAY_MS: 500,
  MAX_RETRY_DELAY_MS: 60_000,
  RATE_LIMIT_COOLDOWN_MS: 60_000,
  MAX_RATE_LIMIT_COOLDOWN_MS: 5 * 60_000,
  MAX_CACHE_AGE_MS: 30 * 60_000,
  MAX_BATCH_SIZE: 10,
  MAX_CONCURRENT_REQUESTS: 2,
  CURRENT_VARIABLES: ["temperature_2m", "weather_code"],
  MINUTELY_VARIABLES: ["temperature_2m", "apparent_temperature", "precipitation", "weather_code"],
  HOURLY_VARIABLES: ["precipitation_probability"],
  REGION_MAPPING_URL: new URL("./data/regions.json", import.meta.url),
});

export function validateConfig(config) {
  const positive = ["REFRESH_INTERVAL_MS", "FORECAST_HORIZON_MINUTES", "FORECAST_STEP_MINUTES",
    "REQUEST_TIMEOUT_MS", "MAX_CACHE_AGE_MS", "MAX_BATCH_SIZE", "MAX_CONCURRENT_REQUESTS"];
  for (const key of positive) if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new Error(`Invalid weather config: ${key}`);
  for (const key of ["COVERAGE_BUFFER_MINUTES", "REQUEST_DURATION_BUFFER_MINUTES", "MAX_RETRIES",
    "RETRY_DELAY_MS", "MAX_RETRY_DELAY_MS", "RATE_LIMIT_COOLDOWN_MS", "MAX_RATE_LIMIT_COOLDOWN_MS"]) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) throw new Error(`Invalid weather config: ${key}`);
  }
  if (config.MAX_RETRIES > 3 || config.MAX_RETRY_DELAY_MS > 300_000 ||
      config.RATE_LIMIT_COOLDOWN_MS > config.MAX_RATE_LIMIT_COOLDOWN_MS ||
      config.MAX_RATE_LIMIT_COOLDOWN_MS > 900_000 ||
      config.MAX_BATCH_SIZE > 100 || config.MAX_CONCURRENT_REQUESTS > 10 ||
      config.FORECAST_HORIZON_MINUTES > 1440 || config.FORECAST_STEP_MINUTES !== 15 ||
      config.MAX_CACHE_AGE_MS < config.REFRESH_INTERVAL_MS) throw new Error("Weather config outside supported bounds");
  if (!["celsius", "fahrenheit"].includes(config.TEMPERATURE_UNIT) ||
      !["mm", "inch"].includes(config.PRECIPITATION_UNIT) ||
      !["land", "sea", "nearest"].includes(config.CELL_SELECTION)) throw new Error("Invalid weather units or cell selection");
  if (config.DISPLAY_TIMEZONE !== "America/New_York") throw new Error("Unsupported display timezone");
  const endpoint = new URL(config.API_BASE_URL);
  if (endpoint.protocol !== "https:") throw new Error("Weather endpoint must use HTTPS");
  for (const key of ["CURRENT_VARIABLES", "MINUTELY_VARIABLES", "HOURLY_VARIABLES"]) {
    if (!Array.isArray(config[key]) || !config[key].length || config[key].some(v => typeof v !== "string")) throw new Error(`Invalid ${key}`);
  }
  const supported = {
    CURRENT_VARIABLES: ["temperature_2m", "weather_code"],
    MINUTELY_VARIABLES: ["temperature_2m", "apparent_temperature", "precipitation", "weather_code"],
    HOURLY_VARIABLES: ["precipitation_probability"],
  };
  for (const [key, names] of Object.entries(supported)) {
    if (config[key].length !== names.length || names.some(name => !config[key].includes(name))) throw new Error(`Unsupported ${key}`);
  }
  return config;
}

/** Counts include the aligned current step, refresh delay, request duration and buffer. */
export function forecastPointCounts(config = WEATHER_CONFIG) {
  validateConfig(config);
  const minutes = config.FORECAST_HORIZON_MINUTES + config.REFRESH_INTERVAL_MS / 60_000 +
    config.COVERAGE_BUFFER_MINUTES + config.REQUEST_DURATION_BUFFER_MINUTES;
  return {
    minutely15: Math.ceil((minutes + config.FORECAST_STEP_MINUTES) / config.FORECAST_STEP_MINUTES) + 1,
    hourly: Math.ceil((minutes + 60) / 60) + 1,
  };
}

export function estimateUsage(regionCount, config = WEATHER_CONFIG) {
  const refreshesPerDay = 86_400_000 / config.REFRESH_INTERVAL_MS;
  const weightedCallsPerDay = regionCount * refreshesPerDay;
  return {
    assumptions: "One long-running instance; seven selected variable occurrences; automatic model; no extra development requests, redundant replicas, restarts or retries",
    httpRequestsPerRefresh: Math.ceil(regionCount / config.MAX_BATCH_SIZE),
    locationsPerRefresh: regionCount,
    estimatedWeightedCallsPerRefresh: regionCount,
    estimatedWeightedCallsPerDay: weightedCallsPerDay,
    estimatedWeightedCallsPer30Days: weightedCallsPerDay * 30,
    estimatedWeightedCallsPer31Days: weightedCallsPerDay * 31,
    conservativeWithAllRetriesPerDay: weightedCallsPerDay * (1 + config.MAX_RETRIES),
  };
}
