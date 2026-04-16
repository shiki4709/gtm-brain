import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude } from '@/lib/claude'

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, author } = await request.json() as { text?: string; author?: string }
  if (!text) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const { text: explanation } = await callClaude(
    `Explain this ${author ? `post by ${author}` : 'social media post'} in 1-2 plain English sentences. What is the person saying, and why does it matter? Assume the reader is a tech professional who may not know the specific product or context being referenced.

Post: "${text.substring(0, 500)}"

Rules:
- Be concise — max 2 sentences
- Explain jargon, product names, or inside references
- Say what the opinion/claim is, not just the topic
- Output ONLY the explanation`,
    { maxTokens: 150 }
  )

  return NextResponse.json({ explanation: explanation.trim() })
}
