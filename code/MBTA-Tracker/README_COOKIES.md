# MBTA Journey Planner — Cookies Feature

## Course Information

**Course:** CS673 — Software Engineering
**Project:** MBTA Journey Planner
**Iteration:** 2
**Feature:** Favorite Routes, Recent Searches, and Persistent Default Route

## Overview

This feature improves the MBTA Journey Planner by allowing users to save favorite routes, access recent searches, and set a persistent default route using browser cookies. It reduces repetitive route selection and improves the user experience.

## Features

### Favorite Routes
- Save up to 10 favorite routes.
- View, reuse, and delete saved routes.
- Prevent duplicates and display a warning when the limit is reached.
- Store favorites for up to 90 days.

### Recent Searches
- Automatically save up to 10 recent searches.
- Display the most recent searches first.
- Prevent duplicates and remove the oldest entries when necessary.
- Delete individual records or clear all search history.
- Store recent searches for up to 30 days.

### Persistent Default Route
- Set one favorite route as the default.
- Automatically restore the starting and destination stations when the page loads.
- Change or cancel the default route.
- Automatically clear the default when its favorite route is deleted.
- Store the default route for up to 365 days.

## Implementation

**Technologies:** Next.js, JavaScript, CSS Modules, and browser cookies.

**Main Files:**
- `lib/route-cookies.mjs` — Cookie storage and route management.
- `app/page.js` — Feature integration and user interactions.
- `app/page.module.css` — Interface styling.

## Testing

The following functionality was manually tested:

- Saving, deleting, and restoring favorite routes.
- Managing recent searches and preventing duplicates.
- Enforcing the 10-route storage limits.
- Setting, switching, and clearing default routes.
- Preserving saved preferences after page refresh.

**Code Validation:**

Both commands completed successfully:

```bash
npm run lint
npm run build
```

## AI Usage

ChatGPT was used as a reference for code examples, troubleshooting, and testing suggestions during development. The suggestions were reviewed, adapted, and tested to ensure the functionality worked as expected.

## Run Locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Notes

- Route preferences are stored locally in browser cookies.
- Clearing browser cookies may remove saved preferences.
- The default route restores station selections without automatically performing a search.
