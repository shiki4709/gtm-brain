import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { buildUserProfile, type UserProfile } from '@/lib/user-profile'

// Batch-scores posts against the user's semantic profile via Haiku
// Replaces client-side keyword matching with AI understanding

// Cache user profiles for 30 minutes (expensive to rebuild)
const profileCache = new Map<string, { profile: UserProfile; timestamp: number }>()
const PROFILE_TTL = 30 * 60 * 1000
const MAX_CACHE_SIZE = 100

// Cache individual post scores for 10 minutes
const scoreCache = new Map<string, { scores: Record<string, PostScore>; timestamp: number }>()
const SCORE_TTL = 10 * 60 * 1000

function evictOldest(cache: Map<string, unknown>) {
  if (cache.size > MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }
}

interface PostScore {
  score: number       // 0-1 relevance
  topic: string | null // matched topic for display
  reason: string       // why it's relevant (for profile display)
}

interface PostInput {
  url: string
  text: string
  author: string
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { posts: PostInput[] }
  const posts = body.posts ?? []

  if (posts.length === 0) {
    return NextResponse.json({ success: true, scores: {} })
  }

  const userId = auth.dbUser.id

  // 1. Get or build user profile
  let profile: UserProfile
  const cached = profileCache.get(userId)
  if (cached && Date.now() - cached.timestamp < PROFILE_TTL) {
    profile = cached.profile
  } else {
    profile = await buildUserProfile(
      auth.sb,
      userId,
      auth.dbUser.icp_config,
      auth.dbUser.mode,
      (auth.dbUser as Record<string, unknown>).voice_profile as Record<string, unknown> | null,
    )
    evictOldest(profileCache)
    profileCache.set(userId, { profile, timestamp: Date.now() })
  }

  // 2. Check score cache — return cached scores for posts we've already scored
  const scoreCacheKey = userId
  const cachedScores = scoreCache.get(scoreCacheKey)
  const existingScores: Record<string, PostScore> = (cachedScores && Date.now() - cachedScores.timestamp < SCORE_TTL)
    ? { ...cachedScores.scores }
    : {}

  const uncachedPosts = posts.filter(p => !(p.url in existingScores))

  // 3. Score uncached posts in batches via Haiku
  if (uncachedPosts.length > 0) {
    const batchSize = 10
    const batches: PostInput[][] = []
    for (let i = 0; i < uncachedPosts.length; i += batchSize) {
      batches.push(uncachedPosts.slice(i, i + batchSize))
    }

    const batchResults = await Promise.all(
      batches.map(batch => scoreBatchWithHaiku(profile, batch))
    )

    for (const batchScores of batchResults) {
      for (const [url, score] of Object.entries(batchScores)) {
        existingScores[url] = score
      }
    }

    // Update score cache
    evictOldest(scoreCache)
    scoreCache.set(scoreCacheKey, { scores: existingScores, timestamp: Date.now() })
  }

  // 4. Return scores for requested posts only
  const result: Record<string, PostScore> = {}
  for (const post of posts) {
    result[post.url] = existingScores[post.url] ?? { score: 0, topic: null, reason: '' }
  }

  return NextResponse.json({
    success: true,
    scores: result,
    profile: {
      interests: profile.interests,
      generatedAt: profile.generatedAt,
    },
  })
}

// Also expose GET for fetching just the profile (for settings display)
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const userId = auth.dbUser.id

  // Always rebuild on explicit GET (user wants to see current profile)
  const profile = await buildUserProfile(
    auth.sb,
    userId,
    auth.dbUser.icp_config,
    auth.dbUser.mode,
    (auth.dbUser as Record<string, unknown>).voice_profile as Record<string, unknown> | null,
  )

  profileCache.set(userId, { profile, timestamp: Date.now() })

  return NextResponse.json({
    success: true,
    profile: {
      text: profile.text,
      interests: profile.interests,
      generatedAt: profile.generatedAt,
    },
  })
}

// Score a batch of posts against the user profile using Haiku
async function scoreBatchWithHaiku(
  profile: UserProfile,
  posts: PostInput[],
): Promise<Record<string, PostScore>> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    // Fallback: return zeros
    const fallback: Record<string, PostScore> = {}
    for (const p of posts) {
      fallback[p.url] = { score: 0, topic: null, reason: '' }
    }
    return fallback
  }

  // Build the batch prompt — one call scores all posts
  const postList = posts
    .map((p, i) => `[${i}] @${p.author}: "${p.text.substring(0, 250)}"`)
    .join('\n')

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `You are a relevance scoring engine. Score how relevant each post is to this user's profile.

USER PROFILE:
${profile.text.substring(0, 2000)}

POSTS TO SCORE:
${postList}

For each post, output a JSON array with one object per post:
[{"i": 0, "s": 0-10, "t": "matched topic or null", "r": "3-word reason"}]

Scoring guide:
- 0: Completely irrelevant (personal life, entertainment, unrelated news)
- 2: Vaguely related industry but wrong angle
- 4: Adjacent topic, somewhat interesting
- 6: Clearly relevant to their interests
- 8: Directly about their focus area
- 10: Exactly their pain point or expertise area

IMPORTANT: Score based on semantic meaning, not keyword matching. A post about "scaling infrastructure for ML pipelines" should score high for someone interested in AI even if it doesn't mention "AI" directly.

Output ONLY the JSON array, no other text.`,
        }],
      }),
    })

    if (!resp.ok) {
      const fallback: Record<string, PostScore> = {}
      for (const p of posts) {
        fallback[p.url] = { score: 0, topic: null, reason: '' }
      }
      return fallback
    }

    const result = await resp.json()
    const raw: string = result.content?.[0]?.text ?? ''
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned) as Array<{ i: number; s: number; t: string | null; r: string }>

    const scores: Record<string, PostScore> = {}
    for (const entry of parsed) {
      const post = posts[entry.i]
      if (!post) continue
      scores[post.url] = {
        score: Math.min(10, Math.max(0, entry.s ?? 0)) / 10, // normalize to 0-1
        topic: entry.t || null,
        reason: entry.r ?? '',
      }
    }

    // Fill in any posts Haiku missed
    for (const p of posts) {
      if (!(p.url in scores)) {
        scores[p.url] = { score: 0, topic: null, reason: '' }
      }
    }

    return scores
  } catch {
    const fallback: Record<string, PostScore> = {}
    for (const p of posts) {
      fallback[p.url] = { score: 0, topic: null, reason: '' }
    }
    return fallback
  }
}
