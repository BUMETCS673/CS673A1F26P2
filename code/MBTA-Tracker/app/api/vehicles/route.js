/*
 * Description:
 * Defines the API route for retrieving current MBTA vehicle information. It
 * limits requests to the supported route, direction, and relationship parameters,
 * then returns upstream data through a consistent JSON interface.
 *
 * GET():
 * Reads the request parameters, validates the direction, calls the shared MBTA
 * vehicle client, and converts failures into JSON error responses.
 *
 * readParams():
 * Collects supported values and rejects any unexpected query parameter.
 *
 * validateDirectionId():
 * Ensures that the optional direction identifier is either zero or one.
 */
import { NextResponse } from "next/server";
import { MbtaApiError, getVehicles } from "@/server/mbta-api";

const ALLOWED_PARAMS = ["route", "direction_id", "include"];

export async function GET(request) {
  try {
    const params = readParams(request, ALLOWED_PARAMS);
    validateDirectionId(params.direction_id);

    const data = await getVehicles(params);
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
