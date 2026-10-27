FROM nginx:stable-alpine
# Bake configuration into the image; no host bind mount is required.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
