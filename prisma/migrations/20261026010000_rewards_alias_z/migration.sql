-- Z in the creative sheet is Rayn (rraynyapwork@gmail.com).
INSERT INTO "EditorAlias" ("sheetName", "userId")
SELECT 'z', id FROM "User" WHERE lower(email) = 'rraynyapwork@gmail.com'
ON CONFLICT ("sheetName") DO UPDATE SET "userId" = EXCLUDED."userId";

-- Undo two links set by mistake while mapping Z (Cassie → Rayn, Lianne → blank).
-- Removing the rows restores the automatic name match for both.
DELETE FROM "EditorAlias" WHERE "sheetName" IN ('cassie', 'lianne');
