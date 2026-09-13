# Ecosim Lab

A shared artificial-life sandbox: renewable plants feed evolving herbivores, and predators hunt the herbivores. The Node server owns the deterministic world; the browser is a Canvas observer and controller.

## Status and boundaries

A local shared-world prototype. Determinism concerns the same initial state and ordered commands, not wall-clock network timing. Snapshots retain the random-generator state as well as organisms and plants. The rules are an artificial-life model, not a validated ecological model.

Connected clients can control the shared world; the server has no user authentication or per-user authorization. Treat it as a trusted sandbox when hosting it.

## Run locally

Requires Node.js 22.13 or newer (the server uses `node:sqlite`) and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API and WebSocket endpoint run on port `3001`; Vite proxies `/ws` and `/health` in development. The simulation persists a versioned SQLite snapshot in `data/ecosystem.sqlite`.

Set `VITE_WS_URL` when deploying the browser separately from the server; otherwise it uses the current origin's `/ws` endpoint. `.env.example` lists configuration names. The server reads `process.env` and does not load a root `.env` file automatically; export server overrides in the shell, for example `export ECOSYSTEM_DB="$PWD/data/ecosystem.sqlite"`.

## Commands

- `pnpm build` builds the browser.
- `pnpm start` starts the authoritative server.
- `pnpm test` runs deterministic engine, server, and web tests.
- `docker build -t ecosimlab . && docker run -p 3001:3001 -v ecosim-data:/data ecosimlab` runs a persistent production container.

## Workspace

- `@ecosystem/protocol`: versioned JSON messages and browser-safe views.
- `@ecosystem/simulation`: deterministic, framework-free ecosystem engine.
- `@ecosystem/server`: Fastify/WebSocket authoritative world and SQLite snapshots.
- `@ecosystem/web`: React and Canvas observer interface.
