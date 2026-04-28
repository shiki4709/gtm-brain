// Product context — stores what the user sells and who it's for
// Used by content pipelines to align narrative with the product
//
// Two modes:
// 1. getProductContext() — fetch stored product context
// 2. productContextToPrompt() — format for prompt injection

import { SupabaseClient } from '@supabase/supabase-js'
import type { ProductContext } from './types'

// Fetch stored product context for a user
export async function getProductContext(
  sb: SupabaseClient,
  userId: string
): Promise<ProductContext | null> {
  const { data } = await sb
    .from('sb_users')
    .select('product_context')
    .eq('id', userId)
    .single()

  if (!data?.product_context) return null
  return data.product_context as unknown as ProductContext
}

// Save product context to user record
export async function saveProductContext(
  sb: SupabaseClient,
  userId: string,
  context: ProductContext
): Promise<void> {
  await sb
    .from('sb_users')
    .update({ product_context: context as unknown as Record<string, unknown> })
    .eq('id', userId)
}

// Convert product context to a prompt string for injection into any pipeline
// Designed to inform perspective, NOT to create sales pitches
export function productContextToPrompt(context: ProductContext | null): string {
  if (!context) return ''

  const parts: string[] = ['PRODUCT CONTEXT (what you sell — use to inform your perspective, NOT to pitch):']

  if (context.whatYouSell) {
    parts.push(`WHAT YOU SELL: ${context.whatYouSell}`)
  }
  if (context.whoItsFor) {
    parts.push(`WHO IT'S FOR: ${context.whoItsFor}`)
  }
  if (context.painPoints) {
    parts.push(`PROBLEMS IT SOLVES: ${context.painPoints}`)
  }
  if (context.differentiator) {
    parts.push(`WHAT MAKES IT DIFFERENT: ${context.differentiator}`)
  }
  if (context.cta) {
    parts.push(`DESIRED ACTION: ${context.cta}`)
  }

  parts.push('IMPORTANT: This context shapes your worldview and expertise — you see problems through this lens. Do NOT pitch or mention the product directly unless explicitly asked to. Your content should demonstrate expertise in the problem space, not advertise.')

  return parts.join('\n')
}
