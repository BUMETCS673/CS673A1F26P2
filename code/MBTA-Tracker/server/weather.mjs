// AI-ASSISTED: OpenAI Codex — departure-time Boston forecast integration.
const POINT = '42.3601,-71.0589';
const TTL = 5 * 60 * 1000;

export function selectForecast(document, at) {
  if (!Array.isArray(document?.properties?.periods)) throw new Error('Invalid forecast response.');
  const period = document.properties.periods.find(p =>
    Date.parse(p.startTime) <= at && at < Date.parse(p.endTime));
  if (!period) return null;
  return {
    startTime: period.startTime, endTime: period.endTime,
    temperature: period.temperature, temperatureUnit: period.temperatureUnit,
    conditions: period.shortForecast,
    precipitation: period.probabilityOfPrecipitation?.value ?? null,
    windSpeed: period.windSpeed, windDirection: period.windDirection,
  };
}

export function createWeatherLoader(fetcher = fetch, now = Date.now) {
  let cached, pending;
  async function read(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.weather.gov') throw new Error('Invalid weather URL.');
    const response = await fetcher(url, {
      headers: { Accept: 'application/geo+json', 'User-Agent': 'CS673-MBTA-Journey-Planner (https://github.com/BUMETCS673/CS673A1F26P2)' },
      signal: AbortSignal.timeout(10000), cache: 'no-store',
    });
    if (!response.ok) throw new Error('Weather service unavailable.');
    return response.json();
  }
  return async function load(at) {
    if (!cached || now() - cached.checkedAt >= TTL) {
      pending ??= (async () => {
        const point = await read(`https://api.weather.gov/points/${POINT}`);
        const document = await read(point.properties.forecastHourly);
        selectForecast(document, at); // Validate before caching.
        cached = { document, checkedAt: now() };
      })().finally(() => { pending = null; });
      await pending;
    }
    return { location: 'Boston', checkedAt: cached.checkedAt,
      issuedAt: cached.document.properties.updateTime ?? null,
      forecast: selectForecast(cached.document, at) };
  };
}

export const loadWeather = createWeatherLoader();
