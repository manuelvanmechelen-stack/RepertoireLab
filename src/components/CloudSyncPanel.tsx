import { useState } from 'react';

type Backup = {
  app: string;
  version: number;
  exportedAt: string;
  lines: unknown[];
  repertoires: unknown[];
  activeRepertoireId: string;
  missedMoves: unknown;
  moveMemory: unknown;
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SESSION_KEY = 'repertoirelab-cloud-session-v1';

type Session = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } };

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    return session.access_token && session.user?.id ? session : null;
  } catch { return null; }
}

export function CloudSyncPanel({ backup, onRestore }: { backup: Backup; onRestore: (raw: unknown) => Promise<void> | void }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

  async function request(path: string, init: RequestInit = {}, token?: string) {
    if (!configured) throw new Error('Cloudsync is nog niet geconfigureerd. Stel VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in.');
    const response = await fetch(SUPABASE_URL + path, {
      ...init,
      headers: {
        apikey: SUPABASE_KEY!,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...init.headers,
      },
    });
    const body = await response.text();
    let data: any = null;
    try { data = body ? JSON.parse(body) : null; } catch { /* handled below */ }
    if (!response.ok) {
      if (response.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setSession(null);
      }
      throw new Error(data?.msg || data?.message || data?.error_description || data?.error || 'Cloudrequest mislukt (' + response.status + ').');
    }
    return data;
  }

  async function authenticate(mode: 'signup' | 'token') {
    setBusy(true); setMessage('');
    try {
      const data = await request('/auth/v1/' + (mode === 'signup' ? 'signup' : 'token?grant_type=password'), {
        method: 'POST', body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!data?.access_token || !data?.user?.id) {
        setMessage('Accountverzoek ontvangen. Controleer je e-mail als bevestiging is ingeschakeld en log daarna in.');
        return;
      }
      const next: Session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000, user: data.user };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next); setPassword('');
      setMessage(mode === 'signup' ? 'Account aangemaakt en ingelogd.' : 'Ingelogd. Je kunt nu synchroniseren.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Inloggen mislukt.'); }
    finally { setBusy(false); }
  }

  async function getToken(): Promise<string> {
    if (!session) throw new Error('Log eerst in.');
    if (session.expires_at > Date.now() + 60_000) return session.access_token;
    if (!session.refresh_token) throw new Error('Sessie verlopen. Log opnieuw in.');
    const refreshed = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) });
    const next: Session = { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000, user: refreshed.user };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); setSession(next);
    return next.access_token;
  }

  async function syncToCloud() {
    setBusy(true); setMessage('');
    try {
      const token = await getToken();
      await request('/rest/v1/repertoirelab_backups?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: session!.user.id, payload: backup, updated_at: new Date().toISOString() }),
      }, token);
      setMessage('Back-up veilig naar je cloudaccount gesynchroniseerd.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Synchroniseren mislukt.'); }
    finally { setBusy(false); }
  }

  async function restoreFromCloud() {
    if (!window.confirm('De cloudback-up vervangt de gegevens op dit apparaat. Exporteer eerst een lokale back-up.')) return;
    setBusy(true); setMessage('');
    try {
      const token = await getToken();
      const rows = await request('/rest/v1/repertoirelab_backups?select=payload,updated_at&user_id=eq.' + encodeURIComponent(session!.user.id) + '&limit=1', {}, token);
      if (!Array.isArray(rows) || !rows[0]?.payload) throw new Error('Er staat nog geen back-up in de cloud. Synchroniseer dit apparaat eerst.');
      await onRestore(rows[0].payload);
      setMessage('Cloudback-up geladen.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Herstellen uit cloud mislukt.'); }
    finally { setBusy(false); }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY); setSession(null); setMessage('Uitgelogd op dit apparaat.');
  }

  return <section className="repertoire-builder cloud-sync-panel">
    <div className="builder-actions"><div className="builder-side">
      <strong>Cloudsynchronisatie</strong>
      <span>Synchroniseer een volledige back-up tussen apparaten. De cloudkopie wordt pas gewijzigd wanneer je op synchroniseren drukt; er is geen automatische samenvoeging.</span>
      {!configured && <p className="cloud-config-warning">Nog niet geconfigureerd. Voeg VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY toe aan de Vercel-omgevingsvariabelen en voer supabase/migrations/001_repertoirelab_backups.sql uit in je Supabase-project.</p>}
      {configured && !session && <div className="cloud-auth-fields">
        <input type="email" aria-label="Cloud e-mailadres" autoComplete="email" placeholder="E-mailadres" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" aria-label="Cloud wachtwoord" autoComplete="current-password" placeholder="Wachtwoord (minimaal 8 tekens)" value={password} onChange={e => setPassword(e.target.value)} />
        <div className="move-entry-actions">
          <button className="primary" disabled={busy || !email.trim() || password.length < 8} onClick={() => void authenticate('token')}>Inloggen</button>
          <button className="secondary" disabled={busy || !email.trim() || password.length < 8} onClick={() => void authenticate('signup')}>Account aanmaken</button>
        </div>
      </div>}
      {session && <div className="cloud-signed-in"><span>Ingelogd als {session.user.email || 'cloudgebruiker'}</span><div className="move-entry-actions"><button className="primary" disabled={busy} onClick={() => void syncToCloud()}>Synchroniseer naar cloud</button><button className="secondary" disabled={busy} onClick={() => void restoreFromCloud()}>Herstel uit cloud</button><button className="secondary" disabled={busy} onClick={logout}>Uitloggen</button></div></div>}
      {busy && <span role="status">Bezig met cloudsynchronisatie…</span>}
      {message && <p className="cloud-sync-message" role="status">{message}</p>}
    </div></div>
  </section>;
}
