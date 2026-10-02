# UI image: Vite build served by nginx, which also proxies /api to the API.
#   docker build -f web/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace web --include=dev --ignore-scripts
COPY web web
RUN npm -w web run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/web/dist /usr/share/nginx/html
# Rendered into the config by the nginx image's envsubst step at start.
ENV API_UPSTREAM=api:4000
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/healthz || exit 1
