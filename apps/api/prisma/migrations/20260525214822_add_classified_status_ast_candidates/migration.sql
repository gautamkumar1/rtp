-- AlterEnum
ALTER TYPE "AnalysisStatus" ADD VALUE 'classified';

-- AlterTable
ALTER TABLE "AnalysisRun" ADD COLUMN     "astCandidatesJson" JSONB;
