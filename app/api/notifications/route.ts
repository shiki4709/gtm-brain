import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Manage notification channels (Telegram, Slack)

// GET — list channels + recent notification history
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const channels = auth.dbUser.notification_channels ?? []
  const timezone = (auth.dbUser as Record<string, unknown>).timezone ?? 'America/Los_Angeles'

  // Recent notifications
  const { data: recent } = await auth.sb
    .from('sb_notifications')
    .select('id, channel, post_url, action_type, draft_text, score, status, pushed_at, acted_at')
    .eq('user_id', auth.dbUser.id)
    .order('pushed_at', { ascending: false })
    .limit(20)

  const dbRow = auth.dbUser as Record<string, unknown>

  return NextResponse.json({
    success: true,
    channels,
    timezone,
    notificationMode: dbRow.notification_mode ?? 'realtime',
    digestHour: dbRow.digest_hour ?? 9,
    replyStyle: dbRow.reply_style ?? 'balanced',
    maxDailyPosts: dbRow.max_daily_posts ?? 5,
    telegramConnected: auth.dbUser.telegram_connected ?? false,
    // Generate a Telegram deep link for connecting
    telegramLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME ?? 'gtm_brain_bot'}?start=${auth.dbUser.id}`,
    recentNotifications: recent ?? [],
  })
}

// POST — add or update a notification channel
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    action: 'add_slack' | 'remove_telegram' | 'remove_slack' | 'update_timezone' | 'test_telegram' | 'test_slack' | 'update_settings'
    webhook_url?: string
    timezone?: string
    notification_mode?: 'realtime' | 'digest'
    digest_hour?: number
    reply_style?: 'balanced' | 'spicy'
    max_daily_posts?: number
  }

  const channels: Array<{ type: string; chat_id?: string; webhook_url?: string }> = auth.dbUser.notification_channels ?? []

  switch (body.action) {
    case 'add_slack': {
      if (!body.webhook_url) {
        return NextResponse.json({ success: false, error: 'Slack webhook URL required' }, { status: 400 })
      }
      // Validate it looks like a Slack webhook
      if (!body.webhook_url.startsWith('https://hooks.slack.com/')) {
        return NextResponse.json({ success: false, error: 'Invalid Slack webhook URL' }, { status: 400 })
      }
      const filtered = channels.filter(c => c.type !== 'slack')
      filtered.push({ type: 'slack', webhook_url: body.webhook_url })

      await auth.sb
        .from('sb_users')
        .update({ notification_channels: filtered })
        .eq('id', auth.dbUser.id)

      return NextResponse.json({ success: true, channels: filtered })
    }

    case 'remove_telegram': {
      const filtered = channels.filter(c => c.type !== 'telegram')
      await auth.sb
        .from('sb_users')
        .update({ notification_channels: filtered, telegram_connected: false })
        .eq('id', auth.dbUser.id)

      return NextResponse.json({ success: true, channels: filtered })
    }

    case 'remove_slack': {
      const filtered = channels.filter(c => c.type !== 'slack')
      await auth.sb
        .from('sb_users')
        .update({ notification_channels: filtered })
        .eq('id', auth.dbUser.id)

      return NextResponse.json({ success: true, channels: filtered })
    }

    case 'update_timezone': {
      if (!body.timezone) {
        return NextResponse.json({ success: false, error: 'Timezone required' }, { status: 400 })
      }
      await auth.sb
        .from('sb_users')
        .update({ timezone: body.timezone })
        .eq('id', auth.dbUser.id)

      return NextResponse.json({ success: true })
    }

    case 'test_telegram': {
      const telegram = channels.find(c => c.type === 'telegram')
      if (!telegram?.chat_id) {
        return NextResponse.json({ success: false, error: 'Telegram not connected' }, { status: 400 })
      }
      const token = process.env.TELEGRAM_BOT_TOKEN ?? ''
      if (!token) {
        return NextResponse.json({ success: false, error: 'Bot not configured' }, { status: 500 })
      }

      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegram.chat_id,
          text: 'Test notification from GTM Brain! Your Telegram is connected and working.',
        }),
      })

      if (!resp.ok) {
        return NextResponse.json({ success: false, error: 'Failed to send test message' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    case 'test_slack': {
      const slack = channels.find(c => c.type === 'slack')
      if (!slack?.webhook_url) {
        return NextResponse.json({ success: false, error: 'Slack not connected' }, { status: 400 })
      }

      const resp = await fetch(slack.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Test notification from GTM Brain! Your Slack is connected and working.',
        }),
      })

      if (!resp.ok) {
        return NextResponse.json({ success: false, error: 'Failed to send test message' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    case 'update_settings': {
      const updates: Record<string, unknown> = {}
      if (body.notification_mode) updates.notification_mode = body.notification_mode
      if (body.digest_hour != null) updates.digest_hour = body.digest_hour
      if (body.reply_style) updates.reply_style = body.reply_style
      if (body.max_daily_posts != null) updates.max_daily_posts = body.max_daily_posts

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ success: false, error: 'No settings to update' }, { status: 400 })
      }

      await auth.sb
        .from('sb_users')
        .update(updates)
        .eq('id', auth.dbUser.id)

      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  }
}
