/**
 * Revoke only the current Supabase Auth session.
 *
 * The browser must still clear its local session when the request fails,
 * but callers can report when server-side refresh-token revocation could
 * not be confirmed.
 */
export async function revokeSupabaseSession({
  supabaseUrl,
  apiKey,
  accessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
}) {
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim() ||
      typeof apiKey !== 'string' || !apiKey.trim() ||
      typeof accessToken !== 'string' || !accessToken.trim() ||
      typeof fetchImpl !== 'function') {
    return { ok: false, status: null };
  }

  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(
      supabaseUrl.replace(/\/+$/, '') + '/auth/v1/logout?scope=local',
      {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: 'Bearer ' + accessToken,
        },
        signal: controller.signal,
      },
    );
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: null };
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
