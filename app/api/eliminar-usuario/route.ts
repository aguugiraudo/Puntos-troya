import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { usuarioId, authUserId } = await req.json();

    if (!usuarioId || !authUserId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    await supabaseAdmin.from('usuarios').delete().eq('id', usuarioId);
    await supabaseAdmin.auth.admin.deleteUser(authUserId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error inesperado' }, { status: 500 });
  }
}