import { supabase } from './supabase'
import type { SbUser } from './types'

const DEMO_EMAIL = 'maruthi@nevara.io'

export async function getOrCreateUser(): Promise<SbUser> {
  // Phase 1: single-user mode with hardcoded email
  // Phase 2 will add Supabase Auth with magic link
  const { data: existing } = await supabase
    .from('sb_users')
    .select('*')
    .eq('email', DEMO_EMAIL)
    .single()

  if (existing) return existing as SbUser

  const { data: created, error } = await supabase
    .from('sb_users')
    .insert({ email: DEMO_EMAIL, name: 'Maruthi' })
    .select()
    .single()

  if (error) throw new Error(`Failed to create user: ${error.message}`)
  return created as SbUser
}

export function isOnboarded(user: SbUser): boolean {
  const config = user.icp_config
  return Array.isArray(config?.titles) && config.titles.length > 0
}
