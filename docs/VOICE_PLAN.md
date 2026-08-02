# Plan: Voice control + voice cloning for Kling videos

Goal (from Rahul, relaying Jonah): editors should be able to **choose the voice**
of a generated avatar — the way Higgsfield does for Kling — and ideally
**clone a voice** and reuse it across generations.

Status: **researched, not built.** Everything below is verified against fal's
docs unless marked "verify at build time".

---

## 1. What fal actually offers

`fal-ai/kling-video/o3/standard/image-to-video` (what we ship today) has only a
boolean `generate_audio`. **There is no voice parameter** — so we cannot control
the voice on our current endpoint. Two real routes exist:

### Route A — Kling 3.0 Omni native audio (preset voices only)
Kling 3.0 Omni generates native lip-synced audio with multilingual preset voices
and a per-character voice-assignment syntax. Simplest, one API call, but the
voices are **fixed presets — no cloning**. Verify at build time whether fal
exposes an Omni endpoint with a voice parameter (`fal-ai/kling-video/v3/...`).

### Route B — TTS + lipsync pipeline (recommended: gives BOTH asks)
Three fal calls chained:

| Step | Endpoint | Purpose |
|---|---|---|
| 1. Clone (one-off, per voice) | `fal-ai/minimax/voice-clone` | sample audio → `custom_voice_id` |
| 2. Speak | `fal-ai/minimax/speech-02-hd` | script + `voice_setting.voice_id` → audio |
| 3. Video | `fal-ai/kling-video/o3/standard/image-to-video` | start frame → silent video |
| 4. Lipsync | `fal-ai/kling-video/lipsync/audio-to-video` | video + audio → final |

Route B satisfies "change the voice" *and* "clone a voice", and reuses the
talking-head optimizer presets we already shipped (the script is already the
prompt-box input for those styles).

### Note: Higgsfield's "change voice" button is Route B
Higgsfield's UX (a button listing saved custom voices + presets) is the same
pipeline described here, with a voice library in front of it. Adopting Route B
means matching that UX; the open decision is only **which voice engine** sits in
steps 1–2.

### Voice engine options (steps 1–2 only — the pipeline is identical)

| | Cloning | Quality | Keys / billing | Status |
|---|---|---|---|---|
| **MiniMax on fal** | `minimax/voice-clone`, native fal endpoint | Good | FAL_KEY only | Works today |
| **ElevenLabs via fal** (`fal-ai/elevenlabs/tts/eleven-v3`) | **No cloning endpoint on fal** | Best-in-class for expressive ad reads | FAL_KEY only | ⚠ see below |
| **ElevenLabs direct** | Instant (~1 min sample, paid plan) or Professional (30+ min) | Best-in-class | 2nd vendor + `ELEVENLABS_API_KEY` | Extra integration |

### DECIDED (2026-08): ship BOTH providers
Rahul has an ElevenLabs **paid** key, which unlocks Instant Voice Cloning
(`POST /v1/voices/add`, Starter+ plan) — so we call ElevenLabs **directly** and
the fal account-scoping problem below becomes moot. Build both engines behind
one interface and let editors choose per voice.

```ts
// lib/voice/provider.ts
export type VoiceProvider = {
  clone(sampleUrl: string, name: string): Promise<string>;  // → providerVoiceId
  speak(text: string, providerVoiceId: string): Promise<string>; // → public audio URL
};
// implementations: minimax (via fal), elevenlabs (direct, ELEVENLABS_API_KEY)
```

`Voice` gains `provider` ("MINIMAX" | "ELEVENLABS") and `providerVoiceId`.

Provider differences that matter:
- **ElevenLabs returns audio bytes**, not a URL → upload the result to fal
  storage (`fal.storage.upload`, already used by `/api/upload`) to get a public
  URL for the lipsync step.
- **The 7-day expiry applies to MiniMax only.** ElevenLabs voices persist in the
  account, so the expiry countdown/refresh in §4 should be MiniMax-specific.
