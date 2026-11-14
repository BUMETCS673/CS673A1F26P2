import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import {
  startWeatherRefresh,
  stopWeatherRefresh,
  refreshWeatherCache,
  getWeatherForStation,
  getForecastForStation,
  getAllRegionWeather,
  getWeatherStatus,
} from "../../server/weather/index.mjs";

export const runtime = "nodejs";
export const metadata = { title: "Weather Service Test" };

const sectionStyle = { border: "1px solid #888", borderRadius: 6, padding: 16 };
const preStyle = { overflowX: "auto", padding: 12, background: "#f3f3f3", color: "#171717", borderRadius: 4 };
const formStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 };

function queryValue(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

function readResult(read) {
  try {
    return read();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function Json({ data }) {
  return <pre style={preStyle}>{JSON.stringify(data, null, 2)}</pre>;
}

export default async function WeatherTestPage({ searchParams }) {
  await connection();
  if (process.env.NODE_ENV !== "development") notFound();

  const params = await searchParams;
  const currentStation = queryValue(params.currentStation, "place-wondl");
  const forecastStation = queryValue(params.forecastStation, "place-wondl");
  // This route renders after connection(), so its default is calculated per request.
  // eslint-disable-next-line react-hooks/purity
  const arrivalTime = queryValue(params.arrivalTime, new Date(Date.now() + 30 * 60_000).toISOString());

  // These reads only inspect the process-local cache; none starts a refresh.
  const status = readResult(getWeatherStatus);
  const current = readResult(() => getWeatherForStation(currentStation));
  const forecast = readResult(() => getForecastForStation(forecastStation, arrivalTime));
  const regions = readResult(getAllRegionWeather);

  let actionResult = null;
  if (typeof params.actionResult === "string") {
    try {
      actionResult = JSON.parse(params.actionResult);
    } catch {
      actionResult = { error: "Invalid action result in URL" };
    }
  }

  async function controlWeather(formData) {
    "use server";
    // Server Actions are POST endpoints even when their forms are hidden.
    if (process.env.NODE_ENV !== "development") notFound();

    const operation = formData.get("operation");
    if (!["start", "stop", "refresh"].includes(operation)) {
      throw new Error("Unknown weather test operation");
    }

    let result;
    try {
      if (operation === "start") result = await startWeatherRefresh();
      if (operation === "stop") {
        stopWeatherRefresh();
        result = getWeatherStatus();
      }
      if (operation === "refresh") result = await refreshWeatherCache();
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error) };
    }

    const query = new URLSearchParams({ operation, actionResult: JSON.stringify(result) });
    redirect(`/weather-test?${query}`);
  }

  return (
    <main style={{ width: "min(100%, 1100px)", margin: "0 auto", padding: 24, display: "grid", gap: 20 }}>
      <h1>Weather Service Test</h1>
      <p>Development only. This page reads the Weather Service cache in the current Node.js process.</p>

      <section style={sectionStyle}>
        <h2>Service Controls</h2>
        <p>Start and Stop affect the shared service instance in this Node.js process. Stop clears its timer; a refresh already in flight may still finish.</p>
        <form action={controlWeather} style={formStyle}>
          <button type="submit" name="operation" value="start">Start Weather Service</button>
          <button type="submit" name="operation" value="stop">Stop Weather Service</button>
          <button type="submit" name="operation" value="refresh">Refresh Now</button>
        </form>
        {actionResult && (
          <div style={{ marginTop: 16 }}>
            <h3>Last action: {queryValue(params.operation, "unknown")}</h3>
            <Json data={actionResult} />
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2>Service Status</h2>
        <Json data={status} />
      </section>

      <section style={sectionStyle}>
        <h2>Current Weather by Station</h2>
        <form method="get" action="/weather-test" style={formStyle}>
          <label htmlFor="current-station">Station ID</label>
          <input id="current-station" name="currentStation" type="text" defaultValue={currentStation} />
          <button type="submit">Look up weather</button>
        </form>
        <Json data={current} />
      </section>

      <section style={sectionStyle}>
        <h2>Forecast by Station and Arrival Time</h2>
        <p>Use an ISO 8601 time with a UTC offset, such as 2026-11-14T19:30:00-05:00. The default is 30 minutes from this render.</p>
        <form method="get" action="/weather-test" style={formStyle}>
          <label htmlFor="forecast-station">Station ID</label>
          <input id="forecast-station" name="forecastStation" type="text" defaultValue={forecastStation} />
          <label htmlFor="arrival-time">Arrival time</label>
          <input id="arrival-time" name="arrivalTime" type="text" size={30} defaultValue={arrivalTime} />
          <button type="submit">Look up forecast</button>
        </form>
        <Json data={forecast} />
      </section>

      <section style={sectionStyle}>
        <h2>All Weather Regions</h2>
        {Array.isArray(regions) ? (
          <>
            <p>{regions.length} configured regions. Open a region to inspect its complete cached response.</p>
            {regions.map((region) => (
              <details key={region.regionId} style={{ borderTop: "1px solid #888", padding: "10px 0" }}>
                <summary style={{ cursor: "pointer" }}>
                  {region.regionId} · {region.stationIds.length} stations · {region.status} · {region.weather?.current?.condition ?? "No cached weather"}
                  {region.weather?.current?.temperature != null && ` · ${region.weather.current.temperature} ${region.weather.units.temperature}`}
                </summary>
                <Json data={region} />
              </details>
            ))}
          </>
        ) : <Json data={regions} />}
      </section>
    </main>
  );
}
