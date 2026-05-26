-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "declaredRtp" DOUBLE PRECISION,
ADD COLUMN     "parentGameId" TEXT,
ADD COLUMN     "variantLabel" TEXT;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_parentGameId_fkey" FOREIGN KEY ("parentGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
