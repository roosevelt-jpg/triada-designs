import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseAnonCredentials,
} from "./config";

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let browserClient = null;

/**
 * Browser / client-component Supabase client (anon key + RLS).
 * Returns null when credentials are missing (local_sim / awaiting credentials).
 */
export function createBrowserSupabaseClient() {
  if (!hasSupabaseAnonCredentials()) return null;
  if (browserClient) return browserClient;

  browserClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}
