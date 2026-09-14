'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Nivel = 'sin_acceso' | 'lectura' | 'edicion';

type Usuario = {
  id: string;
  auth_user_id: string;
  nombre: string;
  email: string;
  activo: boolean;
  es_dueno: boolean;
};

type AuthContextType = {
  cargando: boolean;
  sesionActiva: boolean;
  usuario: Usuario | null;
  puedeVer: (codigoModulo: string) => boolean;
  puedeEditar: (codigoModulo: string) => boolean;
  cerrarSesion: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesionActiva, setSesionActiva] = useState(false);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [permisos, setPermisos] = useState<Record<string, Nivel>>({});

  async function cargarUsuario(authUserId: string) {
    const { data: usuarioData } = await supabase
      .from('usuarios')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!usuarioData || !usuarioData.activo) {
      setUsuario(null);
      setPermisos({});
      setCargando(false);
      return;
    }

    setUsuario(usuarioData);

    const { data: permisosData } = await supabase
      .from('permisos')
      .select('nivel, modulos(codigo)')
      .eq('usuario_id', usuarioData.id);

    const mapa: Record<string, Nivel> = {};
    (permisosData ?? []).forEach((p: any) => {
      if (p.modulos?.codigo) mapa[p.modulos.codigo] = p.nivel;
    });
    setPermisos(mapa);
    setCargando(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setSesionActiva(true);
        cargarUsuario(data.session.user.id);
      } else {
        setSesionActiva(false);
        setCargando(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSesionActiva(true);
        cargarUsuario(session.user.id);
      } else {
        setSesionActiva(false);
        setUsuario(null);
        setPermisos({});
        setCargando(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  function puedeVer(codigoModulo: string) {
    if (!usuario) return false;
    if (usuario.es_dueno) return true;
    const nivel = permisos[codigoModulo];
    return nivel === 'lectura' || nivel === 'edicion';
  }

  function puedeEditar(codigoModulo: string) {
    if (!usuario) return false;
    if (usuario.es_dueno) return true;
    return permisos[codigoModulo] === 'edicion';
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ cargando, sesionActiva, usuario, puedeVer, puedeEditar, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}