# Vercel build: expose the public Supabase URL + anon key to the static pages.
cat > public/config.js <<JS
window.SUPABASE_URL = "${NEXT_PUBLIC_SUPABASE_URL:-$SUPABASE_URL}";
window.SUPABASE_ANON_KEY = "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-$SUPABASE_PUBLISHABLE_KEY}}";
JS
