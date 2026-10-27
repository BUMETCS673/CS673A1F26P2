# Lab 2: Docker with MBTA Tracker

This guide is a command plan, not evidence of commands you have run. Execute each section yourself and capture your own terminal output. Configuration has been prepared; image builds and container operation still need your verification.

## What the two services do

Browser -> localhost:8080 -> Nginx proxy -> web:3000 -> external MBTA API.

`web` runs the existing Next.js production app. `proxy` forwards HTTP requests over Compose's private application network. This is a meaningful two-container application without adding an unused database. Next.js recommends a reverse proxy for self-hosting: https://nextjs.org/docs/app/guides/self-hosting

The web image uses public official `node:22-bookworm-slim`; the proxy uses public official `nginx:stable-alpine`. Local result tags are `mbta-tracker:lab2` and `mbta-proxy:lab2`. No private image or team invitation is required by this setup. Base tags can receive updates. Docker Hub access limits may require your own login, but no image publishing is needed.

The Dockerfile installs the existing lockfile dependencies inside its build stage, builds with webpack, and runs as the Node image's non-root user. It leaves application source and README untouched. Compose waits for the web HTML health check before starting the proxy. That check does not execute browser JavaScript or request MBTA telemetry. The proxy does not cache responses. Manual refresh behavior remains in the app.

Only the app directory is a build context. Its allowlist excludes unrelated folders, Git data, local environment files, credentials, host dependencies and build outputs. No host mounts, privileged mode or Docker socket access are configured. The app runs without a supplied API key for this exercise; public MBTA API limits still apply. Do not copy a key into these files or screenshots.

## 1. Open PowerShell and verify Docker

Use Docker Desktop's Linux-container engine. Run:

```powershell
Set-Location 'C:\Users\billt\OneDrive\Documents\GitHub\CS673A1F26P2\code\MBTA-Tracker'
$docker = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
& $docker version
& $docker compose version
& $docker compose -f docker-compose.yml config --quiet
```

The explicit executable path matches Bill's per-user installation and avoids a stale terminal PATH. On another teammate's PC, set `$docker = 'docker'` if Docker is on PATH. Keep using the same PowerShell session.

Screenshot 1: Client AND Server version, Compose version, and successful configuration check. `config --quiet` prints nothing on success; run `$LASTEXITCODE` immediately afterward to show 0. If Server is unavailable, wait for Docker Desktop to finish starting; do not proceed with build/run until it works.

## 2. Build and run one app container

```powershell
& $docker build --tag mbta-tracker:lab2 .
& $docker image ls mbta-tracker
& $docker run --detach --name mbta-lab2-single --init --publish 127.0.0.1:3287:3000 mbta-tracker:lab2
& $docker ps --filter name=mbta-lab2-single
```

Screenshot 2: successful build/tag and the running container. Open http://127.0.0.1:3287 and capture the app separately. The first build downloads images/dependencies and may take several minutes. The existing `next/font/google` setup also needs build-time internet access for fonts. A successful build is not yet assumed. The old local preview port3187 is not used.

## 3. Inspect, logs and shell access

```powershell
& $docker inspect --format '{{json .State}}' mbta-lab2-single
& $docker logs --tail 50 mbta-lab2-single
& $docker exec -it mbta-lab2-single sh
```

Inside the container shell, run:

```sh
pwd
id
node --version
ls
exit
```

Screenshot 3: inspection state, startup logs, and the shell commands before `exit`. `exec` starts an additional process inside the running container. The app image intentionally has no local environment file to display. Avoid dumping environment variables.

## 4. Stop, start, restart and remove

Run these in order, taking screenshots after each state check:

```powershell
& $docker stop mbta-lab2-single
& $docker ps -a --filter name=mbta-lab2-single
& $docker start mbta-lab2-single
& $docker ps --filter name=mbta-lab2-single
& $docker restart mbta-lab2-single
& $docker inspect --format '{{.State.Status}} {{.State.StartedAt}}' mbta-lab2-single
& $docker stop mbta-lab2-single
& $docker rm mbta-lab2-single
& $docker ps -a --filter name=mbta-lab2-single
```

Screenshot 4: stopped/Exited, started/Up, restarted timestamp, then removal and an empty filtered list. `stop` preserves the container; `start` resumes that container; `restart` stops then starts it; `rm` removes a stopped container. The image remains available. These commands target only the named lab container.

## 5. Build and run both services with Compose

```powershell
& $docker compose -f docker-compose.yml build
& $docker compose -f docker-compose.yml up --detach --no-build --pull never
& $docker compose -f docker-compose.yml ps
& $docker compose -f docker-compose.yml logs --tail 30 web proxy
& $docker compose -f docker-compose.yml exec proxy nginx -t
& $docker compose -f docker-compose.yml exec proxy wget -q -O /dev/null http://web:3000/
$LASTEXITCODE
```

Screenshot 5: both services running, logs, valid Nginx configuration and exit code0 from proxy-to-web access. Open http://127.0.0.1:8080 and capture the application through the proxy. Compose builds the local images first; `up --pull never` uses those built images. The web port is accessible within the Compose network, while only proxy port8080 is published to localhost.

## 6. Compose lifecycle and cleanup

```powershell
& $docker compose -f docker-compose.yml stop
& $docker compose -f docker-compose.yml ps --all
& $docker compose -f docker-compose.yml start
& $docker compose -f docker-compose.yml ps
& $docker compose -f docker-compose.yml restart
& $docker compose -f docker-compose.yml ps
& $docker compose -f docker-compose.yml down
& $docker compose -f docker-compose.yml ps --all
```

Screenshot 6: stopped, started, restarted and removed Compose services. `down` removes this Compose project's containers and network; built images remain. No volume or global cleanup commands are needed. After changing source, rebuild the images; `restart` alone does not incorporate code changes. If recreating only the web container later, also recreate/restart the proxy so its upstream address is refreshed.

## Evidence checklist and troubleshooting

The six screenshot checkpoints cover every supplied requirement: build, run, stop, start, restart, remove, shell access, inspect, logs and a multi-container Compose application. No separate rubric file was supplied or found; if the instructor specifies a particular database, screenshot layout or service type, compare that requirement before submission.

If a lab port is occupied, stop and inspect the error rather than stopping an unrelated app. Change only the localhost host-port part of the lab command/configuration if needed. If an image download, npm install or font fetch fails, retain the error for troubleshooting; do not disable TLS/security settings. An empty MBTA prediction feed or429 is separate from container health. Use the app's manual Refresh and respect its retry message.

Official references:
- https://docs.docker.com/reference/cli/docker/container/
- https://docs.docker.com/reference/cli/docker/compose/config/
- https://docs.docker.com/compose/how-tos/startup-order/
- https://hub.docker.com/_/node
- https://hub.docker.com/_/nginx
