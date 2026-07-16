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
