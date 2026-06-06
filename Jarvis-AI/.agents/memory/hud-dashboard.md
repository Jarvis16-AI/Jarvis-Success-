---
name: HUD Dashboard chat page
description: chat.tsx rebuilt as full sci-fi HUD launcher; records API choices, icon CDN, weather context injection, wake word engine, and browser gotchas.
---

## Layout (top → bottom)
1. Header: menu | ∞ JARVIS v4.2 | Antenna (wake toggle) | audio | share | new
2. Wake mode banner (red, only when active) — shows interim transcript
3. "SYSTEM INTERFACE · ENCRYPTED" subtitle bar
4. 3-column HUD (224px): grid-cols-[88px 1fr 106px]
   - Left: LOCAL TIME, NOTIFICATIONS, POWER (Battery API)
   - Center: Animated SVG HUD (concentric rings + infinity orb), CAM/MIC status
   - Right: PROXIMITY radar (real compass heading in orange), WEATHER, SYS LOAD
5. App Launcher Strip (real brand icons via SimpleIcons CDN)
6. Pending Intent Banner (auto-appears on client intent detection)
7. Chat messages area
8. Status bar (shows "ALWAYS LISTENING" dot when wake mode active)
9. Ticker
10. Input bar (input border turns red when wake mode on)

## Real Brand Icons — SimpleIcons CDN
URL format: `https://cdn.simpleicons.org/{slug}/{hexcolor}`
- Returns SVG at any size, cross-origin safe for `<img>` tags (no CORS issue with img element)
- AppIcon component: renders `<img src="simpleicons url">` with `onError → setFailed(true)` → shows emoji fallback
- Each icon has: `slug` (simpleicons.org slug), `iconColor` (hex without #), `bg` (CSS background — may be gradient string for Instagram), `emoji` (fallback)
- Phone (no simpleicons): slug=null → renders Lucide `<Phone>` icon

Key slugs: whatsapp, googlemaps, youtube, gmail, instagram, tiktok, x, spotify, telegram, uber, google

## Live Device Context — Weather Fix
Every chat message now sends `deviceContext` field in the request body to `/api/conversations/:id/chat`.
The API (conversations.ts) injects it as a suffix to the system prompt ONLY for that Groq call — NOT stored in DB.
Format: `${SYSTEM_PROMPT}\n\n## LIVE DEVICE CONTEXT\n...`
Content: date/time, weather (city, temp °F, condition, L/H, tomorrow), battery %, network.
This makes Jarvis answer "what's the weather?" correctly without any external API key.
**Why:** Groq has no real-time data — we must inject it from the frontend. Storing it per message in DB is wasteful; injecting via system prompt per request is clean and not saved.
**How to apply:** Any new device context (screen brightness, orientation, etc.) → add to `buildDeviceContext()` in chat.tsx.

## Wake Word — "Jarvis ..." hands-free
Uses Web Speech API: `window.SpeechRecognition || window.webkitSpeechRecognition`
- Works on Android Chrome natively; iOS requires user gesture (handled via Antenna button toggle)
- `continuous: true`, `interimResults: true`
- Wake pattern: `/^jarvis[,.]?\s+(.+)/i` — extracts command after "Jarvis"
- Key ref: `wakeModeRef` (useRef boolean, NOT state) — used inside `onend` callback to avoid stale closure
- `sendMessageRef` (useRef to latest sendMessage) — used inside `onresult` to avoid stale closure
- Auto-restart: `rec.onend` calls `rec.start()` with 300ms delay when `wakeModeRef.current === true`
- `onerror({ error: 'not-allowed' })` → stop wake mode (user denied mic)
- Visual: Antenna icon in header pulses red, wake banner shows "ALWAYS LISTENING · SAY JARVIS..." with live interim transcript, status bar shows red "ALWAYS LISTENING" dot
- Input bar border turns red when active (subtle indicator)
- Toggle: Antenna button in header; stopWakeMode cleaned up on unmount

## Launcher Action Engine (unchanged from previous version)
- `parseActions()` strips [ACTION:TYPE:params] from Jarvis response, stores in actionMap[msgId]
- `detectInputIntent()` client-side regex on user input → `pendingIntent` banner
- `executeAction()` handles CALL, WHATSAPP, SMS, EMAIL, MAPS, NAVIGATE, OPEN, YOUTUBE, SEARCH, SHARE, CONTACTS via URI schemes

## SVG rotation — do NOT switch to CSS
Use SVG `<animateTransform>` not CSS transform for rings — cross-browser reliable.

## Weather + Geocoding (no API key)
- Open-Meteo: `https://api.open-meteo.com/v1/forecast?...&temperature_unit=fahrenheit&timezone=auto`
- Nominatim: `https://nominatim.openstreetmap.org/reverse?lat=X&lon=Y&format=json` with `Accept-Language: en`
- WeatherData now includes `lat` and `lon` (for context string)

## Permission strategy
- Notifications: on mount
- Camera/mic: query only, prompt on use
- Location: on mount (for weather)
- Compass (iOS): only on tap of Antenna or COMPASS launcher button
- Contacts: only on tap of CONTACTS launcher button

## System Prompt (api-server/src/lib/groq.ts)
Action tag format: `[ACTION:TYPE:param1:param2]` — full list in the prompt.
`deviceContext` is injected as `## LIVE DEVICE CONTEXT` suffix to system prompt per-request.
