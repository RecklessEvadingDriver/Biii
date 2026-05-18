import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseConfigError = isSupabaseConfigured
  ? ''
  : 'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY during build (for GitHub Pages, add them as repository secrets).';

const missingConfigClient = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error(supabaseConfigError);
      };
    },
  }
) as SupabaseClient;

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : missingConfigClient;
