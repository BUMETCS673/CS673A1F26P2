import test from 'node:test';
import assert from 'node:assert/strict';
import { selectForecast, createWeatherLoader } from '../server/weather.mjs';

const start = Date.parse('2026-11-14T17:00:00Z');
const document = { properties: { periods: [0, 1].map(i => ({
  startTime: new Date(start + i * 3600000).toISOString(),
  endTime: new Date(start + (i + 1) * 3600000).toISOString(),
  temperature: 40 + i, temperatureUnit: 'F', probabilityOfPrecipitation: { value: null },
})) } };
test('forecast uses containing hour, exact boundaries, and missing coverage', () => {
  assert.equal(selectForecast(document, start).temperature, 40);
  assert.equal(selectForecast(document, start + 3600000).temperature, 41);
  assert.equal(selectForecast(document, start - 1), null);
  assert.equal(selectForecast(document, start + 7200000), null);
  assert.equal(selectForecast(document, start).precipitation, null);
  assert.throws(() => selectForecast({}, start));
});
test('requests coalesce and cached forecast supports different departure hours', async () => {
  let calls = 0, now = start;
  const loader = createWeatherLoader(async url => {
    calls++;
    return { ok: true, json: async () => url.includes('/points/')
      ? { properties: { forecastHourly: 'https://api.weather.gov/gridpoints/BOX/1,1/forecast/hourly' } } : document };
  }, () => now);
  const results = await Promise.all([loader(start), loader(start + 3600000)]);
  assert.equal(calls, 2);
  assert.deepEqual(results.map(r => r.forecast.temperature), [40, 41]);
  now += 300000;
  await loader(start);
  assert.equal(calls, 4);
});
test('weather failures surface and a later request can recover', async () => {
  let fails = true;
  const loader = createWeatherLoader(async url => {
    if (fails) return { ok: false };
    return { ok: true, json: async () => url.includes('/points/')
      ? { properties: { forecastHourly: 'https://api.weather.gov/forecast' } } : document };
  });
  await assert.rejects(loader(start));
  fails = false;
  assert.equal((await loader(start)).forecast.temperature, 40);
});
