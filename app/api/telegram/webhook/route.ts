import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Telegram Bot Webhook — receives button presses and /start commands
// Set webhook: POST https://api.telegram.org/bot{TOKEN}/setWebhook
//   body: { url: "https://gtm-brain-roan.vercel.app/api/telegram/webhook" }

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''

interface TelegramUpdate {
  update_id: number
  message?: {
    chat: { id: number }
    text?: string
    from?: { id: number; first_name?: string; username?: string }
  }
  callback_query?: {
    id: string
    data?: string
    message?: { chat: { id: number } }
    from?: { id: number; first_name?: string; username?: string }
  }
}

export async function POST(request: Request) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ ok: false, error: 'Bot not configured' })
  }

  // Verify request is from Telegram using secret token header
  if (WEBHOOK_SECRET) {
    const token = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
    if (token !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 403 })
    }
  }

  const update: TelegramUpdate = await request.json()
  const sb = createServiceClient()

  // Handle /start command — user connecting their Telegram
  if (update.message?.text?.startsWith('/start')) {
    const chatId = update.message.chat.id
    const parts = update.message.text.split(' ')
    const linkToken = parts[1] // /start <linkToken>

    if (linkToken) {
      // Link this chat_id to the user who generated the token
      const { data: user } = await sb
        .from('sb_users')
        .select('id, notification_channels')
        .eq('id', linkToken)
        .single()

      if (user) {
        const channels: Array<{ type: string; chat_id?: string; webhook_url?: string }> = user.notification_channels ?? []

        // Remove existing telegram channel if any, then add new one
        const filtered = channels.filter(c => c.type !== 'telegram')
        filtered.push({ type: 'telegram', chat_id: String(chatId) })

        await sb
          .from('sb_users')
          .update({
            notification_channels: filtered,
            telegram_connected: true,
          })
          .eq('id', user.id)

        await sendTelegramMessage(chatId, [
          'Connected to GTM Brain!',
          '',
          "You'll get notifications when high-value posts appear in your feed.",
          '',
          'Commands:',
          '/status — Check connection',
          '/pause — Pause notifications',
          '/resume — Resume notifications',
        ].join('\n'))

        return NextResponse.json({ ok: true })
      }
    }

    // No token or invalid — show help
    await sendTelegramMessage(chatId, [
      'Welcome to GTM Brain Bot!',
      '',
      'To connect, go to Settings in the GTM Brain app and click "Connect Telegram".',
      '',
      "That will give you a link that connects this chat to your account.",
    ].join('\n'))

    return NextResponse.json({ ok: true })
  }

  // Handle /status command
  if (update.message?.text === '/status') {
    const chatId = update.message.chat.id
    const { data: user } = await sb
      .from('sb_users')
      .select('id, name, notification_channels')
      .filter('notification_channels', 'cs', JSON.stringify([{ type: 'telegram', chat_id: String(chatId) }]))
      .single()

    if (user) {
      await sendTelegramMessage(chatId, `Connected as ${user.name ?? 'GTM Brain user'}. Notifications are active.`)
    } else {
      await sendTelegramMessage(chatId, 'Not connected. Go to GTM Brain Settings to connect.')
    }
    return NextResponse.json({ ok: true })
  }

  // Handle /pause command
  if (update.message?.text === '/pause') {
    const chatId = update.message.chat.id
    const { data: user } = await findUserByChatId(sb, String(chatId))
    if (user) {
      const channels: Array<{ type: string; chat_id?: string; webhook_url?: string; paused?: boolean }> = user.notification_channels ?? []
      const updated = channels.map(c =>
        c.type === 'telegram' ? { ...c, paused: true } : c
      )
      await sb.from('sb_users').update({ notification_channels: updated }).eq('id', user.id)
      await sendTelegramMessage(chatId, 'Notifications paused. Send /resume to restart.')
    }
    return NextResponse.json({ ok: true })
  }

  // Handle /resume command
  if (update.message?.text === '/resume') {
    const chatId = update.message.chat.id
    const { data: user } = await findUserByChatId(sb, String(chatId))
    if (user) {
      const channels: Array<{ type: string; chat_id?: string; webhook_url?: string; paused?: boolean }> = user.notification_channels ?? []
      const updated = channels.map(c =>
        c.type === 'telegram' ? { ...c, paused: false } : c
      )
      await sb.from('sb_users').update({ notification_channels: updated }).eq('id', user.id)
      await sendTelegramMessage(chatId, 'Notifications resumed!')
    }
    return NextResponse.json({ ok: true })
  }

  // Handle callback_query (inline button presses)
  if (update.callback_query) {
    const callbackId = update.callback_query.id
    const data = update.callback_query.data ?? ''
    const chatId = update.callback_query.message?.chat.id

    // Acknowledge the button press immediately
    await answerCallbackQuery(callbackId)

    // Parse action: "act:URL_PREFIX", "skip:URL_PREFIX", or "edit:URL_PREFIX"
    const colonIdx = data.indexOf(':')
    const action = colonIdx >= 0 ? data.substring(0, colonIdx) : data
    const urlPrefix = colonIdx >= 0 ? data.substring(colonIdx + 1) : ''

    if (urlPrefix && chatId) {
      const { data: user } = await findUserByChatId(sb, String(chatId))
      if (user) {
        // Find the notification
        const { data: notif } = await sb
          .from('sb_notifications')
          .select('id, post_url, action_type, draft_text')
          .eq('user_id', user.id)
          .like('post_url', `%${urlPrefix}%`)
          .order('pushed_at', { ascending: false })
          .limit(1)
          .single()

        if (notif) {
          if (action === 'edit') {
            // Generate a new draft reply
            await sendTelegramMessage(chatId, 'Generating new draft...')
            const newDraft = await generateNewDraft(notif.post_url)
            if (newDraft) {
              // Update the stored draft
              await sb.from('sb_notifications').update({ draft_text: newDraft }).eq('id', notif.id)
              await sendTelegramMessage(chatId, `New draft:\n\n"${newDraft}"`)
            } else {
              await sendTelegramMessage(chatId, 'Could not generate a new draft. Try again.')
            }
          } else {
            const status = action === 'act' ? 'acted' : 'skipped'

            await sb
              .from('sb_notifications')
              .update({ status, acted_at: new Date().toISOString() })
              .eq('id', notif.id)

            await sb.from('action_log').insert({
              user_id: user.id,
              action_type: status === 'acted' ? notif.action_type : 'notification_skip',
              post_id: notif.post_url,
              platform: notif.post_url.includes('linkedin') ? 'linkedin' : 'x',
              metadata: { source: 'telegram', notification_id: notif.id },
            })

            if (status === 'acted' && notif.draft_text) {
              await sendTelegramMessage(chatId, `Copy this reply:\n\n${notif.draft_text}`)
            } else if (status === 'acted') {
              await sendTelegramMessage(chatId, 'Marked as done!')
            } else {
              await sendTelegramMessage(chatId, 'Skipped.')
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}

// --- Helpers ---

async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(() => {})
}

async function answerCallbackQuery(callbackId: string) {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
  }).catch(() => {})
}

async function findUserByChatId(sb: ReturnType<typeof createServiceClient>, chatId: string) {
  return sb
    .from('sb_users')
    .select('id, name, notification_channels')
    .filter('notification_channels', 'cs', JSON.stringify([{ type: 'telegram', chat_id: chatId }]))
    .single()
}

async function generateNewDraft(postUrl: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return null

  // Fetch the post text from SocialData if it's an X post
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
  let postText = ''

  if (socialDataKey && postUrl.includes('x.com')) {
    const tweetId = postUrl.split('/status/')[1]?.split('?')[0]
    if (tweetId) {
      try {
        const resp = await fetch(
          `https://api.socialdata.tools/twitter/tweets/${tweetId}`,
          {
            headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        )
        if (resp.ok) {
          const tweet = await resp.json()
          postText = tweet.full_text ?? tweet.text ?? ''
        }
      } catch { /* */ }
    }
  }

  if (!postText) return null

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
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Write a DIFFERENT reply to this tweet. Take a completely different angle from any previous reply.

"${postText.substring(0, 300)}"

Rules:
- 1-2 sentences, under 200 characters
- Use contractions, short sentences
- Reference something specific from the post
- Add value: data point, experience, or question
- NEVER start with "Great insight!", "So true!", "Love this!"
- Sound human, not like a bot
- Output ONLY the reply text`,
        }],
      }),
    })

    if (!resp.ok) return null
    const result = await resp.json()
    return (result.content?.[0]?.text ?? '').trim() || null
  } catch {
    return null
  }
}
