-- Change-voice pipeline: lip-sync jobs are their own generation model.
ALTER TYPE "GenModel" ADD VALUE 'KLING_LIPSYNC';
