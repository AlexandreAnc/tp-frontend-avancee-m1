# Optionnel : sur Mac, préférer `pnpm --filter agent start` (Ollama natif, GPU Apple Silicon).
FROM node:24-alpine
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod --filter agent... --ignore-scripts
COPY packages/shared packages/shared
COPY apps/agent apps/agent
WORKDIR /repo/apps/agent
USER node
CMD ["pnpm", "start"]
