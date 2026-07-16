// Anthropic API sometimes returns a transient 5xx/overloaded_error under load — retry a
// couple of times with a short backoff before giving up, instead of failing the whole
// upload/extraction on what's usually a few-second blip.
export async function callAnthropic(apiKey: string, body: unknown, maxRetries = 2): Promise<Response> {
  let lastResponse: Response
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (response.ok) return response

    lastResponse = response
    const isRetryable = response.status === 429 || response.status === 529 || response.status >= 500
    if (!isRetryable || attempt === maxRetries) return response

    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
  }
  return lastResponse!
}

export type JsonExtractResult =
  | { ok: true; parsed: any }
  | { ok: false; error: string; status: number }

// The model occasionally returns truncated/malformed JSON (independent of the HTTP-level
// retries above — the call itself succeeds, the text just doesn't parse). Re-running the
// whole generation is the only real fix, since retrying the parse on the same text can't
// help — so this retries the full call+extract+parse sequence a couple of times.
export async function callAnthropicForJson(
  apiKey: string,
  body: unknown,
  pattern: RegExp,
  maxAttempts = 2
): Promise<JsonExtractResult> {
  let lastError = 'Could not parse the model response'
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await callAnthropic(apiKey, body)
    if (!response.ok) {
      const err = await response.text()
      return { ok: false, error: 'Anthropic API error: ' + err, status: 502 }
    }

    const data = await response.json()
    const text = data.content?.find((b: any) => b.type === 'text')?.text ?? ''
    const match = text.match(pattern)
    if (!match) { lastError = 'No JSON found in the model response'; continue }

    try {
      return { ok: true, parsed: JSON.parse(match[0]) }
    } catch (e: any) {
      lastError = e.message
    }
  }
  return { ok: false, error: lastError, status: 422 }
}
