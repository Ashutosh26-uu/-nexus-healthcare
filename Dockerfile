# Nexus Healthcare — one container: Express API + the built React app (installable PWA).
# Build:  docker build -t nexus-healthcare .
# Run:    docker run -p 8080:8080 --env-file .env.production -v nexus-data:/app/server/data nexus-healthcare

# ---- 1. build the web app ----
FROM node:24-alpine AS build
WORKDIR /app
COPY client/package.json client/package-lock.json client/
RUN npm ci --prefix client
COPY client client
RUN npm run build --prefix client

# ---- 2. install API production dependencies ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix server --omit=dev

# ---- 3. runtime ----
FROM node:24-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/server/node_modules server/node_modules
COPY server server
COPY --from=build /app/client/dist client/dist
# The API reads the language list and UI string catalog from the client source tree.
COPY --from=build /app/client/src/i18n/languages.json /app/client/src/i18n/catalog.json client/src/i18n/
RUN rm -f server/.env && mkdir -p server/data && chown -R node:node /app
USER node
EXPOSE 8080
# SQLite database + uploaded files live here — mount a volume so they survive redeploys.
VOLUME ["/app/server/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/index.js"]
