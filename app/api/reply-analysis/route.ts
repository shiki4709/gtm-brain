import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Deep analysis of reply patterns — what style works, who engages, why

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const xHandle = auth.dbUser.x_handle
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''

  if (!xHandle || !socialDataKey) {
    return NextResponse.json({ success: true, analysis: null, message: 'Connect your X handle in Settings' })
  }

  // 1. Fetch user's recent tweets (replies + posts)
  const resp = await fetch(
    `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(`from:${xHandle}`)}&type=Latest`,
    {
      headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    }
  )

  if (!resp.ok) {
    return NextResponse.json({ success: true, analysis: null, message: 'Could not fetch tweets' })
  }

  const data = await resp.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tweets = (data.tweets ?? []) as any[]

  // Separate replies and posts, with engagement
  const replies = tweets
    .filter((tw: { in_reply_to_status_id_str?: string }) => tw.in_reply_to_status_id_str)
    .map((tw: { full_text?: string; text?: string; favorite_count?: number; reply_count?: number; retweet_count?: number; in_reply_to_screen_name?: string; id_str?: string }) => ({
      text: ((tw.full_text ?? tw.text ?? '') as string).replace(/^@\w+\s*/g, '').trim(),
      likes: tw.favorite_count ?? 0,
      replies: tw.reply_count ?? 0,
      retweets: tw.retweet_count ?? 0,
      replyTo: tw.in_reply_to_screen_name ?? '',
      total: (tw.favorite_count ?? 0) + (tw.reply_count ?? 0) + (tw.retweet_count ?? 0),
    }))
    .sort((a: { total: number }, b: { total: number }) => b.total - a.total)

  const posts = tweets
    .filter((tw: { in_reply_to_status_id_str?: string | null; full_text?: string; text?: string }) => !tw.in_reply_to_status_id_str && !((tw.full_text ?? tw.text ?? '') as string).startsWith('RT @'))
    .map((tw: { full_text?: string; text?: string; favorite_count?: number; reply_count?: number; retweet_count?: number }) => ({
      text: (tw.full_text ?? tw.text ?? '') as string,
      likes: tw.favorite_count ?? 0,
      replies: tw.reply_count ?? 0,
      retweets: tw.retweet_count ?? 0,
      total: (tw.favorite_count ?? 0) + (tw.reply_count ?? 0) + (tw.retweet_count ?? 0),
    }))
    .sort((a: { total: number }, b: { total: number }) => b.total - a.total)

  // 2. Fetch who replies TO the user
  let repliers: Array<{ handle: string; name: string; bio: string; followers: number; replyText: string }> = []
  try {
    const toResp = await fetch(
      `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(`to:${xHandle}`)}&type=Latest`,
      {
        headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (toResp.ok) {
      const toData = await toResp.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      repliers = (toData.tweets ?? []).slice(0, 20).map((tw: any) => ({
        handle: tw.user?.screen_name ?? '',
        name: tw.user?.name ?? '',
        bio: (tw.user?.description ?? '').substring(0, 150),
        followers: tw.user?.followers_count ?? 0,
        replyText: ((tw.full_text ?? tw.text ?? '') as string).substring(0, 200),
      }))
    }
  } catch { /* skip */ }

  // 3. Use Haiku to analyze patterns
  if (!apiKey || replies.length < 3) {
    return NextResponse.json({
      success: true,
      analysis: null,
      message: 'Need more replies to analyze patterns',
      raw: { topReplies: replies.slice(0, 5), topPosts: posts.slice(0, 3), recentRepliers: repliers.slice(0, 5) },
    })
  }

  const topRepliesSample = replies.slice(0, 8).map((r: { text: string; likes: number; replies: number; replyTo: string }, i: number) =>
    `[${i}] To @${r.replyTo}: "${r.text}" (${r.likes} likes, ${r.replies} replies)`
  ).join('\n')

  const lowRepliesSample = replies.slice(-5).map((r: { text: string; likes: number; replyTo: string }, i: number) =>
    `[${i}] To @${r.replyTo}: "${r.text}" (${r.likes} likes)`
  ).join('\n')

  const repliersSample = repliers.slice(0, 10).map((r, i) =>
    `[${i}] @${r.handle} (${r.followers} followers, "${r.bio.substring(0, 80)}"): "${r.replyText.substring(0, 100)}"`
  ).join('\n')

  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: `Analyze this person's X/Twitter engagement patterns. Be specific and actionable.

TOP PERFORMING REPLIES (highest engagement):
${topRepliesSample}

LOW PERFORMING REPLIES (lowest engagement):
${lowRepliesSample}

PEOPLE WHO REPLY TO THEM:
${repliersSample}

Return ONLY a JSON object:
{
  "replyStyle": "2 sentences: what reply STYLE works (contrarian? question? data point? humor? one-liner?). Compare high vs low performing.",
  "whoEngages": "2 sentences: WHO engages — are they post authors replying back, or other followers? What's their profile (founders, devs, VCs)?",
  "whyTheyEngage": "2 sentences: WHY people engage — what triggers them (controversy? useful info? humor? personal experience?)",
  "topTactic": "1 sentence: the single most effective tactic based on the data",
  "avoid": "1 sentence: what to stop doing based on low-performing replies"
}` }],
      }),
    })

    if (!aiResp.ok) throw new Error('AI failed')

    const aiResult = await aiResp.json()
    const raw = aiResult.content?.[0]?.text ?? ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const analysis = JSON.parse(cleaned)

    // Cache to sb_insights so draft-reply can read it
    await auth.sb.from('sb_insights').insert({
      user_id: auth.dbUser.id,
      insight_type: 'reply_analysis',
      insight_data: analysis,
      confidence: 0.8,
    })

    return NextResponse.json({
      success: true,
      analysis,
      raw: { topReplies: replies.slice(0, 5), topPosts: posts.slice(0, 3), recentRepliers: repliers.slice(0, 5) },
    })
  } catch {
    return NextResponse.json({
      success: true,
      analysis: null,
      message: 'Analysis generation failed',
      raw: { topReplies: replies.slice(0, 5), topPosts: posts.slice(0, 3), recentRepliers: repliers.slice(0, 5) },
    })
  }
}
