import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Get the authenticated user's ID and ensure they have a sb_users row
export async function getAuthUser() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* static rendering */ }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Use service client for DB operations
  const { createServiceClient } = await import('./supabase')
  const sb = createServiceClient()

  // Get or create sb_users row
  const { data: existing } = await sb
    .from('sb_users')
    .select('*')
    .eq('email', user.email)
    .single()

  if (existing) return { authUser: user, dbUser: existing, sb }

  // Create new user
  const { data: created } = await sb
    .from('sb_users')
    .insert({ email: user.email, name: user.user_metadata?.name ?? user.email?.split('@')[0] })
    .select()
    .single()

  return created ? { authUser: user, dbUser: created, sb } : null
}