- New env var: `ELEVENLABS_API_KEY` (add to `.env.example` + Render).

**Lip-sync quality is provider-independent.** The lipsync model consumes a
plain audio file and has no idea which TTS produced it — so neither engine syncs
"better". Sync quality is driven by: clean speech (no music/noise), language
(Kling lipsync is native EN/ZH; others get translated), natural pacing, and a
front-facing, clearly-visible face in the source video. Choose the engine on
**voice quality**, not sync.

⚠ **Only relevant if we ever want ElevenLabs *through fal* instead of direct:**
ElevenLabs voice IDs are
**account-scoped**. fal hosts ElevenLabs *TTS*, but cloning happens in an
ElevenLabs account. If fal calls ElevenLabs with fal's own account, custom voice
IDs from *our* account will not resolve, and there is no confirmed BYOK
(`elevenlabs_api_key`) input on fal's endpoint. Research was inconclusive (fal
docs rate-limited). **Test this first**: clone a voice in an ElevenLabs account,
then try that `voice_id` against `fal-ai/elevenlabs/tts/eleven-v3`.
- If it works → ElevenLabs for everything through fal: best quality, one key.
- If not → either MiniMax-on-fal (one key, good) or ElevenLabs-direct (best
  quality, second key + bill).

**Design implication:** make the voice engine a **swappable provider** behind an
interface (same pattern as `lib/optimizer/provider.ts`). Steps 3–4 (Kling +
lipsync) never change, so the engine can be swapped after a quality bake-off
without touching the pipeline. Ship whichever wins; don't block the build on it.

**Suggested bake-off (cheap, do before phase 1):** clone the same voice in
MiniMax and ElevenLabs, generate the same 15-word ad script in each, and let
Rahul/Jonah pick by ear. Voice quality is the whole point of the feature.

---

## 2. Hard constraints (these shape the UX — do not skip)

- **Kling lipsync source video must be 2–10s**, 720p/1080p, ≤100MB, .mp4/.mov.
  Our Kling duration selector currently offers 3–15s → **cap to 10s whenever a
  voice is selected**, and say why in the UI.
- **Lipsync audio**: 2–60s, ≤5MB, .mp3/.wav/.m4a.
- **Cloned voices expire**: a `custom_voice_id` is deleted if it isn't used by a
  TTS endpoint **within 7 days**. Must be handled (see §4).
- **Lipsync is slow** — ~12 minutes regardless of length. Combined with Kling
  itself, a voiced video is a *multi-minute* job. The job UX must set that
  expectation (we already support leaving the page).
- **Pricing**: lipsync $0.014 per input-second, rounded up to a 5s increment;
  plus Kling ($0.084/s) plus TTS. Cost estimator must sum all stages.

### Ordering insight
Generate **TTS first**, measure the audio duration, then request the Kling video
at the *nearest allowed duration* (clamped 3–10s). Otherwise a fixed-length video
and a variable-length VO will mismatch and the lipsync looks wrong.

---

## 3. Architecture

Our `Job` model assumes **one** fal request (`falRequestId`). A voiced video is
a chain. Minimal, clean extension — do **not** build a second job system:

```prisma
model Job {
  // ...existing
  pipeline     Json?   // { steps: [{ kind, endpoint, input, output? }], current: Int }
}
```

- `POST /api/generate/kling-o3` with a `voiceId` builds a 3-step pipeline and
  submits step 1.
- The existing completion path (`lib/jobs/complete.ts`) gains a branch: if the
  job has a pipeline with remaining steps, **submit the next step and update
  `falRequestId`** instead of marking COMPLETED. Only the final step completes
  the job and persists media.
- This reuses the webhook, the polling fallback, R2 persistence, cost tracking,
  and the failure handling we already hardened — nothing new to get wrong.
