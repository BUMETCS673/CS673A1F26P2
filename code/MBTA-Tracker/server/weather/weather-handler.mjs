// AI-ASSISTED: Codex — expose the existing regional weather service to the map.
export function createWeatherHandler(service, now = Date.now) {
  return async function GET(request) {
    const params = new URL(request.url).searchParams;
    const station = params.get('station');
    const raw = params.get('time');
    const at = raw === null ? now() : Number(raw);
    const headers = { 'Cache-Control': 'no-store' };
    if (!station?.trim() || station.length > 100 || raw === '' || !Number.isSafeInteger(at) || Math.abs(at - now()) > 8 * 86400000)
      return Response.json({ error: 'Provide a station and valid forecast time.' }, { status: 400, headers });
    const current = service.getWeatherForStation(station);
    if (current.status === 'unknown_station') return Response.json({ ...current, forecast: null }, { headers });
    // Startup is shared and asynchronous; cold requests return a loading state.
    void service.startWeatherRefresh().catch(() => {});
    const result = service.getForecastForStation(station, new Date(Math.max(now() + 1000, at)));
    return Response.json({ ...result, refreshing: service.getWeatherStatus().refreshing }, { headers });
  };
}
