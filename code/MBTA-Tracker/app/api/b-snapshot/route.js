/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Expose shared Green B live data and scheduled departures with separate freshness and failure metadata.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import {
  getSharedBNetwork,
  getBPredictionsSnapshot,
  getBAlertsSnapshot,
  getBVehiclesSnapshot,
  getBSchedulesSnapshot,
} from "@/server/b-shared-data";

export async function GET() {
  try {
    const network = await getSharedBNetwork();
    const [predictions, alerts, vehicles, schedules] = await Promise.allSettled([
      getBPredictionsSnapshot(),
      getBAlertsSnapshot(),
      getBVehiclesSnapshot(),
      getBSchedulesSnapshot(),
    ]);
    const prediction = predictions.status === "fulfilled" ? predictions.value : null;
    const vehicle = vehicles.status === "fulfilled" ? vehicles.value : null;
    const alert = alerts.status === "fulfilled" ? alerts.value : null;
    const schedule = schedules.status === "fulfilled" ? schedules.value : null;
    return Response.json(
      {
        network,
        schedules: schedule?.data ?? null,
        schedulesCheckedAt: schedule?.fetchedAt ?? null,
        schedulesError: schedule ? null : schedules.reason.message,
        vehicles: vehicle?.data ?? null,
        vehiclesCheckedAt: vehicle?.fetchedAt ?? null,
        vehiclesError: vehicle ? null : vehicles.reason.message,
        predictions: prediction?.data ?? null,
        alerts: alert?.data ?? null,
        predictionsCheckedAt: prediction?.fetchedAt ?? null,
        alertsCheckedAt: alert?.fetchedAt ?? null,
        predictionsError: prediction ? null : predictions.reason.message,
        alertsError: alert ? null : alerts.reason.message,
        retryAt:
          Math.max(
            predictions.reason?.retryAt ?? 0,
            alerts.reason?.retryAt ?? 0,
            vehicles.reason?.retryAt ?? 0,
            schedules.reason?.retryAt ?? 0,
          ) || null,
        reused: Boolean(prediction?.reused && alert?.reused && vehicle?.reused && schedule?.reused),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: {
          message: error.message || "Unable to load B-branch stations.",
          retryAt: error.retryAt ?? null,
        },
      },
      { status: error.status ?? 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
