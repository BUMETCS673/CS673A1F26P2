import { MbtaApiError } from "@/server/mbta-api";
import { getSharedBNetwork } from "@/server/b-shared-data";

export async function GET() {
  try { return Response.json(await getSharedBNetwork()); }
  catch (error) { return Response.json({ error: { message: error instanceof MbtaApiError || error.retryAt ? error.message : "Unable to load B-branch stations.", retryAt: error.retryAt ?? null } }, { status: error.status ?? 502 }); }
}
