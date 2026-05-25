import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import type { GameSchema } from '@rtp/game-schema'
import { gameArtifactsPath, ensureDir } from '../lib/storage.js'

export async function generateMechanicsDocument(
  gameId: string,
  schema: GameSchema,
): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = buildMechanicsPrompt(schema)

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are a casino game analyst. Write clear, accurate technical documentation for game mechanics. Use concrete numbers from the data. Flag unknowns explicitly.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 4_000,
  })

  const content = response.choices[0]?.message?.content ?? ''

  const artifactsDir = gameArtifactsPath(gameId)
  ensureDir(artifactsDir)

  const docPath = path.join(artifactsDir, 'game-mechanics.md')
  fs.writeFileSync(docPath, content)

  return content
}

function buildMechanicsPrompt(schema: GameSchema): string {
  const reelSummary = schema.reels.map((reel, i) => {
    const counts: Record<string, number> = {}
    for (const sym of reel) counts[sym] = (counts[sym] ?? 0) + 1
    const breakdown = Object.entries(counts)
      .map(([s, n]) => `${s}×${n}`)
      .join(', ')
    return `  Reel ${i + 1}: ${reel.length} symbols — ${breakdown}`
  })

  const symbolList = schema.symbols
    .map((s) => `  - ${s.id} (${s.name})${s.isWild ? ' [WILD]' : ''}${s.isScatter ? ' [SCATTER]' : ''}`)
    .join('\n')

  const paytableRows = Object.entries(schema.paytable)
    .map(([sym, pays]) => {
      const payStr = Object.entries(pays)
        .map(([cnt, mult]) => `${cnt}x → ${mult}`)
        .join(', ')
      return `  - ${sym}: ${payStr}`
    })
    .join('\n')

  const warnings = schema.warnings.length > 0 ? schema.warnings.join('\n  - ') : 'None'
  const assumptions = schema.assumptions.length > 0
    ? schema.assumptions.map((a) => `  - ${a.field}: assumed ${JSON.stringify(a.assumedValue)} — ${a.reason}`).join('\n')
    : 'None'

  return `Write a professional game mechanics document for the following slot game. Be precise and use the actual numbers provided.

# Game: ${schema.gameName}
Provider: ${schema.provider}
Game Type: ${schema.gameType}
Currency Mode: ${schema.currencyMode}

## Bet Configuration
- Default Bet: ${schema.bet.defaultBet}
- Active Lines: ${schema.bet.lines}
- Coin Value: ${schema.bet.coinValue}
${schema.bet.minBet ? `- Min Bet: ${schema.bet.minBet}` : ''}
${schema.bet.maxBet ? `- Max Bet: ${schema.bet.maxBet}` : ''}

## Reel Configuration
${schema.reels.length} reels × ${Math.max(...schema.reels.map((r) => r.length))} symbols per strip
${reelSummary.join('\n')}

## Paylines
${schema.paylines.length} paylines
${schema.paylines.map((pl, i) => `  Line ${i + 1}: [${pl.join(', ')}]`).join('\n')}

## Symbols
${symbolList}

## Paytable (symbol × match count → multiplier)
${paytableRows || '  (Not available)'}

## Wild Rules
${schema.wild ? `Symbol: ${schema.wild.symbolId}, Multiplier: ${schema.wild.multiplier ?? 1}, Substitutes for: ${schema.wild.substitutesFor.length === 0 ? 'all non-scatter' : schema.wild.substitutesFor.join(', ')}${schema.wild.restrictions ? `, Restrictions: ${schema.wild.restrictions}` : ''}` : 'No wild symbol detected'}

## Scatter Rules
${schema.scatter ? `Symbol: ${schema.scatter.symbolId}, Trigger at: ${schema.scatter.triggerCount} scatters, Awards: ${schema.scatter.awardType}${schema.scatter.pays ? `, Pay table: ${JSON.stringify(schema.scatter.pays)}` : ''}` : 'No scatter symbol detected'}

## Free Spins
${schema.freeSpins ? `Count: ${schema.freeSpins.count}, Multiplier: ${schema.freeSpins.multiplier}, Retrigger: ${schema.freeSpins.retrigger}${schema.freeSpins.retriggerCount ? `, Retrigger adds: ${schema.freeSpins.retriggerCount}` : ''}${schema.freeSpins.specialRules ? `, Special: ${schema.freeSpins.specialRules}` : ''}` : 'No free spins feature detected'}

## Bonus Round
${schema.bonus ? `${schema.bonus.description} — Triggered by: ${schema.bonus.triggerCondition}` : 'No bonus round detected'}

## Buy Bonus
${schema.buyBonus ? `Cost: ${schema.buyBonus.costMultiplier}× bet, Entry: ${schema.buyBonus.entryPoint}${schema.buyBonus.rtp ? `, Declared RTP: ${(schema.buyBonus.rtp * 100).toFixed(2)}%` : ''}` : 'No buy bonus feature detected'}

## Warnings / Uncertain Data
  - ${warnings}

## AI Assumptions (fields inferred without direct evidence)
${assumptions}

---

Write the document in markdown with sections: Overview, Reel Layout & Weight, Paylines, Symbols & Paytable, Wild Mechanics, Scatter & Free Spins, Bonus Features, Assumptions & Limitations. For each section that has incomplete data, state explicitly what could not be determined and why.`
}
