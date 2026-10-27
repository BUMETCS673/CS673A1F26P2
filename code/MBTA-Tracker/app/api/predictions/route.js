/*
 * Description:
 * Defines the API route for retrieving live MBTA arrival and departure predictions.
 * It accepts supported query parameters, validates user input, and returns either
 * the upstream prediction data or a consistent JSON error response.
 *
 * GET():
 * Reads and validates the request parameters, calls the shared MBTA prediction
 * client, and sends the resulting data to the caller.
 *
 * readParams():
 * Collects supported query values and rejects unsupported parameters.
 *
 * validateDirectionId():
 * Ensures that the optional direction identifier is either zero or one.
 */
import { NextResponse } from "next/server";
import { MbtaApiError, getPredictions } from "@/server/mbta-api";

const ALLOWED_PARAMS = ["route", "stop", "trip", "direction_id", "include"];

export async function GET(request) {
  try {
    const params = readParams(request, ALLOWED_PARAMS);
    validateDirectionId(params.direction_id);

    const data = await getPredictions(params);
    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

function readParams(request, allowedParams) {
  const searchParams = new URL(request.url).searchParams;
  const params = {};

  for (const key of searchParams.keys()) {
    if (!allowedParams.includes(key)) {
      throw new MbtaApiError(`Unsupported query parameter: ${key}.`, 400);
    }
  }

  for (const key of allowedParams) {
    const values = searchParams.getAll(key).map((value) => value.trim()).filter(Boolean);

    if (values.length > 0) {
      params[key] = values.join(",");
    }
  }

  return params;
}

function validateDirectionId(directionId) {
  if (directionId !== undefined && !["0", "1"].includes(String(directionId))) {
    throw new MbtaApiError("direction_id must be 0 or 1.", 400);
  }
}

function jsonError(error) {
  const status = error instanceof MbtaApiError ? error.status : 500;
  const message = error instanceof MbtaApiError ? error.message : "Internal server error.";

  return NextResponse.json({ error: { message } }, { status });
}
