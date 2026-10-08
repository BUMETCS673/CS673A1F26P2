const MBTA_API_BASE_URL = "https://api-v3.mbta.com";

/**
 * Routes currently supported by the map API wrapper.
 *
 * @type {string[]}
 */
const allLines = ["Green-B"];
// const allLines = ["Green-B", "Green-C", "Green-D", "Green-E"];

/**
 * Decode a Google encoded polyline string into latitude/longitude points.
 * MBTA v3 shape resources expose track geometry in this format.
 *
 * @param {string} encodedPolyline
 * @returns {{ latitude: number, longitude: number }[]}
 */
function decodePolyline(encodedPolyline) {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encodedPolyline.length) {
    const latitudeDelta = decodePolylineValue(encodedPolyline, index);
    index = latitudeDelta.nextIndex;
    latitude += latitudeDelta.value;

    const longitudeDelta = decodePolylineValue(encodedPolyline, index);
    index = longitudeDelta.nextIndex;
    longitude += longitudeDelta.value;

    points.push({
      latitude: latitude / 100000,
      longitude: longitude / 100000,
    });
  }

  return points;
}

/**
 * Decode one signed value from an encoded polyline.
 *
 * @param {string} encodedPolyline
 * @param {number} startIndex
 * @returns {{ value: number, nextIndex: number }}
 */
function decodePolylineValue(encodedPolyline, startIndex) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte;

  do {
    byte = encodedPolyline.charCodeAt(index) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
    index += 1;
  } while (byte >= 0x20 && index <= encodedPolyline.length);

  return {
    value: result & 1 ? ~(result >> 1) : result >> 1,
    nextIndex: index,
  };
}

/**
 * Fetch track shapes from MBTA v3 for the requested Green Line branches.
 * For now this is intentionally scoped to Green-B, per the current product need.
 *
 * @param {string[]} [lines=allLines] MBTA route IDs. Only "Green-B" is supported right now.
 * @returns {Promise<{ id: string, route: string, polyline: string, coordinates: { latitude: number, longitude: number }[] }[]>}
 */
async function getTracks(lines = allLines) {
  const requestedLines = Array.isArray(lines) && lines.length > 0 ? lines : allLines;
  const unsupportedLines = requestedLines.filter((line) => !allLines.includes(line));

  if (unsupportedLines.length > 0) {
    throw new Error(`Unsupported route(s): ${unsupportedLines.join(", ")}`);
  }

  const tracks = [];
  let nextUrl = buildShapesUrl(requestedLines);

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: buildMbtaHeaders(),
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`MBTA shapes request failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const shapes = Array.isArray(payload.data) ? payload.data : [];

    tracks.push(
      ...shapes.map((shape) => {
        const polyline = shape.attributes?.polyline ?? "";

        return {
          id: shape.id,
          route: requestedLines[0],
          polyline,
          coordinates: decodePolyline(polyline),
        };
      }),
    );

    nextUrl = payload.links?.next ? new URL(payload.links.next, MBTA_API_BASE_URL).toString() : null;
  }

  return tracks;
}

/**
 * Build the MBTA v3 /shapes URL. The endpoint requires filter[route].
 *
 * @param {string[]} lines
 * @returns {string}
 */
function buildShapesUrl(lines) {
  const url = new URL("/shapes", MBTA_API_BASE_URL);

  url.searchParams.set("filter[route]", lines.join(","));
  url.searchParams.set("fields[shape]", "polyline");
  url.searchParams.set("page[limit]", "100");

  return url.toString();
}

/**
 * Build request headers, using an API key when one is configured.
 *
 * @returns {Record<string, string>}
 */
function buildMbtaHeaders() {
  const headers = {
    Accept: "application/vnd.api+json",
  };

  if (process.env.MBTA_V3_API_KEY) {
    headers["x-api-key"] = process.env.MBTA_V3_API_KEY;
  }

  return headers;
}

export { allLines, decodePolyline, getTracks };
