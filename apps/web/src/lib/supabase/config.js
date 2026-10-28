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
    // Supabase dashboard "publishable" key aliases the anon key
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}

export function getSupabaseServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    // Supabase dashboard "secret" key aliases the service role key
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ""
  );
}

/** Server-only JWT secret (Auth / edge verification). Never expose via NEXT_PUBLIC_*. */
export function getSupabaseJwtSecret() {
  return process.env.SUPABASE_JWT_SECRET?.trim() || "";
}

/** True when URL + anon key are present (browser / RLS client usable). */
export function hasSupabaseAnonCredentials() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/** True when URL + service role are present (server ingest / admin). */
export function hasSupabaseAdminCredentials() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}
