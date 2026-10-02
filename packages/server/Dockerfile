# The game server image. Build from the repository root:
#   docker build -f packages/server/Dockerfile --build-arg BUILD_SHA=$(git rev-parse HEAD) -t blockyrts-server .
# Settings are environment variables; deploy/README.md lists them.

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
# Only the server and the workspace packages it uses.
RUN pnpm install --frozen-lockfile --filter "@blockyrts/server..." \
 && pnpm --filter @blockyrts/server build \
 && pnpm --filter @blockyrts/server deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/packages/server/dist ./dist
ARG BUILD_SHA=dev
ENV BUILD_SHA=$BUILD_SHA
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Database migrations run on start.
CMD ["node", "--enable-source-maps", "dist/main.js"]
