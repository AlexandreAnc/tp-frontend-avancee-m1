# Build depuis la racine du monorepo : docker compose build web
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/agent/package.json apps/agent/
RUN pnpm install --frozen-lockfile --filter web... --ignore-scripts
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter web exec nuxt prepare && pnpm --filter web build

# Image utilisée par le service `migrate` (drizzle-kit est une dépendance de dev).
FROM build AS migrate
WORKDIR /repo/apps/web
CMD ["pnpm", "db:migrate"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /repo/apps/web/.output ./.output
# Point de montage du stockage : un volume nommé neuf hérite de ce propriétaire (sinon root, et l'upload échoue).
RUN mkdir -p /data/files && chown node:node /data/files
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
