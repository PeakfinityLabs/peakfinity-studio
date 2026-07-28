-- Creative tracker: replaces the team's Google Sheet.
CREATE TYPE "CreativeStatus" AS ENUM (
  'BACKLOG', 'SCRIPTING', 'EDITING', 'NEEDS_REVIEW', 'NEEDS_REVISION', 'READY'
);
CREATE TYPE "CreativePriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

CREATE TABLE "Creative" (
  "id"            TEXT NOT NULL,
  "month"         TEXT NOT NULL,
  "lp"            TEXT,
  "page"          TEXT,
  "strategist"    TEXT,
  "title"         TEXT NOT NULL,
  "briefLink"     TEXT,
  "editor"        TEXT,
  "editorUserId"  TEXT,
  "videoLink"     TEXT,
  "contentNeeded" BOOLEAN NOT NULL DEFAULT true,
  "status"        "CreativeStatus" NOT NULL DEFAULT 'BACKLOG',
  "priority"      "CreativePriority" NOT NULL DEFAULT 'NORMAL',
  "aiModel"       TEXT,
  "generations"   INTEGER,
  "launchedAt"    TIMESTAMP(3),
  "cogScore"      INTEGER,
  "isWinner"      BOOLEAN NOT NULL DEFAULT false,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Creative_month_createdAt_idx" ON "Creative" ("month", "createdAt");
CREATE INDEX "Creative_editorUserId_idx" ON "Creative" ("editorUserId");
CREATE INDEX "Creative_status_idx" ON "Creative" ("status");

ALTER TABLE "Creative" ADD CONSTRAINT "Creative_editorUserId_fkey"
  FOREIGN KEY ("editorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
