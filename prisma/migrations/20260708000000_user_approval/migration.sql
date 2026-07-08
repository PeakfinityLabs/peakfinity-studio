-- User approval gate: PENDING/APPROVED/DENIED status.
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

ALTER TABLE "User"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByEmail" TEXT;

-- Grandfather everyone who already had access before the gate existed, so the
-- migration can never lock out current users. New sign-ups use the PENDING
-- default (the app overrides to APPROVED for admin emails).
UPDATE "User" SET "status" = 'APPROVED';

CREATE INDEX "User_status_createdAt_idx" ON "User" ("status", "createdAt");
