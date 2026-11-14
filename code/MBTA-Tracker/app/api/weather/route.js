// AI-ASSISTED: Codex — use feature/weather's Open-Meteo station mapping and cache.
import * as weather from '@/server/weather/index.mjs';
import { createWeatherHandler } from '@/server/weather/weather-handler.mjs';
export const runtime = 'nodejs';
export const GET = createWeatherHandler(weather);
