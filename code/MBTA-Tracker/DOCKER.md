# Frontend Docker deployment

This branch does not yet contain the Next.js application. Merge the app source into this folder before building; the Docker files alone cannot build an image.

From the repository root, run these Bash commands with Docker Desktop running in Linux-container mode:

```bash
cd code/MBTA-Tracker
docker build -t mbta-tracker-frontend .
docker run -d --name mbta-tracker -p 127.0.0.1:3000:3000 mbta-tracker-frontend
```

Open http://localhost:3000. This one container serves Next.js and any API routes included in the app. No separate backend or database container is required.

If the named container already exists, use `docker start mbta-tracker` to restart it. To use a newly built image, remove the old container with `docker rm -f mbta-tracker` and repeat the run command.

```bash
docker logs -f mbta-tracker
docker exec -it mbta-tracker sh
docker stop mbta-tracker
docker start mbta-tracker
```

The build installs locked dependencies with `npm ci`, runs `npm run build`, and starts the production server using `npm start`. It needs internet access for dependencies and Google fonts. Local node_modules, build output, and environment files are excluded from the image context. If needed, supply the MBTA_API_KEY environment variable at runtime by adding `-e MBTA_API_KEY` to the run command after exporting it in your shell.
