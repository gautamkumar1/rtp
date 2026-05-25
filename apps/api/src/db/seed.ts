import 'dotenv/config'
import { prisma } from './client.js'

async function main() {
  console.log('Seeding database...')

  // Clean existing seed data
  await prisma.report.deleteMany()
  await prisma.simulation.deleteMany()
  await prisma.analysisRun.deleteMany()
  await prisma.game.deleteMany()

  const game = await prisma.game.create({
    data: {
      name: 'Seed Test Game',
      provider: 'test',
      status: 'uploaded',
      originalFileName: 'test.zip',
      uploadPath: './storage/uploads/seed-test/original.zip',
    },
  })

  console.log(`Created seed game: ${game.id}`)
  console.log('Seeding complete.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
