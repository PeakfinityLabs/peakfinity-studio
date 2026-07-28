-- Descriptive job title (Editor, Strategist, …). Display only — permissions
-- stay driven by "role". Nullable so existing users are unaffected.
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
