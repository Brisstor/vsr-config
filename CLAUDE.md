# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

A standalone Node.js (ES Modules) HTTP service that stores and serves **hierarchical bot configuration** from a single JSON file (`data/bots.json`). Runs on port **3200** by default.

Part of a larger system for managing visa appointment slot booking:
- **`distributor`** (port 7099, `/Users/tor/Projects/distributor`) — broker between bots and shared resources. Bots connect to it via SSE for coordination.
- **`vsr-config`** (port 3200, this repo) — config service that bots and distributor query to get their merged configuration.

## Running

```bash
node index.js          # Start the server
node --watch index.js  # Dev mode with auto-restart
```

No build step. No test suite yet.

## Architecture

```
index.js
└── src/
    ├── store/configStore.js   # In-memory store + bots.json persistence
    └── api/routes.js          # All HTTP routes (registered via registerRoutes)
data/
└── bots.json                  # Config state file (auto-created on first write)
```

The module split (`src/store/` and `src/api/`) is intentional — designed so these can be extracted into two separate npm packages in the future.

### Config Hierarchy

Four levels merged in order (low → high priority):

```
defaults → node → consulate → bot
```

Each level does a **shallow merge** (spread). Lower levels override higher ones without replacing sibling keys.

### State Persistence

`configStore.js` holds an in-memory `store` object. Every mutating operation (`patchDefaults`, `patchNode`, etc.) immediately writes to `data/bots.json`. On startup, `loadConfig()` reads the file. If the file doesn't exist, starts with an empty config.

## Key API Endpoints

```
GET  /health                                    # { status: 'ok' }
GET  /api/v1/bot-config/:botId                  # Resolved merged config for a bot
     ?nodeId=X&consulate=Y                      # Optional merge context
GET  /api/v1/config/raw                         # Full bots.json contents

PATCH /api/v1/config/defaults                   # Shallow-merge into defaults
PATCH /api/v1/config/nodes/:nodeId              # Shallow-merge into a node
PATCH /api/v1/config/consulates/:id             # Shallow-merge into a consulate
PATCH /api/v1/config/bots/:botId                # Shallow-merge into a bot

DELETE /api/v1/config/nodes/:nodeId             # Remove a node config
DELETE /api/v1/config/consulates/:id            # Remove a consulate config
DELETE /api/v1/config/bots/:botId               # Remove a bot config
```

### Example: resolve config for a bot

```bash
curl 'http://localhost:3200/api/v1/bot-config/m416-cy_hu-1?nodeId=m416&consulate=cy_hu'
```

Response:
```json
{
  "config": { "retryDelay": 5000, "proxy": "residential-eu", "appointmentDate": "2026-05-20" },
  "sources": {
    "defaults":  { "retryDelay": 5000 },
    "node":      { "proxy": "residential-eu" },
    "consulate": { "appointmentDate": "2026-05-15" },
    "bot":       { "appointmentDate": "2026-05-20" }
  }
}
```

## Data Format (`data/bots.json`)

```json
{
  "defaults": { "retryDelay": 5000 },
  "nodes": {
    "m416": { "proxy": "residential-eu" }
  },
  "consulates": {
    "cy_hu": { "appointmentDate": "2026-05-15" }
  },
  "bots": {
    "m416-cy_hu-1": { "appointmentDate": "2026-05-20" }
  }
}
```

## Notes

- No authentication. If exposed beyond localhost, put behind a reverse proxy with auth.
- CORS is permissive (`origin: true`) — tighten in production.
- `data/bots.json` should be excluded from git (it's runtime state). Add to `.gitignore`.
- Not yet deployed. Deployment setup still pending.
