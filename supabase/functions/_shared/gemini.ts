declare const Deno: any

type GeminiErrorPayload = {
  error?: {
    message?: string
  }
}

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>
  }
}

type GeminiResponse = {
  candidates?: GeminiCandidate[]
} & GeminiErrorPayload

export type GeminiVariantResult = {
  text: string | null
  error: string | null
  model: string
  promptVersion: string
  latencyMs: number
}

const promptVersion = 'v1'

function geminiModel() {
  return Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
}

function buildPrompt(baseMessage: string, commentText: string) {
  const base = baseMessage.trim()
  const comment = commentText.trim().slice(0, 500)

  return [
    'Rewrite the BASE MESSAGE as a natural variation.',
    'Constraints:',
    '- Preserve the exact meaning and commitments.',
    '- Keep the same language and tone intensity.',
    '- Do not add new facts, promises, or calls to action.',
    '- Do not quote or mention the comment unless the base message already does.',
    '- Output a single message only, no quotes, no markdown.',
    '',
    'BASE MESSAGE:',
    base,
    '',
    'COMMENT (context only):',
    comment.length ? comment : '(none)',
  ].join('\n')
}

function parseGeminiText(data: GeminiResponse | null) {
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((part) => part.text ?? '').join('').trim()
  return text.length ? text : null
}

export async function generateGeminiVariant(args: {
  baseMessage: string
  commentText: string
}): Promise<GeminiVariantResult> {
  const model = geminiModel()
  const apiKey = Deno.env.get('GEMINI_API_KEY')

  if (!apiKey) {
    return {
      text: null,
      error: 'Missing GEMINI_API_KEY',
      model,
      promptVersion,
      latencyMs: 0,
    }
  }

  const prompt = buildPrompt(args.baseMessage, args.commentText)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  const startedAt = Date.now()

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 160,
          },
        }),
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timeout))

    const latencyMs = Date.now() - startedAt
    const raw = await res.text()
    let data: GeminiResponse | null = null
    try {
      data = JSON.parse(raw) as GeminiResponse
    } catch {
      data = null
    }

    if (!res.ok) {
      const message = data?.error?.message ?? `Gemini request failed (${res.status})`
      return { text: null, error: message, model, promptVersion, latencyMs }
    }

    const text = parseGeminiText(data)
    if (!text) {
      return { text: null, error: 'Gemini response missing text', model, promptVersion, latencyMs }
    }

    return { text, error: null, model, promptVersion, latencyMs }
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    return {
      text: null,
      error: error instanceof Error ? error.message : 'Gemini request failed',
      model,
      promptVersion,
      latencyMs,
    }
  }
}
