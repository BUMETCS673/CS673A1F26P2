import { getBNetwork, MbtaApiError } from "@/server/mbta-api";

export async function GET() {
  try { return Response.json(await getBNetwork()); }
  catch (error) { return Response.json({ error: { message: error instanceof MbtaApiError ? error.message : "Unable to load B-branch stations." } }, { status: error.status ?? 502 }); }
}
