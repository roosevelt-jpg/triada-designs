/**
 * Shared Supabase env resolution (JS only).
 * Service role must never be exposed via NEXT_PUBLIC_*.
 */

export function getSupabaseUrl() {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  );
}

export function getSupabaseAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ""
  );
}

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

/** True when URL + anon key are present (browser / RLS client usable). */
export function hasSupabaseAnonCredentials() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/** True when URL + service role are present (server ingest / admin). */
export function hasSupabaseAdminCredentials() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}
