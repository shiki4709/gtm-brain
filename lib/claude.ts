// Shared Claude API caller — DRYs up repeated fetch logic across all API routes

type ClaudeModel = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6'

interface ClaudeCallOptions {
  readonly model?: ClaudeModel
  readonly maxTokens?: number
  readonly system?: string
}

interface ClaudeResponse {
  readonly text: string
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number }
}

export async function callClaude(
  prompt: string,
  options: ClaudeCallOptions = {}
): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const {
    model = 'claude-haiku-4-5-20251001',
    maxTokens = 500,
    system,
  } = options

  const messages = [{ role: 'user' as const, content: prompt }]

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  }
  if (system) {
    body.system = system
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => '')
    throw new Error(`Claude API error ${resp.status}: ${errorBody}`)
  }

  const result = await resp.json()
  const text: string = result.content?.[0]?.text ?? ''
  const usage = {
    inputTokens: (result.usage?.input_tokens as number) ?? 0,
    outputTokens: (result.usage?.output_tokens as number) ?? 0,
  }

  return { text, usage }
}

// Parse JSON from Claude response, handling markdown code blocks
export function parseClaudeJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(cleaned) as T
}
