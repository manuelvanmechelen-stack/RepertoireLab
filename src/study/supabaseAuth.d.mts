export type SupabaseSessionRevocation = {
  ok: boolean;
  status: number | null;
};

export function revokeSupabaseSession(options: {
  supabaseUrl?: string;
  apiKey?: string;
  accessToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<SupabaseSessionRevocation>;
