import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// db: { schema: 'puntos_troya' } hace que TODAS las consultas de este cliente
// apunten al schema puntos_troya en lugar de "public" por defecto.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'puntos_troya' },
});
