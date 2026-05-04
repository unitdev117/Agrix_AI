AgrixCheck - Telegram + Web Socket Platform
===========================================

Overview
--------
This service now runs:
- Existing Telegram bot flow (unchanged behavior)
- Express health endpoints only (`GET /` and `GET /ready`)
- Socket.IO chat/onboarding/handoff flows under:
  - `/widget` namespace (end users)
  - `/agent` namespace (agents/admin)

All web chat logic is socket-event based (no HTTP chat endpoints).

Tech Notes
----------
- Two MongoDB logical databases are used:
  - `agrix_telegram` (existing default mongoose connection via `MONGO_URI`)
  - `agrix_web` (new dedicated mongoose connection via `MONGO_WEB_URI` or `MONGO_URI` + `MONGO_WEB_DB_NAME`)
- Shared AI service (`services/aiService.js`) is reused by:
  - Telegram controller
  - Web socket handlers
- AI service leverages Gemini 3.1 Flash Lite Preview with a Nested Multi-Agent prompt architecture (Architect/Engine/Concierge).
- Logic Segregation: AI prompts are built via `utils/promptBuilder.js` to ensure layman-friendly responses for farmers.
- AI service includes timeout, retry, fallback response, and latency/error logs.

Environment Variables
---------------------
Required for Telegram:
- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `MONGO_URI`

Web/socket variables:
- `PORT` (default `8000`)
- `MONGO_WEB_URI` (optional; falls back to `MONGO_URI`)
- `MONGO_WEB_DB_NAME` (default `agrix_web`)
- `SOCKET_CORS_ALLOWLIST` (comma-separated origins)
- `WIDGET_SITE_KEY` (widget namespace auth)
- `AGENT_JWT_SECRET` (agent JWT verification; if missing, local-dev fallback is enabled)
- `SOCKET_RATE_LIMIT_WINDOW_MS` (default `60000`)
- `SOCKET_RATE_LIMIT_MAX` (default `60`)
- `AI_TIMEOUT_MS` (default `12000`)
- `AI_RETRIES` (default `1`)
- `AI_FALLBACK_RESPONSE` (optional)
- `HANDOFF_PHONE` (default placeholder)
- `HANDOFF_WHATSAPP` (default placeholder)

Run
---
1. Install deps (if needed): `npm install`
2. Start API + widget UI together: `npm start`
3. Open:
   - Widget POC: `http://localhost:5500/index.html`
   - Agent dashboard: `http://localhost:5500/agent.html`
4. Optional (run only one side):
   - API only: `npm run serve:api`
   - UI only: `npm run serve:ui`

Socket Contract (Week 1)
------------------------
Widget -> server:
- `session:start`
- `onboarding:answer`
- `route:choose`
- `chat:user_message`
- `session:close`

Agent -> server:
- `agent:online`
- `handoff:accept`
- `chat:agent_message`
- `handoff:resolve`

Server -> widget/agent:
- `session:state`
- `chat:message`
- `handoff:status`
- `queue:update`
- `error:event`

Idempotency
-----------
- Every inbound client event requires `messageId`.
- Ack callbacks return `{ ok: true/false }`.
- Duplicate `(session_id, source, message_id)` events are acknowledged as duplicates and not reprocessed.

Session State Machine
---------------------
Allowed transitions only:
- `new -> onboarding (Name -> Phone -> Language) -> route_choice -> ai_chat | human_handoff -> closed`

Invalid transitions are rejected with standardized `error:event` containing:
- `code`
- `message`
- `currentState`
- `validNextStates`

Web Collections (`agrix_web`)
-----------------------------
- `web_users`
- `web_sessions`
- `web_messages`
- `web_events`
- `human_handoffs`

Indexes include (where applicable):
- `session_id`
- `timestamp`
- `active`
- `last_seen_at`

Production Hardening Scaffolding
--------------------------------
Implemented scaffolding:
- Namespace auth:
  - Widget: site key
  - Agent: JWT + role (`agent`/`admin`)
- CORS allowlist for socket origins
- Socket rate limiting (IP/session/event keyed)
- Payload validation per event
- Structured logging and centralized socket error emission
- Reconnect/session resume via `session:start` + persisted `sessionId`
- Readiness checks (`GET /ready`)
- Monitoring counters:
  - active widget sockets
  - active agent sockets
  - queue length
  - AI latency / AI error rate
  - socket error count

Deployment Guidance
-------------------
1. Deploy to staging first.
2. Validate:
   - onboarding flow
   - AI route chat
   - human handoff queue/accept/resolve
   - reconnect with persisted `sessionId`
   - metrics and readiness
3. Promote same artifact/config pattern to production.

Load Balancer Note (Socket.IO)
------------------------------
For horizontally scaled deployment, enable sticky sessions at the load balancer so long-lived Socket.IO connections remain pinned to the same backend instance.
