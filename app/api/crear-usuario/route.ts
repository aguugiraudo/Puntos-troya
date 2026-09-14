import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { email, password, nombre, esDueno } = await req.json();

    if (!email || !password || !nombre) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message ?? 'Error al crear el usuario' }, { status: 400 });
    }

    const { error: dbError } = await supabaseAdmin.from('usuarios').insert({
      auth_user_id: authData.user.id,
      nombre,
      email,
      activo: true,
      es_dueno: !!esDueno,
    });

    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error inesperado' }, { status: 500 });
  }
}