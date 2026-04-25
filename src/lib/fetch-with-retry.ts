export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.ok) return res;

    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      continue;
    }

    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  throw new Error("fetchWithRetry: unreachable");
}
