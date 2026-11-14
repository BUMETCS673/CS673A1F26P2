// AI-ASSISTED: OpenAI Codex — forecast card for the selected segment's departure.
'use client';

import { useEffect, useState } from 'react';
import styles from '../page.module.css';

const clock = value => new Date(value).toLocaleString('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function WeatherForecast({ leaveAt = null }) {
  const [state, setState] = useState({ busy: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let controller;
    async function refresh() {
      controller?.abort();
      controller = new AbortController();
      setState({ busy: true });
      try {
        const at = Math.max(Date.now(), leaveAt ?? 0);
        const response = await fetch(`/api/weather?time=${at}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Weather forecast is unavailable.');
        if (active) setState({ data });
      } catch (error) {
        if (active && error.name !== 'AbortError') setState({ error: 'Weather forecast is temporarily unavailable.' });
      }
    }
    refresh();
    const tick = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(tick, 300000);
    document.addEventListener('visibilitychange', tick);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [leaveAt, retry]);
  const forecast = state.data?.forecast;
  return (
    <div className={styles.weatherCard}>
      <div className={styles.sectionHeading}>
        <h3>Weather at departure</h3>
        <button type="button" className={styles.textButton} disabled={state.busy} onClick={() => setRetry(n => n + 1)}>Refresh ↻</button>
      </div>
      <p className={styles.small}>Boston area · {leaveAt ? `${clock(leaveAt)} ET (or now if passed)` : 'Leaving now'}</p>
      <div aria-live="polite">
        {state.busy ? <p className={styles.small}>Checking the hourly forecast…</p>
          : state.error ? <p className={styles.notice}>{state.error}</p>
          : !forecast ? <p className={styles.small}>An hourly forecast is not available for this departure time yet.</p>
          : <>
            <p><strong>{Number.isFinite(forecast.temperature) ? `${forecast.temperature}°${forecast.temperatureUnit}` : 'Temperature unavailable'}</strong> · {forecast.conditions || 'Conditions unavailable'}</p>
            <p className={styles.small}>Precipitation: {Number.isFinite(forecast.precipitation) ? `${forecast.precipitation}% chance` : 'unavailable'} · Wind: {[forecast.windDirection, forecast.windSpeed].filter(Boolean).join(' ') || 'unavailable'}</p>
            <p className={styles.small}>Forecast for {clock(forecast.startTime)} ET{state.data.issuedAt ? ` · Issued ${clock(state.data.issuedAt)} ET` : ''}</p>
          </>}
      </div>
      <p className={styles.small}><a href="https://forecast.weather.gov/MapClick.php?lat=42.3601&lon=-71.0589" target="_blank" rel="noreferrer">National Weather Service ↗</a> · Boston forecast; conditions elsewhere on your route may differ.</p>
    </div>
  );
}
