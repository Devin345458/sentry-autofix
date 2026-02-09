# Nuxt 3 + Vuetify 3 Migration

This project has been migrated from Express + inline SSR to Nuxt 3 + Vuetify 3.

## What Changed

### Architecture
- **Before**: Monolithic Express server with inline HTML templates in `src/server.js`
- **After**: Nuxt 3 with Nitro server, file-based routing, and Vue 3 components

### Directory Structure
```
app/                       # Vue frontend (Nuxt srcDir)
  pages/                   # File-based routes
  components/              # Vue components
  composables/             # Composable functions
  assets/styles/           # SCSS styles

server/                    # Nitro server
  plugins/                 # Startup plugins (DB init, recovery)
  utils/                   # Business logic (TypeScript)
  api/                     # API routes
  routes/                  # Custom routes (webhooks, health)
```

### Key Features
- ✅ **SSE Event Streaming**: Dashboard and per-issue log streaming
- ✅ **Vuetify 3 Dark Theme**: Custom Sentry-themed dark mode
- ✅ **TypeScript**: Full type safety in server utils
- ✅ **Hot Module Replacement**: Fast dev workflow with Vite
- ✅ **File-based Routing**: No more manual route registration
- ✅ **SSR + Hydration**: Faster initial page loads
- ✅ **Project CRUD**: Add/edit/delete projects via UI

### Environment Variables
See `.env.example` for the updated environment variables. Key changes:
- `SENTRY_CLIENT_SECRET` → `SENTRY_WEBHOOK_SECRET`
- `GH_TOKEN` → `GITHUB_TOKEN`
- Added `CLAUDE_CODE_PATH` and `CLAUDE_MODEL`

## Running the Project

### Development
```bash
npm run dev
```
Opens at http://localhost:3000

### Production
```bash
npm run build
npm run start
```

### Docker
```bash
docker-compose up --build
```

## Migration Notes

### SSE Implementation
The SSE event bus was adapted from storing Express response objects to storing callbacks:
- Dashboard: `/api/events` (wildcard subscription)
- Issue logs: `/api/issues/:issueId/logs` (per-issue subscription)

### Database & Startup Recovery
- `server/plugins/01.db.ts`: Initialize SQLite + seed projects from config.json
- `server/plugins/02.startup-recovery.ts`: Recover stuck `in_progress` issues on startup

### Webhook Verification
Uses H3's `readRawBody()` to read the raw body before JSON parsing for HMAC verification, cleaner than Express middleware side-effects.

### better-sqlite3
Marked as external in `nuxt.config.ts` to prevent Rollup from trying to bundle the native module.

## Verification Checklist

- [x] `npm run build` succeeds
- [x] Server starts with `node .output/server/index.mjs`
- [ ] Dashboard loads with Vuetify dark theme
- [ ] SSE updates work (status changes, logs stream)
- [ ] Project CRUD works (add/edit/delete)
- [ ] Webhook endpoint accepts valid requests
- [ ] Docker build and run succeed

## Rollback

If you need to roll back to the old Express version, the code is preserved in git history before this migration commit.
