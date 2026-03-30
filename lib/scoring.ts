// Shared scoring engine — used by both web Feed and notification bots
// See skill: gtm-action-framework for the decision matrix

export interface ScoredPost {
  platform: 'linkedin' | 'x'
  author: string
  authorHandle: string
  text: string
  url: string
  time: string
  engagement?: { likes?: number; replies?: number; retweets?: number }
  authorFollowers?: number
}

export interface IcpRelevanceResult {
  score: number // 0-1
  matchedTopic: string | null
  method: 'exact' | 'expanded' | 'topic_insight' | 'title_keyword' | 'haiku' | 'none'
}

export interface ActionRecommendation {
  actions: Array<{
    label: string
    type: 'scrape' | 'reply' | 'repurpose' | 'skip'
    priority: 'high' | 'medium' | 'low'
  }>
  reason: string
}

export interface UserScoringConfig {
  trackKeywords: string[]
  icpTitles: string[]
  topicInsights?: Array<{ keyword: string; rate: number }>
  // Behavior learning: boost/penalize topics based on past act/skip
  topicBoosts?: Record<string, number> // topic → multiplier (>1 = boost, <1 = penalize)
}

export interface PostScore {
  opportunityScore: number
  icpRelevance: IcpRelevanceResult
  recommendation: ActionRecommendation
  finalScore: number
}

// ═══ WORD BOUNDARY MATCHING ═══

function matchesWord(text: string, word: string): boolean {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  return re.test(text)
}

// ═══ RELATED TERMS EXPANSION ═══

const RELATED_TERMS: Record<string, string[]> = {
  'ai': ['artificial intelligence', 'machine learning', 'ml', 'agents', 'agentic', 'gpt', 'chatbot', 'automation', 'neural', 'deep learning'],
  'llm': ['large language model', 'language model', 'foundation model', 'gpt', 'transformer'],
  'claude': ['anthropic'],
  'openai': ['chatgpt', 'gpt-4', 'gpt-5', 'gpt'],
  'gemini': ['google ai', 'deepmind'],
  'saas': ['software as a service', 'b2b software', 'subscription software'],
  'gtm': ['go to market', 'go-to-market'],
  'sales': ['selling', 'pipeline', 'quota', 'revenue', 'deals', 'prospecting'],
  'marketing': ['demand gen', 'content marketing', 'brand', 'campaigns'],
  'growth': ['scaling', 'product-led', 'plg', 'acquisition'],
}

function expandKeywords(trackKeywords: string[]): string[] {
  const expanded = [...trackKeywords]
  for (const kw of trackKeywords) {
    const related = RELATED_TERMS[kw]
    if (related) expanded.push(...related)
  }
  return [...new Set(expanded)]
}

// ═══ ICP RELEVANCE — keyword-based (fast, runs client-side) ═══

export function getIcpRelevance(text: string, config: UserScoringConfig): IcpRelevanceResult {
  const { trackKeywords, icpTitles, topicInsights } = config

  // 1. User-defined track keywords — exact match (strongest)
  const exactMatches = trackKeywords.filter(kw => matchesWord(text, kw))
  if (exactMatches.length >= 2) return { score: 0.6, matchedTopic: exactMatches.slice(0, 2).join(', '), method: 'exact' }
  if (exactMatches.length === 1) return { score: 0.4, matchedTopic: exactMatches[0], method: 'exact' }

  // 1b. Expanded/related keywords
  const expandedKeywords = expandKeywords(trackKeywords)
  const relatedMatches = expandedKeywords.filter(kw => matchesWord(text, kw))
  if (relatedMatches.length >= 2) return { score: 0.35, matchedTopic: relatedMatches.slice(0, 2).join(', '), method: 'expanded' }
  if (relatedMatches.length === 1) return { score: 0.25, matchedTopic: relatedMatches[0], method: 'expanded' }

  // 2. Topic insights from past scrapes
  if (topicInsights) {
    let bestRate = 0
    let bestTopic: string | null = null
    for (const { keyword, rate } of topicInsights) {
      if (matchesWord(text, keyword) && rate > bestRate) {
        bestRate = rate
        bestTopic = keyword
      }
    }
    if (bestRate > 0) return { score: bestRate, matchedTopic: bestTopic, method: 'topic_insight' }
  }

  // 3. ICP title keywords
  const stopWords = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'for', 'to', 'at', 'on', 'vp', 'head', 'director', 'manager', 'chief', 'officer'])
  const icpWords = new Set<string>()
  for (const title of icpTitles) {
    for (const word of title.toLowerCase().split(/[\s,/]+/)) {
      if (word.length > 2 && !stopWords.has(word)) icpWords.add(word)
    }
  }
  const titleMatches = [...icpWords].filter(w => matchesWord(text, w))
  if (titleMatches.length >= 3) return { score: 0.5, matchedTopic: titleMatches.slice(0, 2).join(', '), method: 'title_keyword' }
  if (titleMatches.length === 2) return { score: 0.35, matchedTopic: titleMatches.join(', '), method: 'title_keyword' }
  if (titleMatches.length === 1) return { score: 0.2, matchedTopic: titleMatches[0], method: 'title_keyword' }

  return { score: 0, matchedTopic: null, method: 'none' }
}

