import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
export const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
