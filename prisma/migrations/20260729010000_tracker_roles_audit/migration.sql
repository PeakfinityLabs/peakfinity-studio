-- Soft delete + provenance on creatives, and an append-only audit trail.
ALTER TABLE "Creative"
  ADD COLUMN "archivedAt"    TIMESTAMP(3),
  ADD COLUMN "archivedBy"    TEXT,
  ADD COLUMN "createdById"   TEXT,
  ADD COLUMN "createdByName" TEXT;

CREATE INDEX "Creative_archivedAt_idx" ON "Creative" ("archivedAt");

CREATE TABLE "CreativeChange" (
  "id"         TEXT NOT NULL,
  "creativeId" TEXT NOT NULL,
  "userId"     TEXT,
  "userName"   TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "changes"    JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreativeChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreativeChange_creativeId_createdAt_idx"
  ON "CreativeChange" ("creativeId", "createdAt");

ALTER TABLE "CreativeChange" ADD CONSTRAINT "CreativeChange_creativeId_fkey"
  FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
