/**
 * Authenticated fetch wrapper for Herald API calls.
 *
 * Fetches the session token from /api/client-token on first call (same-origin,
 * server-enforced). Cached for the page lifetime. The token is never injected
 * into the DOM — it lives only in this module's closure.
 */

let _token: string | null = null;

async function getToken(): Promise<string> {
  if (_token !== null) return _token;
  try {
    const res = await fetch("/api/client-token");
    if (res.ok) {
      const data = await res.json() as { token: string };
      _token = data.token ?? "";
      return _token;
    }
  } catch { /* network error — proceed without token */ }
  _token = "";
  return _token;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { "x-api-key": token } : {})
    }
  });
}
