import { createClient } from '@supabase/supabase-js';

// Este cliente usa la Secret Key y SOLO puede usarse en archivos de servidor
// (API routes). Nunca importar este archivo desde un componente 'use client'.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: { schema: 'puntos_troya' },
    auth: { autoRefreshToken: false, persistSession: false },
  }
);