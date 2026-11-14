import { createWeatherService } from "./service.mjs";

// Process-local singleton. Importing this module reads local mapping only.
const weather = createWeatherService();
export const { getWeatherForStation, getForecastForStation, getAllRegionWeather,
  refreshWeatherCache, startWeatherRefresh, stopWeatherRefresh, getWeatherStatus } = weather;
export { createWeatherService } from "./service.mjs";
