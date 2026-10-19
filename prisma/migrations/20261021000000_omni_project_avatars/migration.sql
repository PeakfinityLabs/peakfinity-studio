-- Omni Zone: remember the avatars picked for a project (Create mode preselects them).
-- AlterTable
ALTER TABLE "OmniProject" ADD COLUMN     "avatarIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

