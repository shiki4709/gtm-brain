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

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('Auth error:', authError?.message ?? 'No user session')
    return null
  }

  // Use service client for DB operations (bypasses RLS)
  const { createServiceClient } = await import('./supabase')
  const sb = createServiceClient()

  // Get or create sb_users row
  const { data: existing, error: fetchError } = await sb
    .from('sb_users')
    .select('*')
    .eq('email', user.email)
    .single()

  if (existing) return { authUser: user, dbUser: existing, sb }

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('DB fetch error:', fetchError.message)
    return null
  }

  // Create new user
  const { data: created, error: createError } = await sb
    .from('sb_users')
    .insert({ email: user.email, name: user.user_metadata?.name ?? user.email?.split('@')[0] })
    .select()
    .single()

  if (createError) {
    console.error('DB create error:', createError.message)
    return null
  }

  return created ? { authUser: user, dbUser: created, sb } : null
}
