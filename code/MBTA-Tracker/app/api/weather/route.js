// AI-ASSISTED: OpenAI Codex — departure-time weather endpoint.
import { loadWeather } from '@/server/weather.mjs';

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('time');
  const now = Date.now();
  const at = raw == null ? now : Number(raw);
  const headers = { 'Cache-Control': 'no-store' };
  if (raw === '' || !Number.isSafeInteger(at) || at < now - 3600000 || at > now + 8 * 86400000)
    return Response.json({ error: 'Choose a departure time within the next eight days.' }, { status: 400, headers });
  try {
    return Response.json(await loadWeather(Math.max(now, at)), { headers });
  } catch {
    return Response.json({ error: 'Weather forecast is temporarily unavailable.' }, { status: 502, headers });
  }
}
