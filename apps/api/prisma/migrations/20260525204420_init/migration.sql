-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('uploaded', 'extracting', 'extracted', 'scanning', 'scanned', 'analyzing', 'analyzed', 'simulating', 'simulated', 'reporting', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('pending', 'running', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('pending', 'running', 'complete', 'failed');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'unknown',
    "status" "GameStatus" NOT NULL DEFAULT 'uploaded',
    "originalFileName" TEXT NOT NULL,
    "uploadPath" TEXT NOT NULL,
    "extractedPath" TEXT,
    "normalizedSchemaPath" TEXT,
    "normalizedSchemaJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'pending',
    "fileTreeJson" JSONB,
    "candidateFilesJson" JSONB,
    "aiOutputJson" JSONB,
    "warningsJson" JSONB,
    "errorsJson" JSONB,
    "assumptionsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "SimulationStatus" NOT NULL DEFAULT 'pending',
    "spinCount" BIGINT NOT NULL DEFAULT 10000000,
    "totalSpins" BIGINT,
    "totalBet" DECIMAL(20,4),
    "totalReturn" DECIMAL(20,4),
    "rtp" DECIMAL(10,6),
    "baseRtp" DECIMAL(10,6),
    "freeSpinsRtp" DECIMAL(10,6),
    "bonusRtp" DECIMAL(10,6),
    "buyBonusRtp" DECIMAL(10,6),
    "hitRate" DECIMAL(10,6),
    "variance" DECIMAL(20,8),
    "standardDeviation" DECIMAL(20,8),
    "confidence90Low" DECIMAL(10,6),
    "confidence90High" DECIMAL(10,6),
    "confidence95Low" DECIMAL(10,6),
    "confidence95High" DECIMAL(10,6),
    "rawOutputPath" TEXT,
    "symbolHitJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "jsonReportPath" TEXT,
    "excelReportPath" TEXT,
    "pdfReportPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
