FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ecosystem/web build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV ECOSYSTEM_DB=/data/ecosystem.sqlite
RUN corepack enable && mkdir -p /data
COPY --from=build /app /app
EXPOSE 3001
VOLUME ["/data"]
CMD ["pnpm", "--filter", "@ecosystem/server", "start"]
