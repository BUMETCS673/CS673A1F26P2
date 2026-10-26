/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Combine Green B journey predictions and alerts while reporting their failures independently.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import { NextResponse } from "next/server";
import { MbtaApiError } from "@/server/mbta-api";
import {
  getSharedBNetwork,
  getBPredictionsSnapshot,
  getBAlertsSnapshot,
} from "@/server/b-shared-data";
import { findJourney, journeyAlerts } from "@/lib/b-journey.mjs";
import { journeyTrains } from "@/lib/b-trains.mjs";

// One request from the page, with independent prediction and alert failures.
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;

    if ([...params.keys()].some((key) => !["origin", "destination"].includes(key))) {
      throw new MbtaApiError("Only origin and destination are supported.", 400);
    }

    const origin = params.get("origin");
    const destination = params.get("destination");
    const network = await getSharedBNetwork();
    const journey = findJourney(network.patterns, origin, destination);

    if (!journey)
      throw new MbtaApiError("Choose two different B-branch stations.", 400);

    const [predictions, alerts] = await Promise.allSettled([
      getBPredictionsSnapshot(),
      getBAlertsSnapshot(),
    ]);

    const checkedAt = Date.now();

    return NextResponse.json(
      {
        journey,
        checkedAt,
        predictionsCheckedAt:
          predictions.status === "fulfilled" ? predictions.value.fetchedAt : null,
        alertsCheckedAt: alerts.status === "fulfilled" ? alerts.value.fetchedAt : null,
        retryAt:
          Math.max(predictions.reason?.retryAt ?? 0, alerts.reason?.retryAt ?? 0) ||
          null,
        trains:
          predictions.status === "fulfilled"
            ? journeyTrains(predictions.value.data, journey, checkedAt)
            : [],
        predictionsError:
          predictions.status === "rejected" ? publicMessage(predictions.reason) : null,
        alerts:
          alerts.status === "fulfilled"
            ? journeyAlerts(alerts.value.data, journey)
            : [],
        alertsError: alerts.status === "rejected" ? publicMessage(alerts.reason) : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: { message: publicMessage(error), retryAt: error.retryAt ?? null } },
      { status: error.status ?? 500 },
    );
  }
}

function publicMessage(error) {
  return error instanceof MbtaApiError || error.retryAt
    ? error.message
    : "Unable to load journey data.";
}
