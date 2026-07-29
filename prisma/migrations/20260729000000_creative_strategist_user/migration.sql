-- Link the strategist to a registered user (editor already had this).
ALTER TABLE "Creative" ADD COLUMN "strategistUserId" TEXT;

CREATE INDEX "Creative_strategistUserId_idx" ON "Creative" ("strategistUserId");

ALTER TABLE "Creative" ADD CONSTRAINT "Creative_strategistUserId_fkey"
  FOREIGN KEY ("strategistUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: attach existing rows to accounts whose name already matches, so
-- imported rows start out linked wherever the person has since registered.
UPDATE "Creative" c
   SET "strategistUserId" = u.id
  FROM "User" u
 WHERE c."strategistUserId" IS NULL
   AND c."strategist" IS NOT NULL
   AND lower(c."strategist") = lower(u."name");

UPDATE "Creative" c
   SET "editorUserId" = u.id
  FROM "User" u
 WHERE c."editorUserId" IS NULL
   AND c."editor" IS NOT NULL
   AND lower(c."editor") = lower(u."name");