// ═══ HAIKU ICP SCORING — semantic (accurate, runs server-side in cron) ═══

export async function getIcpRelevanceWithHaiku(
  text: string,
  icpTitles: string[],
  trackKeywords: string[]
): Promise<IcpRelevanceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return { score: 0, matchedTopic: null, method: 'none' }

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
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Rate how relevant this social media post is to someone targeting these buyers:

ICP titles: ${icpTitles.join(', ')}
Topics they care about: ${trackKeywords.join(', ')}

Post: "${text.substring(0, 300)}"

Output ONLY a JSON object: {"score": 0-10, "topic": "matched topic or null"}
- 0 = completely irrelevant (personal life, unrelated news)
- 3 = tangentially related
- 7 = clearly relevant to their industry/interests
- 10 = directly about their exact pain point`,
        }],
      }),
    })

    if (!resp.ok) return { score: 0, matchedTopic: null, method: 'none' }

    const result = await resp.json()
    const raw: string = result.content?.[0]?.text ?? ''
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    const parsed = JSON.parse(cleaned)
    const score = Math.min(10, Math.max(0, parsed.score ?? 0)) / 10 // normalize to 0-1
    return {
      score,
      matchedTopic: parsed.topic || null,
      method: 'haiku',
    }
  } catch {
    return { score: 0, matchedTopic: null, method: 'none' }
  }
}

// ═══ OPPORTUNITY SCORE ═══

export function getOpportunityScore(post: ScoredPost): number {
  const authorFollowers = post.authorFollowers ?? 100
  const ageHours = Math.max(0.5, (Date.now() - new Date(post.time).getTime()) / 3600000)
  const recencyDecay = Math.max(0, 1 - (ageHours / 24))
  const existingReplies = post.engagement?.replies ?? 0

  // log-normalize followers so 500K accounts don't always dominate
  return (Math.log(authorFollowers + 1) * recencyDecay) / (existingReplies + 1)
}

// ═══ ACTION RECOMMENDATION (GTM Action Framework) ═══

export function getRecommendation(post: ScoredPost): ActionRecommendation {
  const likes = post.engagement?.likes ?? 0
  const comments = post.engagement?.replies ?? 0
  const rts = post.engagement?.retweets ?? 0
  const totalEngagement = likes + comments + rts
  const ageHours = Math.max(0.5, (Date.now() - new Date(post.time).getTime()) / 3600000)
  const velocity = totalEngagement / ageHours
  const isLinkedIn = post.platform === 'linkedin'
  const isSubstantive = post.text.length >= 80

  type Action = { label: string; type: 'scrape' | 'reply' | 'repurpose' | 'skip'; priority: 'high' | 'medium' | 'low' }
  const actions: Action[] = []
  const reasons: string[] = []

  // REPLY — fresh + high engagement + reply won't get buried
  const replyWindowOpen = ageHours < 12
  const lowReplyCount = comments < 20
  const highVisibility = totalEngagement >= 20 || velocity >= 10

  if (replyWindowOpen && highVisibility && lowReplyCount) {
    const isTrending = velocity >= 10 && ageHours < 6
    if (isTrending) {
      actions.push({ label: 'Reply now — trending', type: 'reply', priority: 'high' })
      reasons.push(`${Math.round(velocity)}/hr velocity, reply window open`)
    } else if (likes >= 30 && comments < 5) {
      actions.push({ label: 'Reply — you\'ll stand out', type: 'reply', priority: 'high' })
      reasons.push(`${likes} likes but only ${comments} replies`)
    } else {
      actions.push({ label: 'Draft reply', type: 'reply', priority: 'medium' })
      reasons.push(`${totalEngagement} engagers, fresh post`)
    }
  }

  // SCRAPE — high comments (intent signal)
  const worthScraping = comments >= 10 || (isLinkedIn && totalEngagement >= 15)
  if (worthScraping) {
    if (comments >= 20 || (isLinkedIn && comments >= 10)) {
      actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'high' })
      reasons.push(`${comments} comments — high intent engagers`)
    } else {
      actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
      reasons.push(`${totalEngagement} engagers worth scraping`)
    }
  }

  // REPURPOSE — substantive text + some engagement
  if (isSubstantive && totalEngagement >= 5) {
    actions.push({ label: 'Use as content idea', type: 'repurpose', priority: 'medium' })
    reasons.push(`substantive insight worth repurposing`)
  }

  // SKIP
  if (actions.length === 0) {
    actions.push({ label: 'Skip', type: 'skip', priority: 'low' })
    return { actions, reason: 'Low value — not enough engagement or substance to act on.' }
  }

  return { actions, reason: reasons.join(' · ') }
}

// ═══ FULL POST SCORING ═══

export function scorePost(post: ScoredPost, config: UserScoringConfig): PostScore {
  const icpRelevance = getIcpRelevance(post.text, config)
  const opportunityScore = getOpportunityScore(post)
  const recommendation = getRecommendation(post)

  // Apply behavior-learned boosts
  let behaviorMultiplier = 1
  if (config.topicBoosts && icpRelevance.matchedTopic) {
    const boost = config.topicBoosts[icpRelevance.matchedTopic]
    if (boost) behaviorMultiplier = boost
  }

  // Final score: ICP relevance (biggest factor) + opportunity + priority
  const priorityScore = recommendation.actions[0]?.priority === 'high' ? 100
    : recommendation.actions[0]?.priority === 'medium' ? 30 : 1
  const totalEngagement = (post.engagement?.likes ?? 0) + (post.engagement?.replies ?? 0) + (post.engagement?.retweets ?? 0)

  const finalScore = (
    (icpRelevance.score > 0 ? 200 * icpRelevance.score : 0) +
    priorityScore +
    totalEngagement * 0.1
  ) * behaviorMultiplier

  return { opportunityScore, icpRelevance, recommendation, finalScore }
}

// ═══ BEHAVIOR TRACKING — learn from act/skip patterns ═══

export interface BehaviorEvent {
  postUrl: string
  topic: string | null
  action: 'acted' | 'skipped'
  actionType: string // 'reply' | 'scrape' | 'repurpose'
  timestamp: number
}

export function computeTopicBoosts(events: BehaviorEvent[]): Record<string, number> {
  // Group by topic, compute act rate
  const topicStats: Record<string, { acted: number; skipped: number }> = {}

  for (const event of events) {
    if (!event.topic) continue
    if (!topicStats[event.topic]) topicStats[event.topic] = { acted: 0, skipped: 0 }
    if (event.action === 'acted') topicStats[event.topic].acted++
    else topicStats[event.topic].skipped++
  }

  const boosts: Record<string, number> = {}
  for (const [topic, stats] of Object.entries(topicStats)) {
    const total = stats.acted + stats.skipped
    if (total < 5) continue // need minimum data
    const actRate = stats.acted / total
    // actRate 0.5 = neutral (1x), 1.0 = strong boost (1.5x), 0.0 = strong penalize (0.5x)
    boosts[topic] = 0.5 + actRate
  }

  return boosts
}
