# Peakfinity Studio

Internal, login-gated web app for Peakfinity Labs marketing editors to generate ad creative
(images and videos) through the [fal.ai](https://fal.ai) model APIs. Replaces Higgsfield with a
self-hosted wrapper so we only pay fal's per-generation cost.

## Stack

- **Next.js 15** (App Router) + TypeScript, Tailwind CSS 4, shadcn/ui
- **Prisma + PostgreSQL** (Render Postgres in prod, `prisma dev` locally — no Docker needed)
- **Auth.js (NextAuth v5)** — credentials provider, JWT cookie sessions, registration
  restricted to `@peakfinitylabs.com`
- **fal.ai** via `@fal-ai/client` — all calls server-side; the queue API + webhooks
- **Cloudflare R2** for persisting generated media (fal output URLs expire)
- **Anthropic Claude** for the prompt optimizer (provider swappable)

## Models

| Model | Endpoint | Type |
| --- | --- | --- |
| Nano Banana 2 | `fal-ai/nano-banana-2` / `fal-ai/nano-banana-2/edit` | image |
| GPT Image 2 | `openai/gpt-image-2` / `openai/gpt-image-2/edit` | image |
| Kling O3 [Pro] | `fal-ai/kling-video/o3/standard/image-to-video` | video |
| Seedance 2.0 | `bytedance/seedance-2.0/reference-to-video` | video |

Note: fal titles the Kling `o3/standard` page "[Pro]" — the `/standard/` path is correct;
do not change it to `/o3/pro/` (that is a separate, slower, pricier tier).

## Local development

```bash
npm install
cp .env.example .env.local        # fill in FAL_KEY, ANTHROPIC_API_KEY, R2 creds
npx auth secret                   # or set AUTH_SECRET manually

# Terminal 1 — local Postgres (Prisma Postgres, no Docker):
npm run db:dev                    # copy the printed postgres:// URL into .env.local (use 127.0.0.1, drop the timeout params)

# Terminal 2:
npm run db:push                   # local dev syncs the schema directly (PGlite can't run migrate dev's shadow DB)
npm run dev
```

Schema changes: edit `prisma/schema.prisma`, run `npm run db:push` locally, and regenerate the
migration SQL for prod with
`npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`
saved as a new `prisma/migrations/<n>_<name>/migration.sql`. Render applies them with
`prisma migrate deploy` at build time.

Webhooks can't reach localhost; locally the app relies on the polling fallback
(`GET /api/jobs/[id]` checks `fal.queue.status` for open jobs), so everything still completes.

## Deploy (Render)

`render.yaml` defines the web service + Postgres. Set the secret env vars in the Render
dashboard (`FAL_KEY`, `ANTHROPIC_API_KEY`, `R2_*`, `AUTH_URL`, `APP_BASE_URL` — the last two are
the public `https://<service>.onrender.com` URL). Migrations run in the build command.

## Verification

```bash
npm run typecheck && npm run lint && npm run build
npm run smoke:fal                 # submits one cheap IMAGE job per model (real cost!)
npm run smoke:fal -- --video      # opt-in: also runs the video models (~$1+)
```
