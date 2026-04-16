// POST /api/v1/score — Score posts for ICP relevance
// 1 credit (2 if use_ai: true)

import { withApiAuth, corsOptions } from '@/lib/api-v1-handler'
import { getIcpRelevanceKeywords, getIcpRelevanceWithHaiku, getRecommendation, type UserScoringConfig, type ScoredPost } from '@/lib/scoring'

interface ScoreRequest {
  readonly posts: ReadonlyArray<{
    readonly text: string
    readonly author?: string
    readonly platform?: 'x' | 'linkedin'
    readonly engagement?: { likes?: number; replies?: number; retweets?: number }
  }>
  readonly icp_config: {
    readonly track_keywords: string[]
    readonly icp_titles: string[]
  }
  readonly use_ai?: boolean
}

export const OPTIONS = corsOptions

export const POST = withApiAuth('/api/v1/score', 1, 'score', async (request, { dbUser }) => {
  const body = await request.json() as ScoreRequest

  if (!body.posts || body.posts.length === 0) {
    throw new Error('posts array is required and must not be empty')
  }
  if (body.posts.length > 50) {
    throw new Error('Maximum 50 posts per request')
  }
  if (!body.icp_config?.track_keywords || !body.icp_config?.icp_titles) {
    throw new Error('icp_config with track_keywords and icp_titles is required')
  }

  const config: UserScoringConfig = {
    trackKeywords: body.icp_config.track_keywords,
    icpTitles: body.icp_config.icp_titles,
  }

  const results = await Promise.all(
    body.posts.map(async (post) => {
      const icpRelevance = body.use_ai
        ? await getIcpRelevanceWithHaiku(post.text, config.icpTitles, config.trackKeywords)
        : getIcpRelevanceKeywords(post.text, config)

      const scoredPost: ScoredPost = {
        platform: post.platform ?? 'x',
        author: post.author ?? '',
        authorHandle: '',
        text: post.text,
        url: '',
        time: new Date().toISOString(),
        engagement: post.engagement,
      }
      const recommendation = getRecommendation(scoredPost)

      return {
        text: post.text.substring(0, 100),
        icp_relevance: {
          score: icpRelevance.score,
          matched_topic: icpRelevance.matchedTopic,
          method: icpRelevance.method,
        },
        recommendation: {
          actions: recommendation.actions.map(a => ({ type: a.type, priority: a.priority })),
          reason: recommendation.reason,
        },
      }
    })
  )

  return { results }
})
