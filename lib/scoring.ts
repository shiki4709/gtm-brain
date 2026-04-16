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
  method: 'exact' | 'expanded' | 'topic_insight' | 'title_keyword' | 'haiku' | 'profile' | 'none'
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
  replyability: number // 0-1: how easy this post is to reply to
  hasContext: boolean  // false = too vague/short to act on, should be hidden
}

// ═══ SPAM / NOISE FILTERS ═══

export const SPAM_SIGNALS = /fan\s?meet|fan\s?ival|fancam|fanart|idol|k-?pop|bias|comeback|fancall|photocard|lightstick|aegyo|oppa|noona|ship\s?name|otp|stan|manga|anime|cosplay|horoscope|zodiac|♈|♉|♊|♋|♌|♍|♎|♏|♐|♑|♒|♓|cheek\s?kiss|shyly|😭😭|fot\b|geminifourth|lookkhunnoo|gmmtv|fourth\s?nattawat|gem\s?fourth|nattawat|praew|คั่นกู|mercury\s*retrograde|birth\s*chart|sun\s*sign|moon\s*sign|rising\s*sign|astrology|tarot|natal\s*chart|star\s*sign/i

// General non-tech personal context — catches "my name is Claude", "I'm a Gemini", etc.
export const NAME_USAGE_SIGNALS = /\b(my name is|i'?m a|born in|birthday|born on|my sign)\b.*\b(gemini|claude|sage|bloom|aurora|titan)\b/i

export const EMOJI_HEAVY = /(?:😭|😍|🥺|💕|💞|❤️|🫶|😆|🤣|💗|🥰|😘){3,}/

export const TECH_CONTEXT = /\bapi\b|startup|saas|b2b|founder|shipped|deploy|code|developer|engineer|benchmark|token|context window|fine.?tun|inference|parameter|prompt|llm|ml\b|neural|training|dataset|vc\b|series [a-c]|ipo|revenue|arr\b|pipeline|funnel|conversion|product|launch|build|ship|growth|metric/i

// Ambiguous keywords: tech term vs common meaning
// Each entry maps the keyword to noise signals that indicate non-tech usage
// If ANY noise signal matches AND no tech context is found, the post is filtered
export const AMBIGUOUS_KEYWORDS: Record<string, RegExp> = {
  gemini: /season|energy|sun\b|moon\b|rising|traits|compatibility|vibes|woman|man|men|women|gang|squad|era|baby|♊|zodiac|astrology|horoscope|birth\s*chart|natal|star\s*sign/i,
  claude: /my\s+(name|dog|cat|son|dad|brother|friend|boyfriend|husband)|claude\s+(the|is a|van|debussy|monet|rains)|saint.?claude/i,
  model: /runway|fashion|shoot|photoshoot|portfolio|casting|supermodel|victoria.?s secret|catwalk|vogue|posing/i,
  agents: /real\s*estate|travel\s*agent|insurance|booking|fbi|cia|secret\s*agent|double\s*agent|estate\s*agent|talent\s*agent/i,
  agent: /real\s*estate|travel\s*agent|insurance|booking|fbi|cia|secret\s*agent|double\s*agent|estate\s*agent|talent\s*agent/i,
  transformer: /optimus|megatron|bumblebee|decepticon|autobot|hasbro|movie|electrical|voltage|power\s*grid/i,
  copilot: /cockpit|aviation|pilot\s*seat|co.?pilot.*plane|flight/i,
  sage: /herb|spice|cooking|recipe|smudge|burning\s*sage|sage\s*green|sage\s*advice/i,
  llama: /animal|farm|zoo|alpaca|wool|spit|cute\s*llama/i,
  falcon: /bird|hunting|nest|peregrine|millennium\s*falcon|atlanta\s*falcon/i,
  bloom: /flower|garden|spring|blossom|orlando\s*bloom/i,
  palm: /tree|beach|hand|palm\s*reading|palm\s*springs|palm\s*oil/i,
  bard: /shakespeare|poet|poetry|medieval|celtic/i,
  titan: /greek|mythology|attack\s*on\s*titan|tennessee\s*titan/i,
  aurora: /northern\s*lights|borealis|disney|princess|colorado/i,
  mistral: /wind|weather|south\s*of\s*france|provence/i,
}

export function isSpamContent(text: string): boolean {
  if (SPAM_SIGNALS.test(text)) return true
  if (NAME_USAGE_SIGNALS.test(text)) return true
  // Heavy emoji posts without any tech context = entertainment
  if (EMOJI_HEAVY.test(text) && !TECH_CONTEXT.test(text)) return true
  return false
}

// ═══ WORD BOUNDARY MATCHING ═══

function matchesWord(text: string, word: string): boolean {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  return re.test(text)
}

// ═══ RELATED TERMS EXPANSION ═══

export const RELATED_TERMS: Record<string, string[]> = {
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

// ═══ ICP RELEVANCE — keyword-based with spam filtering (fast, runs client-side) ═══

export interface ProfileScoreOverride {
  score: number
  topic: string | null
  reason: string
}

export function getIcpRelevance(
  text: string,
  config: UserScoringConfig,
  profileScore?: ProfileScoreOverride | null,
): IcpRelevanceResult {
  // Use AI profile scores when available
  if (profileScore && profileScore.score > 0) {
    return { score: profileScore.score, matchedTopic: profileScore.topic, method: 'profile' }
  }

  return getIcpRelevanceKeywords(text, config)
}

/** Pure keyword-based ICP relevance with spam filtering and ambiguous keyword handling */
export function getIcpRelevanceKeywords(text: string, config: UserScoringConfig): IcpRelevanceResult {
  const { trackKeywords, icpTitles, topicInsights } = config

  // Filter out spam/fan content that false-matches keywords like "gemini"
  if (isSpamContent(text)) return { score: 0, matchedTopic: null, method: 'none' }

  const hasTechContext = TECH_CONTEXT.test(text)

  // 1. User-defined track keywords — exact match (strongest)
  const exactMatches = trackKeywords.filter(kw => matchesWord(text, kw))
  if (exactMatches.length >= 2) return { score: 0.6, matchedTopic: exactMatches.slice(0, 2).join(', '), method: 'exact' }
  if (exactMatches.length === 1) {
    // If the only match is an ambiguous keyword, check for noise signals or require tech context
    const noisePattern = AMBIGUOUS_KEYWORDS[exactMatches[0].toLowerCase()]
    if (noisePattern) {
      // If noise signals present → definitely not tech
      if (noisePattern.test(text)) return { score: 0, matchedTopic: null, method: 'none' }
      // If no noise signals but also no tech context → too risky, skip
      if (!hasTechContext) return { score: 0, matchedTopic: null, method: 'none' }
    }
    return { score: 0.4, matchedTopic: exactMatches[0], method: 'exact' }
  }

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

// ═══ PLAYBOOK BONUS SCORING ═══

export interface PlaybookBonusInput {
  ageHours: number
  likes: number
  comments: number
  text: string
}

/** Calculate playbook-informed bonus score for feed ranking */
export function getPlaybookBonus(input: PlaybookBonusInput): number {
  let bonus = 0

  // Early window bonus — playbook says first 15 min (X) / 60-90 min (LinkedIn) is everything
  if (input.ageHours < 0.25) bonus += 80 // under 15 min = huge bonus
  else if (input.ageHours < 1.5) bonus += 40 // under 90 min = good bonus
  else if (input.ageHours < 3) bonus += 15 // under 3 hours = small bonus

  // Like-to-reply ratio bonus — playbook says high likes + low replies = your reply stands out
  if (input.likes >= 30 && input.comments < 5) bonus += 50

  // Save-worthy content bonus — playbook says bookmarks = 5-10x a like
  const hasFramework = /step|framework|system|playbook|process|how to/i.test(input.text)
  const hasData = /\d+%|\$\d|x\d|\d+x/i.test(input.text)
  if (hasFramework) bonus += 25
  if (hasData) bonus += 20

  return bonus
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

// ═══ HAIKU PROFILE SCORING — uses rich user profile for semantic scoring ═══

export async function getIcpRelevanceWithProfile(
  text: string,
  profileText: string,
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
          content: `Rate how relevant this social media post is to this user:

USER PROFILE:
${profileText.substring(0, 1500)}

Post: "${text.substring(0, 300)}"

Output ONLY a JSON object: {"score": 0-10, "topic": "matched topic or null"}
- 0 = completely irrelevant (personal life, entertainment, unrelated news)
- 3 = tangentially related
- 7 = clearly relevant to their interests/industry
- 10 = directly about their focus area or pain point
Score based on semantic meaning, not keyword matching.`,
        }],
      }),
    })

    if (!resp.ok) return { score: 0, matchedTopic: null, method: 'none' }

    const result = await resp.json()
    const raw: string = result.content?.[0]?.text ?? ''
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    const parsed = JSON.parse(cleaned)
    const score = Math.min(10, Math.max(0, parsed.score ?? 0)) / 10
    return {
      score,
      matchedTopic: parsed.topic || null,
      method: 'profile',
    }
  } catch {
    return { score: 0, matchedTopic: null, method: 'none' }
  }
}

