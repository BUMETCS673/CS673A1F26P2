/*
 * AI-ASSISTED
 * Tool: GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Expose live or planned-time journey data for any station pair with no-store caching and structured failure details.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import { transitSnapshot } from "@/server/transit-shared-data";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    return Response.json(await transitSnapshot(params.get("origin"), params.get("destination"), params.get("time")), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: { message: error.message, retryAt: error.retryAt ?? null } }, {
      status: error.status ?? 502, headers: { "Cache-Control": "no-store" },
    });
  }
}
