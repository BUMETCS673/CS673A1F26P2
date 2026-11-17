# MBTA Journey Planner — Cookies Feature

## Course Information

**Course:** CS673 — Software Engineering
**Project:** MBTA Journey Planner
**Iteration:** 2
**Feature:** Favorite Routes, Recent Searches, and Persistent Default Route

## Overview

The Cookies feature lets users save favorite routes, revisit recent searches, and choose a default route in the MBTA Journey Planner. Route preferences are stored locally in browser cookies and can be reused across page visits.

The implementation supports itineraries containing **2 to 5 stations**, including intermediate stops. Existing two-station saved routes remain supported.

## Features

### Favorite Routes

- Save up to **10** favorite routes, each containing 2–5 stations.
- Reuse saved routes, remove individual favorites, or clear all favorites after confirmation.
- Reject invalid routes, including blank station names and repeated stations within a route.
- Prevent duplicate favorites and show a message when the 10-route limit is reached.
- Keep favorite routes in a browser cookie with a **90-day** expiration period.
- Removing a favorite that is also the default route clears the default selection.

### Recent Searches

- Automatically record valid selected routes after a short delay (500 ms), avoiding partial edits.
- Keep up to **10** recent routes, with the newest first.
- Move a previously recorded route to the top instead of storing a duplicate.
- Reuse or delete individual recent routes, or clear the entire recent list after confirmation.
- Keep recent searches in a browser cookie with a **30-day** expiration period.

### Persistent Default Route

- Set **one saved favorite** as the default route; setting another replaces the previous default.
- Cancel the default manually or remove its corresponding favorite to clear it.
- Restore the complete saved itinerary, including intermediate stations, when the planner loads and the saved stations are valid.
- Use the planner's normal route-results behavior after restoration; cookie data does not cache live train predictions.
- Store the default route in a browser cookie with a **90-day** expiration period.
- After a valid default route is successfully restored, renew the **default-route and favorites cookies** for another 90 days. This renewal does not apply to recent-search history.

## Implementation

**Technologies:** Next.js, React, JavaScript, CSS Modules, and browser cookies.

**Main Files:**

- `lib/route-cookies.mjs` — Cookie reading/writing, route validation, favorites, recents, default-route management, and renewal.
- `app/components/RouteHistory.js` — Favorites/Recent Searches interface, default-route controls, and clear-confirmation dialogs.
- `app/page.js` — Planner integration, saved-route selection, default-route restoration, and renewal after successful restoration.
- `app/page.module.css` — Route-history and planner interface styles, including multi-line station names and default-route highlighting.

Saved route data contains the ordered station selections, **not departure times or cached train results**. Cookie storage is browser-local and is not synchronized across devices.

## Testing

The feature should be checked in the browser for:

- Adding, selecting, and deleting 2–5-station favorite routes.
- Rejecting invalid and duplicate favorites and enforcing the 10-route limit.
- Recording recent routes, moving repeated selections to the top, and enforcing the 10-route limit.
- Setting, changing, canceling, and restoring a default route after a page reload.
- Clearing favorites or recent searches through the confirmation dialog, including canceling the dialog without deleting data.
- Confirming that clearing favorites also clears any default route while leaving recent searches intact.
- Checking that saved routes persist across reloads while their cookies remain valid.

**Local validation commands:**

```bash
npm install
npx eslint app/components/RouteHistory.js app/page.js lib/route-cookies.mjs
npm run build
```

Run the project's existing automated tests using the commands documented in the main project README. A successful build and lint run should be confirmed on the final working branch before submission.

## AI Usage

ChatGPT was used to assist with code examples, troubleshooting, documentation, and testing suggestions. Generated suggestions were reviewed and adapted to the project requirements; validation results should be reported based on actual runs.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL displayed by Next.js (typically `http://localhost:3000`; another port may be used if 3000 is occupied).

## Notes

- Cookie expiration is not the same as guaranteed retention: browser settings, manual cookie deletion, or private browsing can remove saved data earlier.
- A default route must still exist in Favorites to be restored.
- Saved station selections are restored; current route results are obtained through the planner rather than stored in cookies.
- Weather, map, and train-results features remain separate from cookie persistence.
