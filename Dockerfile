FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm ci --fetch-retries=1 --fetch-timeout=30000; else npm ci --fetch-retries=1 --fetch-timeout=30000; fi
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATABASE_PATH=/app/data/radar.sqlite
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/.npmrc /app/tsconfig.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src/lib ./src/lib
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