// ═══ REPLYABILITY — how easy is this post to reply to? ═══

/** Returns 0-1 score for how "replyable" a post is */
export function getReplyability(text: string): number {
  let score = 0

  // Questions are the easiest to reply to
  if (/\?/.test(text)) score += 0.3

  // Clear opinions/takes invite agreement or pushback
  if (/\b(I think|I believe|unpopular opinion|hot take|controversial|IMO|my take|here'?s the thing|the truth is|stop saying|you don'?t need)\b/i.test(text)) score += 0.25

  // Lists/frameworks/how-tos are easy to add to
  if (/\b(step \d|tip[s ]?\d|\d\.\s|here'?s how|lessons? learned|mistake[s ]?\w+ make|things? I wish)\b/i.test(text)) score += 0.2

  // Data/stats give you something concrete to respond to
  if (/\d+%|\$[\d,]+[KMB]?|\dx\b|\d+x\b/i.test(text)) score += 0.15

  // Longer posts with substance are easier to engage with
  if (text.length >= 150) score += 0.1

  return Math.min(1, score)
}

/** Returns false if the post lacks enough context to reply meaningfully */
export function hasReplyContext(text: string): boolean {
  const stripped = text.replace(/https?:\/\/\S+/g, '').replace(/@\w+/g, '').trim()

  // Too short after removing links/mentions — nothing to reply to
  if (stripped.length < 30) return false

  // Just a link share with no commentary
  if (/^https?:\/\/\S+\s*$/.test(text.trim())) return false

  // Just emojis or single word
  if (/^[\s\p{Emoji}\p{Emoji_Component}]+$/u.test(stripped)) return false

  // "Check this out" / "This 👆" / "100%" type low-context posts
  if (/^(this[.!]?|check this|so true|facts?|100%|exactly|yep|nah|lol|real|W take|L take)\s*[\p{Emoji}\p{Emoji_Component}]*$/iu.test(stripped)) return false

  return true
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
  const replyability = getReplyability(post.text)
  const context = hasReplyContext(post.text)

  // Apply behavior-learned boosts
  let behaviorMultiplier = 1
  if (config.topicBoosts && icpRelevance.matchedTopic) {
    const boost = config.topicBoosts[icpRelevance.matchedTopic]
    if (boost) behaviorMultiplier = boost
  }

  // Final score: ICP relevance (biggest factor) + replyability + opportunity + priority
  const priorityScore = recommendation.actions[0]?.priority === 'high' ? 100
    : recommendation.actions[0]?.priority === 'medium' ? 30 : 1
  const totalEngagement = (post.engagement?.likes ?? 0) + (post.engagement?.replies ?? 0) + (post.engagement?.retweets ?? 0)

  const finalScore = (
    (icpRelevance.score > 0 ? 200 * icpRelevance.score : 0) +
    replyability * 80 + // easy-to-reply posts get boosted even without high engagement
    priorityScore +
    totalEngagement * 0.1
  ) * behaviorMultiplier

  return { opportunityScore, icpRelevance, recommendation, finalScore, replyability, hasContext: context }
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