- Store intermediate URLs (VO audio, silent video) on the job so a failed step
  is debuggable and the VO can be reused on a re-run.

### New model

```prisma
model Voice {
  id            String    @id @default(cuid())
  name          String            // "Sarah — warm US female"
  falVoiceId    String            // custom_voice_id from minimax
  sampleUrl     String?           // uploaded reference clip
  previewUrl    String?           // short generated sample for the picker
  createdById   String
  createdByName String
  lastUsedAt    DateTime?         // drives the 7-day expiry guard
  archivedAt    DateTime?         // soft delete, consistent with the tracker
  createdAt     DateTime  @default(now())
}
```

---

## 4. The 7-day expiry (easy to get wrong)

A cloned voice vanishes if unused for 7 days. Handle it explicitly:

1. **On clone, immediately generate a short preview** via `speech-02-hd`. This
   both gives the picker an audio preview *and* starts the clock cleanly.
2. Store `lastUsedAt` on every TTS use.
3. Show "expires in N days" in the voice library, with a one-click **Refresh**
   (re-runs the tiny preview TTS).
4. Optional later: a daily cron refreshing voices older than 5 days.

---

## 5. Editor UX

- **New page `/voices`** (in nav): voice library — name, preview player, who
  added it, expiry countdown, Add voice, Archive.
- **Add voice**: upload a clean 10–30s sample → clone → auto-preview.
- **In the Kling studio form**: a **Voice** dropdown (None = today's behaviour).
  Selecting a voice:
  - swaps the prompt box hint to "script the avatar speaks",
  - caps duration to 10s and explains why,
  - switches the cost estimate to the pipeline total,
  - pairs naturally with the existing **Talking head / Static video** optimizer
    presets, which already keep the script verbatim.
- **Job view**: show pipeline progress ("Voicing → Filming → Lip-syncing") so a
  multi-minute job doesn't look stuck.

### Permissions / safety
- Cloning is powerful: gate **creating** voices to admins + strategists
  (reuse `trackerCaps`-style tiers); **using** a voice is open to all editors.
- **Consent matters.** Require an explicit "I have permission to clone this
  voice" confirmation, and record who added it (`createdByName`). Do not let
  the tool become a way to clone a real person's voice without consent.

---

## 6. Phased build

1. **Voice library**: `Voice` model + migration, `POST /api/voices` (clone +
   preview), `GET /api/voices`, `/voices` page, archive. Ship standalone — it's
   useful and testable on its own.
2. **Pipeline plumbing**: `Job.pipeline`, multi-step advance in the completion
   path, intermediate URL storage, per-stage cost. Test with a 2-step chain
   before wiring the UI.
3. **Kling voice selector**: form field, duration cap, cost estimate, job-view
   stage progress.
4. **Polish**: expiry refresh, re-run reusing existing VO, optional cron.

## 7. Verify at build time
- Whether fal exposes a **Kling Omni** endpoint with preset voice selection —
  if so, offer it as a cheaper/faster "preset voice" option beside cloning.
- Exact `minimax/voice-clone` input field names and sample-audio limits
  (fal's docs were rate-limiting during research).
- Whether `speech-02-hd` returns audio **duration** (needed for the ordering
  trick); if not, probe it from the file.
- Alternative lipsync models (`fal-ai/sync-lipsync/v3`, `veed/lipsync`,
  `fal-ai/pixverse/lipsync`) in case Kling's 10s ceiling is too tight.

## Sources
- Kling lipsync audio-to-video: https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video/api
- Kling lipsync docs: https://fal.ai/docs/model-api-reference/video-generation-api/kling-video-lipsync
- MiniMax voice clone: https://fal.ai/models/fal-ai/minimax/voice-clone/api
- MiniMax speech-02-hd: https://fal.ai/models/fal-ai/minimax/speech-02-hd/api
- Kling 3.0 Omni native lip sync: https://klingai.com/blog/kling-video-3-omni-native-lip-sync-audio-guide
