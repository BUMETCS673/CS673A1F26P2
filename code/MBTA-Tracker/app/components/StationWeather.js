// AI-ASSISTED: Codex — independent departure and arrival weather cards on the map.
'use client';
import { useEffect, useState } from 'react';
import styles from './StationWeather.module.css';

const time = value => new Date(value).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const dateTime = value => new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function WeatherIcon({ code }) {
  const rain = code >= 51 && code <= 67 || code >= 80 && code <= 82 || code >= 95;
  const snow = code >= 71 && code <= 77 || code === 85 || code === 86;
  return <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    {code <= 2 && <><circle cx="20" cy="18" r="8" fill="#fff1bd" stroke="#c48a1b" /><path d="M20 3v3m0 24v3M5 18h3m24 0h3M9 7l3 3m16 16 3 3M9 29l3-3M28 10l3-3" stroke="#c48a1b" /></>}
    {code > 0 && <path d="M12 32h24a7 7 0 0 0 0-14 11 11 0 0 0-21-1 8 8 0 0 0-3 15Z" fill="#eaf1f0" />}
    {rain && <path d="m17 37-2 5m11-5-2 5m11-5-2 5" stroke="#3986b9" />}
    {snow && <path d="M16 37v7m-3-3h6m10-4v7m-3-3h6" stroke="#3986b9" />}
  </svg>;
}

function Card({ station, kind, at, unavailable, scheduled }) {
  const [state, setState] = useState({ busy: true });
  useEffect(() => {
    if (!station || at == null) return;
    let active = true, timer, controller;
    async function load() {
      controller = new AbortController();
      let delay = 600000;
      try {
        const response = await fetch(`/api/weather?${new URLSearchParams({ station: station.id, time: String(at) })}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Weather unavailable');
        const data = await response.json();
        if (data.refreshing) delay = 10000;
        if (active) setState({ data });
      } catch (error) {
        if (active && error.name !== 'AbortError') setState({ error: true });
        delay = 30000;
      }
      if (active) timer = setTimeout(load, delay);
    }
    load();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, [station, at]);
  const result = state.data, forecast = result?.forecast;
  let message = !station ? `Choose a ${kind === 'Departure' ? 'starting' : 'destination'} station`
    : at == null ? unavailable || 'Waiting for an arrival estimate'
    : state.error ? 'Weather temporarily unavailable'
    : result?.status === 'unknown_station' ? 'Weather is not mapped for this station'
    : result?.status === 'outside_business_horizon' ? 'Forecast available within the next 2 hours'
    : result?.status === 'no_forecast_coverage' ? 'No forecast available for this time'
    : !forecast ? result?.refreshing || state.busy ? 'Loading station weather…' : 'Weather temporarily unavailable' : null;
  return <section className={styles.card} aria-label={`${kind} weather`}>
    <div className={styles.eyebrow}><span className={styles.dot} />{kind === 'Departure' ? 'Starting station' : 'Destination station'}</div>
    <h2>{station?.name ?? (kind === 'Departure' ? 'Your starting station' : 'Your destination')}</h2>
    <p className={styles.time}>{kind}{kind === 'Arrival' && at != null ? scheduled ? ' · scheduled' : ' · estimated' : ''}{at != null ? ` · ${dateTime(at)} ET` : ''}</p>
    <div aria-live="polite">
      {message ? <p className={styles.empty}>{message}</p> : <>
        <div className={styles.conditions}><div><strong>{forecast.temperature == null ? '—' : Math.round(forecast.temperature)}<small>{result.units.temperature}</small></strong><p>{forecast.condition.replaceAll('_', ' ')}</p></div><WeatherIcon code={forecast.weatherCode ?? 3} /></div>
        <div className={styles.metrics}><span>Feels like<strong>{forecast.apparentTemperature == null ? '—' : `${Math.round(forecast.apparentTemperature)}${result.units.temperature}`}</strong></span><span>Precipitation<strong>{forecast.precipitation == null ? '—' : `${forecast.precipitation} ${result.units.precipitation}`}</strong></span></div>
        <p className={styles.caption}>15-min precipitation ending {time(forecast.validAt)} ET</p>
        {result.hourlyPrecipitationProbability && <p className={styles.caption}>{result.hourlyPrecipitationProbability.probability ?? '—'}% precipitation chance · {time(result.hourlyPrecipitationProbability.intervalStart)}–{time(result.hourlyPrecipitationProbability.intervalEnd)} ET</p>}
        {result.status === 'stale' && <p className={styles.warning}>Saved forecast · update delayed</p>}
        <p className={styles.caption}>Forecast {time(forecast.validAt)} ET · Updated {time(result.fetchedAt)} ET</p>
      </>}
    </div>
    <a className={styles.credit} href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo · CC BY 4.0</a>
  </section>;
}

export default function StationWeather({ origin, destination, timing }) {
  // Minute granularity avoids refetching weather on each countdown update.
  const departure = timing?.departure == null ? null : Math.ceil(timing.departure / 60000) * 60000;
  const arrival = timing?.arrival == null ? null : Math.ceil(timing.arrival / 60000) * 60000;
  if (!origin && !destination) return null;
  return <div className={styles.cards}>
    {origin && <Card key={`from:${origin?.id}:${departure}`} station={origin} kind="Departure" at={departure} />}
    {destination && <Card key={`to:${destination?.id}:${arrival}`} station={destination} kind="Arrival" at={arrival} unavailable={timing?.reason} scheduled={timing?.scheduled} />}
  </div>;
}
