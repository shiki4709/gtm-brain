// Credit system — balance management and atomic deduction via Supabase RPC

import { SupabaseClient } from '@supabase/supabase-js'

export const CREDIT_COSTS: Record<string, number> = {
  reply: 2,
  repurpose: 3,
  discover: 1,
  score: 1,
  score_ai: 2,
}

export async function getBalance(sb: SupabaseClient, userId: string): Promise<number> {
  const { data } = await sb
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .single()

  return data?.balance ?? 0
}

export async function deductCredits(
  sb: SupabaseClient,
  userId: string,
  amount: number,
  endpoint: string,
  apiKeyId: string
): Promise<boolean> {
  const { data, error } = await sb.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_endpoint: endpoint,
    p_api_key_id: apiKeyId,
  })

  if (error) {
    console.error('Credit deduction failed:', error.message)
    return false
  }

  return data === true
}

export async function initCredits(sb: SupabaseClient, userId: string): Promise<void> {
  // Insert with ON CONFLICT DO NOTHING — safe to call multiple times
  await sb
    .from('credits')
    .upsert({ user_id: userId, balance: 100 }, { onConflict: 'user_id', ignoreDuplicates: true })

  // Log the signup bonus only if the row was just created
  const { data } = await sb
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'signup_bonus')
    .limit(1)

  if (!data || data.length === 0) {
    await sb.from('credit_transactions').insert({
      user_id: userId,
      amount: 100,
      type: 'signup_bonus',
    })
  }
}
