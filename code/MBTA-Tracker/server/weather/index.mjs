/*
 * AI Tool Assist
 * Tool: Codex and ChatGPT
 * Prompt Summary: Expose the shared weather service and its public station, forecast, and refresh operations.
 * AI Contribution:(~75%)
 *
 * Description:
 * Creates the process-local weather service and exports its public API.
 *
 * getWeatherForStation(): Reads cached weather for a station.
 * getForecastForStation(): Matches a station and arrival time to a forecast.
 * refreshWeatherCache(): Updates cached weather for all regions.
 */

import { createWeatherService } from "./service.mjs";

// Process-local singleton. Importing this module reads local mapping only.
const weather = createWeatherService();
export const { getWeatherForStation, getForecastForStation, getAllRegionWeather,
  refreshWeatherCache, startWeatherRefresh, stopWeatherRefresh, getWeatherStatus } = weather;
export { createWeatherService } from "./service.mjs";
