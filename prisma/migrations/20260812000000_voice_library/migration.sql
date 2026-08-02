-- Voice library: cloned voices for talking-avatar videos (phase 1 of the
-- voice feature; see docs/VOICE_PLAN.md).
CREATE TYPE "VoiceEngine" AS ENUM ('MINIMAX', 'ELEVENLABS');

CREATE TABLE "Voice" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "provider"        "VoiceEngine" NOT NULL,
  "providerVoiceId" TEXT NOT NULL,
  "sampleUrl"       TEXT,
  "previewUrl"      TEXT,
  "lastUsedAt"      TIMESTAMP(3),
  "archivedAt"      TIMESTAMP(3),
  "archivedBy"      TEXT,
  "createdById"     TEXT NOT NULL,
  "createdByName"   TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Voice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Voice_archivedAt_createdAt_idx" ON "Voice" ("archivedAt", "createdAt");
