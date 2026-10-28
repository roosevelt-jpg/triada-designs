import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  hasSupabaseAdminCredentials,
} from "./config";

/**
 * Service-role client for server-only privileged writes (webhooks, seeds).
 * Never import this module from client components.
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function createAdminSupabaseClient() {
  if (!hasSupabaseAdminCredentials()) return null;

  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
