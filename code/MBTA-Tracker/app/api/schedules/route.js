import { NextResponse } from "next/server";
import { MbtaApiError, getSchedules } from "@/server/mbta-api";

const ALLOWED_PARAMS = [
  "route",
  "stop",
  "trip",
  "direction_id",
  "date",
  "min_time",
  "max_time",
  "stop_sequence",
  "include",
  "limit",
  "offset",
  "page_limit",
  "page_offset",
];

export async function GET(request) {
  try {
    const params = readParams(request, ALLOWED_PARAMS);
    validateDirectionId(params.direction_id);
    validateIntegerParam(params.stop_sequence, "stop_sequence");
    validateIntegerParam(params.limit, "limit");
    validateIntegerParam(params.offset, "offset", { min: 0 });
    validateIntegerParam(params.page_limit, "page_limit");
    validateIntegerParam(params.page_offset, "page_offset", { min: 0 });

    const data = await getSchedules(params);
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

function validateIntegerParam(value, name, options = {}) {
  if (value === undefined) {
    return;
  }

  const min = options.min ?? 1;
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue < min) {
    throw new MbtaApiError(`${name} must be an integer greater than or equal to ${min}.`, 400);
  }
}

function jsonError(error) {
  const status = error instanceof MbtaApiError ? error.status : 500;
  const message = error instanceof MbtaApiError ? error.message : "Internal server error.";

  return NextResponse.json({ error: { message } }, { status });
}
