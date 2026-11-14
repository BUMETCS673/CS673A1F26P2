// AI-ASSISTED: Codex — derive weather times only from usable journey data.
import { journeyTrains } from './b-trains.mjs';
import { journeyScheduledTrains, scheduledFallback } from './b-schedules.mjs';
import { journeyAlerts, suspensionAlerts } from './b-journey.mjs';

export function journeyWeatherTiming(journey, snapshot, leaveAt, planned, now) {
  const departure = Math.max(now, leaveAt ?? now);
  const result = { departure, arrival: null, scheduled: planned, reason: 'Arrival estimate unavailable' };
  const data = snapshot?.data;
  if (!data || snapshot.error) return result;
  if (journey.walks?.length) return { ...result, reason: 'Arrival time unavailable for walking transfers' };
  if (data.alertsError || !Number.isFinite(data.alertsCheckedAt) || now - data.alertsCheckedAt > 90000) return result;
  if (planned && (data.schedulesError || !Number.isFinite(data.schedulesCheckedAt) || now - data.schedulesCheckedAt > 300000)) return result;
  if (!planned && (data.predictionsError || !Number.isFinite(data.predictionsCheckedAt) || now - data.predictionsCheckedAt > 90000)) return result;
  let start = departure;
  for (const leg of journey.legs) {
    if (suspensionAlerts(journeyAlerts(data.alerts ?? { data: [] }, leg), leg, start).length) return result;
    const predictions = planned ? [] : journeyTrains(data.predictions ?? { data: [] }, leg, start);
    const trains = planned ? journeyScheduledTrains(data.schedules ?? { data: [] }, leg, start)
      : predictions.length ? predictions : scheduledFallback(data, leg, [], start);
    const arrival = Date.parse(trains[0]?.destinationArrival);
    if (!Number.isFinite(arrival)) return result;
    result.scheduled ||= planned || predictions.length === 0;
    start = arrival;
  }
  return { ...result, arrival: start, reason: null };
}
