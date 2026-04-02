// Growth Advisor — suggests goals and actionable items based on user data
// Uses playbook knowledge from growth-playbook-x.md and growth-playbook-linkedin.md

export interface GrowthStage {
  readonly stage: 'starter' | 'growing' | 'scaling'
  readonly label: string
  readonly followerRange: string
}

export interface GrowthSuggestion {
  readonly metric: string
  readonly target: number
  readonly period: 'daily' | 'weekly'
  readonly reason: string
  readonly priority: 'high' | 'medium' | 'low'
  readonly platform: 'x' | 'linkedin' | 'both'
  readonly category: 'engage' | 'create' | 'connect'
}

export interface GrowthPlan {
  readonly stage: GrowthStage
  readonly suggestions: readonly GrowthSuggestion[]
  readonly weeklyPlaybook: readonly string[]
  readonly topTip: string
}

// Determine growth stage from follower count
function getStage(followers: number): GrowthStage {
  if (followers < 500) return { stage: 'starter', label: 'Getting started', followerRange: '0-500' }
  if (followers < 2000) return { stage: 'growing', label: 'Building momentum', followerRange: '500-2K' }
  return { stage: 'scaling', label: 'Scaling up', followerRange: '2K+' }
}

// Generate suggestions for X based on growth stage
function xSuggestions(stage: GrowthStage['stage']): GrowthSuggestion[] {
  const suggestions: GrowthSuggestion[] = []

  // Replies — always the #1 growth lever on X
  const replyTargets = { starter: 5, growing: 10, scaling: 15 }
  suggestions.push({
    metric: 'x_replies',
    target: replyTargets[stage],
    period: 'daily',
    reason: 'Replies are 27x a like in algorithm weight. Reply to big accounts within 15 min of their posts.',
    priority: 'high',
    platform: 'x',
    category: 'engage',
  })

  // Threads
  const threadTargets = { starter: 1, growing: 2, scaling: 3 }
  suggestions.push({
    metric: 'x_threads',
    target: threadTargets[stage],
    period: 'weekly',
    reason: 'Threads get 3x more engagement and 60% more profile visits than single tweets.',
    priority: 'high',
    platform: 'x',
    category: 'create',
  })

  // Quote tweets
  if (stage !== 'starter') {
    suggestions.push({
      metric: 'x_quotes',
      target: stage === 'growing' ? 3 : 4,
      period: 'weekly',
      reason: 'Quote tweets carry 20x like weight. Add your take to viral posts in your niche.',
      priority: 'medium',
      platform: 'x',
      category: 'create',
    })
  }

  // Original posts
  const postTargets = { starter: 3, growing: 5, scaling: 5 }
  suggestions.push({
    metric: 'x_posts',
    target: postTargets[stage],
    period: 'daily',
    reason: 'Consistent posting maintains algorithmic favor. Mix text, images, and video.',
    priority: 'medium',
    platform: 'x',
    category: 'create',
  })

  return suggestions
}

// Generate suggestions for LinkedIn based on growth stage
// Based on 360Brew algorithm research: saves=5x likes, carousels=4x reach, comments=12-15x likes
function linkedinSuggestions(stage: GrowthStage['stage']): GrowthSuggestion[] {
  const suggestions: GrowthSuggestion[] = []

  // Comments — 76% of fast-growing accounts used this as primary tactic
  const commentTargets = { starter: 10, growing: 15, scaling: 20 }
  suggestions.push({
    metric: 'li_comments',
    target: commentTargets[stage],
    period: 'daily',
    reason: '76% of accounts that grew from sub-5K to 25K+ used strategic commenting. Comment within 60 min of their post, >15 words.',
    priority: 'high',
    platform: 'linkedin',
    category: 'engage',
  })

  // Posts
  const postTargets = { starter: 3, growing: 4, scaling: 5 }
  suggestions.push({
    metric: 'li_posts',
    target: postTargets[stage],
    period: 'weekly',
    reason: 'Quality over quantity. 3-5 posts/week is optimal. More than 2/day cannibalizes reach.',
    priority: 'high',
    platform: 'linkedin',
    category: 'create',
  })

  // Carousels — 4x reach, highest engagement at 6.60%
  const carouselTargets = { starter: 1, growing: 1, scaling: 2 }
  suggestions.push({
    metric: 'li_carousels',
    target: carouselTargets[stage],
    period: 'weekly',
    reason: 'Carousels get 4x reach vs text-only and 6.60% engagement rate. Repurpose X threads as slide decks.',
    priority: 'high',
    platform: 'linkedin',
    category: 'create',
  })

  // New connections
  suggestions.push({
    metric: 'li_connections',
    target: stage === 'starter' ? 20 : 10,
    period: 'daily',
    reason: 'Connect with people in your niche. Personalized notes get 3x acceptance rate. 20-30/day in starter phase.',
    priority: stage === 'starter' ? 'high' : 'medium',
    platform: 'linkedin',
    category: 'connect',
  })

  return suggestions
}

