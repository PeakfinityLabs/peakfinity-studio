-- Rewards go live: wipe every level / point / bonus / redemption from testing
-- and start tracking from today. Clearing the sheet snapshot + baseline makes the
-- next sync a fresh baseline: everything already Ready then is "old" and never
-- counts. Store items and sheet-name → account links are kept.
DELETE FROM "Redemption";
DELETE FROM "PointsEntry";
DELETE FROM "BonusAward";
DELETE FROM "RewardsProfile";
DELETE FROM "SheetCreative";
UPDATE "RewardsSync" SET "baselineAt" = NULL, "rows" = 0, "lastError" = NULL;
