# API image. Build from the repo root: the npm workspace lockfile lives there.
#   docker build -f server/Dockerfile .
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# npm validates the whole workspace against the lockfile, so both manifests come along.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --omit=dev --ignore-scripts && npm cache clean --force

COPY server/src server/src
COPY server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data && chown node:node /data

USER node
WORKDIR /app/server
ENV PORT=4000 DB_PATH=/data/data.db
EXPOSE 4000
VOLUME ["/data"]

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--no-warnings", "src/index.js"]
