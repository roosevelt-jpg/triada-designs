import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseAnonCredentials,
} from "./config";

/**
 * Server Route Handler / RSC client using the anon key.
 * Prefer `createAdminSupabaseClient` for privileged webhook writes.
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function createServerSupabaseClient() {
  if (!hasSupabaseAnonCredentials()) return null;

  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
