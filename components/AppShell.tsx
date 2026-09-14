'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import TroyaNav from '@/components/TroyaNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { cargando, usuario, sesionActiva } = useAuth();

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#948578' }}>Cargando...</p>
      </div>
    );
  }

  if (!sesionActiva) {
    return <LoginForm />;
  }

  if (!usuario) {
    return <CuentaNoHabilitada />;
  }

  return (
    <>
      <TroyaNav />
      <main className="troya-main">{children}</main>
    </>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setEnviando(false);
    if (error) setError('Email o contraseña incorrectos.');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF9F6', padding: 20 }}>
      <form onSubmit={iniciarSesion} style={{ background: '#fff', border: '1px solid #ECE4DB', borderRadius: 16, padding: 32, width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 4 }}>Puntos Troya</h1>
        <p style={{ color: '#948578', fontSize: 13.5, marginBottom: 20 }}>Iniciá sesión para continuar</p>

        <input className="troya-input" style={{ width: '100%', marginBottom: 10 }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="troya-input" style={{ width: '100%', marginBottom: 14 }} type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p style={{ color: '#DA231F', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button type="submit" className="troya-btn" style={{ width: '100%' }} disabled={enviando}>
          {enviando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

function CuentaNoHabilitada() {
  const { cerrarSesion } = useAuth();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 20, textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-display)' }}>Tu cuenta no está habilitada</h2>
      <p style={{ color: '#948578', maxWidth: 320 }}>Pedile al administrador que te dé acceso desde el Panel de Control de Accesos.</p>
      <button className="troya-btn troya-btn-secundario" onClick={cerrarSesion}>Cerrar sesión</button>
    </div>
  );
}