// Generate the full growth plan
export function generateGrowthPlan(
  xFollowers: number | null,
  liConnections: number | null,
  mode: 'personal_brand' | 'b2b_outbound'
): GrowthPlan {
  // Use X followers as primary metric for personal brand, LinkedIn for B2B
  const primaryFollowers = mode === 'b2b_outbound'
    ? (liConnections ?? 0)
    : (xFollowers ?? 0)

  const stage = getStage(primaryFollowers)
  const suggestions: GrowthSuggestion[] = []

  // Both modes get all suggestions — mode determines priority order
  suggestions.push(...xSuggestions(stage.stage))
  suggestions.push(...linkedinSuggestions(stage.stage))

  // Personal brand: X suggestions first (already pushed above)
  if (mode === 'personal_brand') {
    // Already have LinkedIn suggestions, just keep high-priority ones prominent
  }

  // Weekly playbook — ordered action items
  const playbook: string[] = []
  if (mode !== 'b2b_outbound') {
    playbook.push(
      `Reply to ${stage.stage === 'starter' ? 5 : stage.stage === 'growing' ? 10 : 15} posts/day from accounts with 50K+ followers (within 15 min of their post)`,
      `Publish ${stage.stage === 'starter' ? 1 : stage.stage === 'growing' ? 2 : 3} threads/week (actionable, save-worthy content)`,
      'Reply to every comment on your own posts within 15 minutes',
      'Never put links in main tweet — self-reply with the link',
    )
  }
  if (mode !== 'personal_brand' || mode === 'personal_brand') {
    playbook.push(
      `Comment on ${stage.stage === 'starter' ? 10 : 15} LinkedIn posts/day from industry leaders`,
      `Publish ${stage.stage === 'starter' ? 3 : 5} LinkedIn posts/week with strong hooks in first 2 lines`,
      'Spend 15 min engaging before publishing your own post (warms algorithm)',
    )
  }

  // Top tip based on stage
  const tips: Record<string, string> = {
    starter: 'Focus on replies. 70% of your time should be engaging with bigger accounts, 30% creating. This is the fastest path to your first 500 followers.',
    growing: 'Start threads and building in public. You have enough followers for your content to compound. 2-3 threads/week + daily replies = rapid growth.',
    scaling: 'Add video and collaborations. Your audience is big enough for cross-promotion. Quote tweet exchanges with other creators, co-threads, and 60-second video clips.',
  }

  return {
    stage,
    suggestions: suggestions.sort((a, b) => {
      const p = { high: 3, medium: 2, low: 1 }
      return p[b.priority] - p[a.priority]
    }),
    weeklyPlaybook: playbook,
    topTip: tips[stage.stage],
  }
}

// Format suggestions into a prompt-injectable string for the recommendation engine
export function growthPlanToPrompt(plan: GrowthPlan): string {
  const lines = [
    `USER GROWTH STAGE: ${plan.stage.label} (${plan.stage.followerRange} followers)`,
    `TOP TIP: ${plan.topTip}`,
    '',
    'WEEKLY TARGETS:',
    ...plan.suggestions
      .filter(s => s.priority === 'high')
      .map(s => `- ${s.metric}: ${s.target}/${s.period} (${s.reason.split('.')[0]})`),
    '',
    'PLAYBOOK:',
    ...plan.weeklyPlaybook.map((p, i) => `${i + 1}. ${p}`),
  ]
  return lines.join('\n')
}
