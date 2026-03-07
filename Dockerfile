# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/webhooks/package.json apps/webhooks/package.json

RUN npm ci


FROM deps AS build
WORKDIR /app
COPY . .

RUN npm -w apps/api run build \
  && npm -w apps/webhooks run build \
  && npm -w apps/web run build \
  && npm prune --omit=dev


FROM node:20-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app/apps/api

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations

EXPOSE 3000
CMD ["node", "dist/server.js"]


FROM node:20-bookworm-slim AS worker
ENV NODE_ENV=production
WORKDIR /app/apps/api

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations

CMD ["node", "dist/worker/cli.js"]


FROM node:20-bookworm-slim AS webhooks
ENV NODE_ENV=production
WORKDIR /app/apps/webhooks

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/webhooks/package.json ./package.json
COPY --from=build /app/apps/webhooks/dist ./dist

EXPOSE 3001
CMD ["node", "dist/server.js"]


FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
