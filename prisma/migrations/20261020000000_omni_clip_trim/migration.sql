-- Omni Zone timeline: non-destructive trim in/out points per clip (cut = split into two clips).
-- AlterTable
ALTER TABLE "OmniClip" ADD COLUMN     "trimEnd" DOUBLE PRECISION,
ADD COLUMN     "trimStart" DOUBLE PRECISION NOT NULL DEFAULT 0;

