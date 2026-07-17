// Client-safe fetch wrapper. Reads the body as text first, so an empty or
// non-JSON response — a 5xx, a gateway timeout, or a request dropped while the
// server is redeploying — surfaces as a clean Error instead of the cryptic
// "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  const text = await res.text();
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // non-JSON body (e.g. an HTML error page)
    }
  }

  if (!res.ok) {
    const serverMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : null;
    throw new Error(
      serverMessage ??
        (res.status >= 500
          ? "The server had a problem (it may be restarting) — please try again in a moment."
          : `Request failed (${res.status}).`)
    );
  }

  if (data === undefined) {
    throw new Error("The server returned an empty response — please try again.");
  }
  return data as T;
}
