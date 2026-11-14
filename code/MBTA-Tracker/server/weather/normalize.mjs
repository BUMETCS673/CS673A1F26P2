const conditions = new Map([
  [0, "clear"], [1, "mostly_clear"], [2, "partly_cloudy"], [3, "overcast"],
  [45, "fog"], [48, "depositing_rime_fog"], [51, "light_drizzle"], [53, "drizzle"], [55, "dense_drizzle"],
  [56, "light_freezing_drizzle"], [57, "dense_freezing_drizzle"], [61, "light_rain"], [63, "rain"], [65, "heavy_rain"],
  [66, "light_freezing_rain"], [67, "heavy_freezing_rain"], [71, "light_snow"], [73, "snow"], [75, "heavy_snow"],
  [77, "snow_grains"], [80, "light_rain_showers"], [81, "rain_showers"], [82, "violent_rain_showers"],
  [85, "light_snow_showers"], [86, "heavy_snow_showers"], [95, "thunderstorm"],
  [96, "thunderstorm_light_hail"], [99, "thunderstorm_heavy_hail"],
]);

export function weatherCondition(code) { return conditions.get(code) ?? "unknown"; }

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${name}`);
  return value;
}
function time(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid Unix timestamp");
  return new Date(value * 1000).toISOString();
}
function numeric(value, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}
function series(group, names, step) {
  object(group, "weather series");
  if (!Array.isArray(group.time) || !group.time.length) throw new Error("Missing weather timestamps");
  for (const name of names) if (!Array.isArray(group[name]) || group[name].length !== group.time.length) throw new Error(`Invalid ${name} array length`);
  for (let index = 0; index < group.time.length; index++) {
    time(group.time[index]);
    if (index && group.time[index] - group.time[index - 1] !== step) throw new Error("Weather timestamps are not ordered at the expected resolution");
  }
}
function unit(actual, expected, field) {
  if (actual !== expected) throw new Error(`Unexpected ${field} unit: ${actual}`);
}

/** Normalize one Open-Meteo location response. All times are UTC ISO strings. */
export function normalizeLocation(raw, region, fetchedAtMs, config) {
  object(raw, "Open-Meteo location");
  const current = object(raw.current, "current weather");
  const minutely = raw.minutely_15;
  const hourly = raw.hourly;
  series(minutely, config.MINUTELY_VARIABLES, config.FORECAST_STEP_MINUTES * 60);
  series(hourly, config.HOURLY_VARIABLES, 3600);
  const expectedTemperature = config.TEMPERATURE_UNIT === "celsius" ? "°C" : "°F";
  const expectedPrecipitation = config.PRECIPITATION_UNIT;
  unit(raw.current_units?.temperature_2m, expectedTemperature, "current temperature");
  unit(raw.minutely_15_units?.temperature_2m, expectedTemperature, "forecast temperature");
  unit(raw.minutely_15_units?.apparent_temperature, expectedTemperature, "apparent temperature");
  unit(raw.minutely_15_units?.precipitation, expectedPrecipitation, "precipitation");
  unit(raw.hourly_units?.precipitation_probability, "%", "precipitation probability");
  for (const [units, fields] of [[raw.current_units, ["weather_code"]], [raw.minutely_15_units, ["weather_code"]]]) {
    for (const field of fields) unit(units?.[field], "wmo code", field);
  }
  const providerGridCoordinates = {
    latitude: numeric(raw.latitude, "grid latitude", { min: -90, max: 90 }),
    longitude: numeric(raw.longitude, "grid longitude", { min: -180, max: 180 }),
  };
  if (providerGridCoordinates.latitude === null || providerGridCoordinates.longitude === null) throw new Error("Missing provider grid coordinates");
  const forecast = minutely.time.map((stamp, index) => {
    const weatherCode = numeric(minutely.weather_code[index], "weather code", { min: 0, max: 99, integer: true });
    return {
      validAt: time(stamp),
      temperature: numeric(minutely.temperature_2m[index], "temperature"),
      apparentTemperature: numeric(minutely.apparent_temperature[index], "apparent temperature"),
      precipitation: numeric(minutely.precipitation[index], "precipitation", { min: 0 }),
      weatherCode,
      condition: weatherCondition(weatherCode),
    };
  });
  const hourlyPrecipitationProbability = hourly.time.map((stamp, index) => ({
    intervalStart: time(stamp - 3600), intervalEnd: time(stamp),
    probability: numeric(hourly.precipitation_probability[index], "precipitation probability", { min: 0, max: 100 }),
  }));
  const currentCode = numeric(current.weather_code, "current weather code", { min: 0, max: 99, integer: true });
  const fetchedAt = new Date(fetchedAtMs).toISOString();
  return {
    regionId: region.id, provider: "Open-Meteo",
    requestedCoordinates: { ...region.requestedCoordinates }, providerGridCoordinates,
    fetchedAt,
    current: { validAt: time(current.time), temperature: numeric(current.temperature_2m, "current temperature"),
      weatherCode: currentCode, condition: weatherCondition(currentCode) },
    forecastCoverage: { start: forecast[0].validAt, end: forecast.at(-1).validAt },
    forecast,
    hourlyPrecipitationProbability,
    units: { temperature: expectedTemperature, precipitation: expectedPrecipitation, precipitationProbability: "%" },
    attribution: { provider: "Open-Meteo", url: "https://open-meteo.com/", license: "CC BY 4.0", dataModified: true },
  };
}
