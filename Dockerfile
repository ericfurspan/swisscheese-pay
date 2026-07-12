# Build stage: full workspace install + compile both client and server.
# node-gyp build tools are here (not in the runtime stage) so better-sqlite3's
# native addon compiles against the same base image the runtime stage uses.
FROM node:20-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
# npm ci requires exact lockfile parity, but Vite/Rolldown's optional
# platform-binary deps only record the host platform's variant when the
# lockfile is generated (a known npm limitation with these multi-platform
# native packages) -- npm install tolerates the missing Linux variant here.
# Build-stage only; the runtime stage never touches this lockfile mutation.
# Verified 2026-07-12: `npm ci` fails here with EUSAGE, "Missing:
# @emnapi/core@1.11.2 from lock file" / "@emnapi/runtime@1.11.2 from lock
# file" -- exactly the platform-optional-dependency gap described above,
# not a stale comment. The docker-smoke CI job below is what catches any
# future drift instead.
RUN npm install
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Runtime stage: only compiled output + prod-relevant node_modules.
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 8082
ENTRYPOINT ["./docker-entrypoint.sh"]
