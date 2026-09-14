import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { email, password, nombre, esDueno } = await req.json();

    if (!email || !nombre) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    let authUserId: string;
    let vinculadoExistente = false;

    // Intento 1: crear la cuenta de Auth desde cero
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || undefined,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      // Si el error es porque el email ya existe en Auth (compartido con otras apps
      // del mismo proyecto de Supabase), buscamos ese usuario y lo vinculamos.
      const yaExiste = authError?.message?.toLowerCase().includes('already') ?? false;

      if (!yaExiste) {
        return NextResponse.json({ error: authError?.message ?? 'Error al crear el usuario' }, { status: 400 });
      }

      const { data: listaUsuarios, error: errorLista } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (errorLista) {
        return NextResponse.json({ error: errorLista.message }, { status: 400 });
      }

      const existente = listaUsuarios.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

      if (!existente) {
        return NextResponse.json({ error: 'El email ya existe pero no se pudo encontrar la cuenta.' }, { status: 400 });
      }

      authUserId = existente.id;
      vinculadoExistente = true;
    } else {
      authUserId = authData.user.id;
    }

    // Verificar que no esté ya vinculado dentro de Puntos Troya
    const { data: yaVinculado } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (yaVinculado) {
      return NextResponse.json({ error: 'Esa persona ya tiene acceso a Puntos Troya.' }, { status: 400 });
    }

    const { error: dbError } = await supabaseAdmin.from('usuarios').insert({
      auth_user_id: authUserId,
      nombre,
      email,
      activo: true,
      es_dueno: !!esDueno,
    });

    if (dbError) {
      if (!vinculadoExistente) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, vinculadoExistente });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error inesperado' }, { status: 500 });
  }
}