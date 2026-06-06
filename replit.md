# Jarvis AI

An AI assistant app with real-time chat, voice calls, live voice sessions, and email OTP authentication — powered by Groq and ElevenLabs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/jarvis run dev` — run the frontend (Vite dev server)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Environment Variables (Required for Deployment)

Copy these into your deployment platform's environment settings:

```
# PostgreSQL database connection string (required)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Groq API key — used for chat (llama-3.3-70b-versatile) and audio transcription
GROQ_API_KEY=gsk_...

# ElevenLabs API key — used for text-to-speech voice output
# Free plan: falls back to browser speech synthesis automatically
ELEVENLABS_API_KEY=sk_...

# Optional: Resend API key — enables real email delivery for OTP sign-in
# Without this, the OTP code is returned in the API response and shown on screen
RESEND_API_KEY=re_...

# Optional: Sender address for OTP and password reset emails (requires RESEND_API_KEY)
EMAIL_FROM=Jarvis AI <noreply@yourdomain.com>

# Session secret — set a long random string for production
SESSION_SECRET=your-long-random-secret-here

# Node environment
NODE_ENV=production
```

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite (artifacts/jarvis)
- API: Express 5 (artifacts/api-server, port 8080)
- DB: PostgreSQL + Drizzle ORM (lib/db)
- Auth: Passport.js (local strategy) + session-based, Email OTP
- Voice: ElevenLabs TTS (with browser Web Speech API fallback), Groq Whisper transcription
- Chat AI: Groq llama-3.3-70b-versatile (streaming SSE)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/jarvis/src/pages/chat.tsx` — main chat UI, message rendering, streaming
- `artifacts/jarvis/src/pages/call.tsx` — video call page with VAD + Jarvis avatar
- `artifacts/jarvis/src/pages/live.tsx` — live voice session with infinity orb
- `artifacts/jarvis/src/context/voice-context.tsx` — ElevenLabs voice list + TTS logic
- `artifacts/jarvis/src/hooks/use-auth.tsx` — auth mutations and context
- `artifacts/api-server/src/routes/` — all API routes (auth, conversations, tts, email-otp)
- `artifacts/api-server/src/lib/elevenlabs.ts` — ElevenLabs TTS helper
- `artifacts/api-server/src/lib/email.ts` — Resend email helper (OTP + password reset)
- `lib/db/src/schema/` — Drizzle ORM schema (source of truth for DB shape)

## Database Schema

Tables: `users`, `conversations`, `messages`, `email_otps`, `password_reset_tokens`, `session`

Run `pnpm --filter @workspace/db run push` to apply schema changes to the connected DB.

## Architecture Decisions

- **TTS fallback**: ElevenLabs is tried first; if the plan doesn't support the voice, browser Web Speech API is used silently
- **OTP without email**: If `RESEND_API_KEY` is not set, the OTP is returned in the API response and displayed on screen (dev/demo mode)
- **VAD loop prevention**: Live and call pages use `isProcessingRef` so only one transcribe→chat→speak cycle runs at a time; the mic reactivates only after TTS finishes
- **Streaming chat**: Chat uses SSE streaming from Groq so tokens appear word-by-word
- **Session auth**: Passport.js local strategy + express-session backed by PostgreSQL `session` table

## User Preferences

- Chat voice auto-reads every message by default (can be toggled off with the speaker icon)
- Message action buttons (copy, thumbs up/down, play voice) appear below every Jarvis response

## Gotchas

- Always run `pnpm --filter @workspace/db run push` after changing `lib/db/src/schema/` files
- The Vite dev server proxies `/api` → `http://localhost:8080` (see `vite.config.ts`)
- ElevenLabs free plan blocks premade voices via API — the app falls back to browser speech automatically
- `SESSION_SECRET` must be set in production or sessions won't persist across restarts
