-- Seconds of video generated per usage event (null for images).
ALTER TABLE "UsageEvent" ADD COLUMN "seconds" DOUBLE PRECISION;

-- Backfill from each completed video job: provider-reported length, else the requested duration.
UPDATE "UsageEvent" u
SET "seconds" = COALESCE(
  NULLIF(j."actualMetrics"->'output'->>'duration_sec', '')::double precision,
  NULLIF(j."actualMetrics"->'video'->>'duration', '')::double precision,
  CASE WHEN j."input"->'params'->>'duration' ~ '^[0-9]+(\.[0-9]+)?$'
       THEN (j."input"->'params'->>'duration')::double precision END
)
FROM "Job" j
WHERE u."jobId" = j.id AND j.type = 'VIDEO';

-- Omni Flash is billed internally at $0.02 per generated second (2¢/s).
UPDATE "UsageEvent" SET "costCents" = ROUND("seconds" * 2)::int
WHERE model = 'OMNI_FLASH' AND "seconds" IS NOT NULL;
UPDATE "Job" j SET "estimatedCostCents" = u."costCents"
FROM "UsageEvent" u WHERE u."jobId" = j.id AND j.model = 'OMNI_FLASH';
