// src/services/supabaseClient.ts

import { createClient } from '@supabase/supabase-js';

// Access environment variables from the .env file (Vite automatically exposes VITE_ prefixed variables)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Safety check: These must match the variables you added to your .env file
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or ANON Key is missing. Did you set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file?');
}

// Create the Supabase client instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey);