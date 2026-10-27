/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Reuse shared Green B topology and expose retry timing when station requests fail.
 * AI Contribution: (~90%)
 * Scope: AI-assisted shared-topology and retry metadata changes only; excludes the existing teammate route.
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import { MbtaApiError } from "@/server/mbta-api";
import { getSharedBNetwork } from "@/server/b-shared-data";

export async function GET() {
  try { return Response.json(await getSharedBNetwork()); }
  catch (error) { return Response.json({ error: { message: error instanceof MbtaApiError || error.retryAt ? error.message : "Unable to load B-branch stations.", retryAt: error.retryAt ?? null } }, { status: error.status ?? 502 }); }
}
