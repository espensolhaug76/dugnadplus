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

// Anonym klient — ingen persistert session, ingen Authorization-header
// med JWT. Sender kun anon-key. Brukes når vi MÅ treffe RLS-policies
// som er definert for `anon`-rollen (TO anon), uten at en innlogget
// bruker «forurenser» kallet med authenticated-rollen.
//
// Konkret bruk: CoordinatorInvitePage som leser opp invitasjon via
// token. Policyen `coordinator_invites_select_by_token` er TO anon,
// så en innlogget bruker som ikke er inviter eller team_member får
// 0 rader tilbake hvis vi bruker `supabase`-klienten.
export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});