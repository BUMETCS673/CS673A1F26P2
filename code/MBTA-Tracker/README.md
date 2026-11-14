# MBTA Tracker
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Brief
This is a web app allow user to track the Massachusetts Bay Transportation Authority trains in great Boston area.
It provides a MBTA map, predictions and schedules of every stop of rails in real-time. The user can better arrange their time of commuting using this web app.
This app is built by Next.js with React.

## Setup

- **Node.js 22.x** — This is the version used by both stages of the project Dockerfile. Next.js requires Node.js 20.9.0 or newer.
- **npm with lockfile support** — Install the exact dependency versions from `package-lock.json` by running `npm ci`.
- **Next.js 16.3.8** — The application uses the App Router and Next.js server route handlers.
- **React 19.2.8 and React DOM 19.2.8** — These versions are pinned in `package.json`.
- **CSS tooling: PostCSS 8.5.23** — It is supplied by Next.js for the project's global CSS and CSS Modules; Tailwind CSS and Sass are not required.
- **ESLint 9 with eslint-config-next 16.3.8** — Required for running `npm run lint`.
- **MBTA API configuration** — Copy `.env.example` to `.env.local` and set `MBTA_API_KEY` to your MBTA V3 API key. The key is optional for basic access but recommended to reduce rate-limit errors.
- **Docker with Docker Compose v2 (optional)** — Required only for the containerized setup defined by `Dockerfile` and `docker-compose.yml`.

## Getting Started

The planner searches all stations in the saved rapid-transit map: Red (both
branches), Orange, Blue, Green B/C/D/E, Mattapan, and Silver Line SL1/SL2/SL3/SL4/SL5/SLW.
Type a station name in any stop field; exact and prefix matches appear first.
Use the arrow keys and Enter to select, or click a result or any map station.
The outlined, white route badges identify every line or branch serving a station.
Shared-track segments include departures from all eligible branches in one panel;
branch-specific destinations remain restricted to trains on the required branch.

Journeys prefer fewer transfers, then fewer stops, using directed MBTA canonical
patterns. A direct ride has one full-width arrivals panel; transfer journeys have
separate, independently scrollable panels for each boarding station. Later-leg
departures are upcoming times at that station, not guaranteed connections from
the first train. SL4 at South Station and SL5 at Boylston use explicitly labeled
street-level walking transfers; these are not in-station or guaranteed connections.
Predictions, schedules, observations, and stale data remain
distinctly labeled. When an active MBTA suspension, no-service, or shuttle alert
blocks a leg, that panel shows a "Suspended" badge and the alert text instead of
a generic "no departures" message; legs outside the suspended section are unaffected.
The map topology is saved locally; service changes and
disruptions must be checked against live alerts. Refresh the topology with
`node scripts/update-subway-network.mjs` when MBTA patterns change.

### Multi-stop itineraries and leave times

Add up to five stops (A–E). Each stop except the final one has a "Leave at"
time: an empty first time means now, and an empty later time means "after the
previous stop". Times more than 30 minutes in the past roll over to tomorrow
(shown as "+1"). When a time is committed (blur, Enter, or ×), stops are
re-sorted chronologically; an untimed stop moves together with the stop before
it, and the final stop always stays last. Results show one tab per segment
(A → B, B → C, …); only the selected tab loads MBTA data. Leave times within
30 minutes filter live predictions; later times use the MBTA timetable and
alerts active at that time, chaining transfer legs from the previous leg's
scheduled arrival. Countdown and departure times use the train's line color.

The homepage uses `/api/journey-snapshot?origin=...&destination=...[&time=epochMs]`
for the selected segment only. With `time` (now − 5 minutes to now + 8 days), it
returns timetable schedules and alerts for that time instead of live predictions.
Existing B-branch API endpoints and the B test page remain available.
Run pure-data tests in PowerShell with
`node --test (Get-ChildItem tests\*.test.mjs).FullName` and lint with `npm run lint`.

### Run in the console
If you want to run it on your local machine with console, follow the steps below.
1. First, run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```
![start-up-step1](public/start-up-step1.png)

2. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
![start-up-step2](public/start-up-step2.png)


3. Then you can try the MBTA Tracker by yourself. You can start editing the page by modifying `app/page.js` or other files. The page auto-updates as you edit the file.
![start-up-step3](public/start-up-step3.png)

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### Run in Docker

1. Start Docker Desktop, open a terminal in the project directory, and confirm that Docker is available with `docker version` and `docker compose version`.

2. Build the images and start the web application and Nginx proxy with `docker compose up --build --detach`.

3. Open `http://127.0.0.1:8080` in your browser. When finished, stop and remove the project containers with `docker compose down`.

## Learn More
To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

To learn more about the MBTA API, go to the link below:
- [MBTA API Official Site](https://www.mbta.com/developers/v3-api) - Look for more details.You can also register your account to apply for a secure API key from MBTA.
- [MBTA V3 API Documentation](https://api-v3.mbta.com/docs/swagger/index.html) - You can find more endpoints and illustrations here for you might want to add more fancy features by yourself.

## How to deploy it on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
