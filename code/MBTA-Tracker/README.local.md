# MBTA Server API Integration

## Created and Modified Files

- `server/mbta-api.js`
  - Server-only MBTA V3 service layer.
  - Exports `getVehicles`, `getPredictions`, `getAlerts`, and `getSchedules`.
  - Handles MBTA URL construction, query encoding, headers, caching, JSON parsing, timeouts, and API errors.

- `app/api/vehicles/route.js`
  - Internal `GET /api/vehicles` endpoint.

- `app/api/predictions/route.js`
  - Internal `GET /api/predictions` endpoint.

- `app/api/alerts/route.js`
  - Internal `GET /api/alerts` endpoint.

- `app/api/schedules/route.js`
  - Internal `GET /api/schedules` endpoint.

## Architecture

React components should call the internal `/api/*` endpoints, not the external MBTA API directly.

The route handlers read simple query parameters such as `route`, `stop`, and `direction_id`. The server service layer translates those into MBTA V3 parameters such as `filter[route]`, `filter[stop]`, and `filter[direction_id]`.

The MBTA API key is read only on the server from `process.env.MBTA_API_KEY` and is sent to MBTA with the `x-api-key` header. It is never returned to the client.

Responses preserve MBTA's original JSON:API structure. Frontend-specific transformations, train progress calculations, countdown formatting, and simulated closures are intentionally not implemented here.

## Internal Endpoint Examples

Start the dev server:

```bash
npm run dev
```

Vehicles:

```text
http://localhost:3000/api/vehicles
http://localhost:3000/api/vehicles?route=Green-B
http://localhost:3000/api/vehicles?route=Green-B,Green-C&direction_id=0&include=trip,stop
```

Predictions:

```text
http://localhost:3000/api/predictions?stop=place-bucen
http://localhost:3000/api/predictions?stop=place-bucen&route=Green-B&direction_id=0
http://localhost:3000/api/predictions?trip=some-trip-id&include=stop,vehicle
```

Alerts:

```text
http://localhost:3000/api/alerts
http://localhost:3000/api/alerts?route=Green-D
http://localhost:3000/api/alerts?stop=place-bucen&datetime=NOW
```

Schedules:

```text
http://localhost:3000/api/schedules?route=Green-B
http://localhost:3000/api/schedules?stop=place-bucen&route=Green-B&direction_id=0
http://localhost:3000/api/schedules?trip=some-trip-id&include=stop,route
http://localhost:3000/api/schedules?route=Green-C&date=2026-10-08&min_time=08:00&max_time=10:00&limit=20
```

## Environment Variables

Optional for local development:

```text
MBTA_API_KEY=your-mbta-v3-api-key
```

If `MBTA_API_KEY` is missing, requests are still allowed for local development. MBTA tracks unauthenticated requests by IP address and applies stricter rate limits.

## Caching

Server-side fetch caching is configured in `server/mbta-api.js`:

- Vehicles: 10 seconds
- Predictions: 15 seconds
- Alerts: 60 seconds
- Schedules: 300 seconds

Different query strings generate different MBTA request URLs, so cached responses are separated by endpoint and parameters.

## Validation and Error Handling

- Explicit `route` filters are limited to `Green-B`, `Green-C`, `Green-D`, and `Green-E`.
- Predictions require at least one of `route`, `stop`, or `trip`.
- Schedules require at least one of `route`, `stop`, or `trip`, matching MBTA V3 requirements.
- `direction_id` must be `0` or `1`.
- Unsupported internal query parameters return `400`.
- MBTA failures, rate limits, network failures, timeouts, and invalid JSON responses return minimal JSON errors without stack traces or API keys.

## Limitations and Remaining Work

- No frontend components or UI logic are implemented.
- No train progress, station-to-station interpolation, or timestamp countdown logic is implemented.
- No simulated station closure feature is implemented.
- The service preserves MBTA JSON:API responses rather than creating frontend-specific data models.
- Live MBTA request testing depends on network access and rate limits.

Official MBTA API documentation:

```text
https://api-v3.mbta.com/docs/swagger
```
