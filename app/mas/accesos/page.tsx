'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';

type Usuario = { id: string; auth_user_id: string; nombre: string; email: string; activo: boolean; es_dueno: boolean };
type Modulo = { id: string; codigo: string; nombre: string };
type Nivel = 'sin_acceso' | 'lectura' | 'edicion';

// Solo el Panel de Accesos en sí queda siempre exclusivo del dueño (no delegable).
// Todo lo demás, incluido Comercial, se maneja 100% desde esta matriz.
const MODULOS_OCULTOS_EN_MATRIZ = ['accesos'];

export default function AccesosPage() {
  const { usuario } = useAuth();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [permisosPorUsuario, setPermisosPorUsuario] = useState<Record<string, Record<string, Nivel>>>({});
  const [cargando, setCargando] = useState(true);

  const [panelAbierto, setPanelAbierto] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [emailNuevo, setEmailNuevo] = useState('');
  const [passwordNuevo, setPasswordNuevo] = useState('');
  const [esDuenoNuevo, setEsDuenoNuevo] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorCreacion, setErrorCreacion] = useState('');

  async function cargarTodo() {
    setCargando(true);

    const { data: usuariosData } = await supabase.from('usuarios').select('*').order('nombre');
    setUsuarios(usuariosData ?? []);

    const { data: modulosData } = await supabase.from('modulos').select('*').order('nombre');
    setModulos(modulosData ?? []);

    const { data: permisosData } = await supabase.from('permisos').select('usuario_id, nivel, modulos(codigo)');
    const mapa: Record<string, Record<string, Nivel>> = {};
    (permisosData ?? []).forEach((p: any) => {
      if (!mapa[p.usuario_id]) mapa[p.usuario_id] = {};
      if (p.modulos?.codigo) mapa[p.usuario_id][p.modulos.codigo] = p.nivel;
    });
    setPermisosPorUsuario(mapa);

    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  if (usuario && !usuario.es_dueno) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Solo el dueño puede administrar usuarios y permisos.</p>
      </div>
    );
  }

  const modulosMatriz = modulos.filter((m) => !MODULOS_OCULTOS_EN_MATRIZ.includes(m.codigo));

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault();
    setErrorCreacion('');
    setCreando(true);

    const res = await fetch('/api/crear-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreNuevo, email: emailNuevo, password: passwordNuevo, esDueno: esDuenoNuevo }),
    });
    const data = await res.json();

    setCreando(false);

    if (!res.ok) {
      setErrorCreacion(data.error ?? 'Error al crear el usuario');
      return;
    }

    if (data.vinculadoExistente) {
      alert(`${nombreNuevo} ya tenía una cuenta (de otra app de Troya) y quedó vinculado a Puntos Troya. Va a entrar con la contraseña que ya usaba, no con la que pusiste ahora.`);
    }

    setNombreNuevo('');
    setEmailNuevo('');
    setPasswordNuevo('');
    setEsDuenoNuevo(false);
    setPanelAbierto(false);
    cargarTodo();
  }

  async function cambiarNivel(usuarioId: string, moduloId: string, nivel: Nivel) {
    const { error } = await supabase
      .from('permisos')
      .upsert({ usuario_id: usuarioId, modulo_id: moduloId, nivel }, { onConflict: 'usuario_id,modulo_id' });

    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  async function toggleActivo(u: Usuario) {
    const { error } = await supabase.from('usuarios').update({ activo: !u.activo }).eq('id', u.id);
    if (error) {
      alert('Error al actualizar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  async function eliminarUsuario(u: Usuario) {
    const confirmado = confirm(`¿Eliminar por completo a "${u.nombre}"? Esto borra su acceso y no se puede deshacer.`);
    if (!confirmado) return;

    const res = await fetch('/api/eliminar-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: u.id, authUserId: u.auth_user_id }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert('Error al eliminar: ' + (data.error ?? 'desconocido'));
      return;
    }
    cargarTodo();
  }

  const usuariosNoDueno = usuarios.filter((u) => !u.es_dueno);

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Panel de Control de Accesos</h1>
          <p className="troya-subtitulo">{usuarios.length} usuarios</p>
        </div>
      </div>

      <div className="troya-panel" style={{ marginBottom: 20 }}>
        <button className={`troya-panel-toggle ${panelAbierto ? 'abierto' : ''}`} onClick={() => setPanelAbierto(!panelAbierto)}>
          Nuevo usuario
          <IconMas />
        </button>
        {panelAbierto && (
          <div className="troya-panel-body">
            <p className="troya-subtitulo" style={{ marginTop: 0, marginBottom: 10 }}>
              Si la persona ya usa otra app de Troya con ese email, se vincula automáticamente (mantiene su contraseña actual).
            </p>
            <form onSubmit={crearUsuario} className="troya-form">
              <input className="troya-input" placeholder="Nombre" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} required />
              <input className="troya-input" type="email" placeholder="Email" value={emailNuevo} onChange={(e) => setEmailNuevo(e.target.value)} required />
              <input className="troya-input" type="password" placeholder="Contraseña provisoria" value={passwordNuevo} onChange={(e) => setPasswordNuevo(e.target.value)} minLength={6} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={esDuenoNuevo} onChange={(e) => setEsDuenoNuevo(e.target.checked)} />
                Acceso total (dueño)
              </label>
              <button type="submit" className="troya-btn" disabled={creando}>{creando ? 'Procesando...' : 'Crear / vincular usuario'}</button>
            </form>
            {errorCreacion && <p style={{ color: '#DA231F', fontSize: 13, marginTop: 8 }}>{errorCreacion}</p>}
          </div>
        )}
      </div>

      <div className="troya-seccion">
        <div className="troya-seccion-titulo">Usuarios</div>

        {cargando ? (
          <p className="troya-subtitulo">Cargando...</p>
        ) : (
          <div className="troya-lista">
            {usuarios.map((u) => (
              <div key={u.id} className="troya-card">
                <div className="troya-card-info">
                  <h3>{u.nombre} {u.es_dueno ? '· Dueño' : ''}</h3>
                  <p>{u.email} · {u.activo ? 'Activo' : 'Desactivado'}</p>
                </div>
                <div className="troya-card-acciones">
                  <button className="troya-btn troya-btn-secundario" onClick={() => toggleActivo(u)}>
                    {u.activo ? 'Desactivar' : 'Reactivar'}
                  </button>
                  <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarUsuario(u)} title="Eliminar">
                    <IconTacho />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {usuariosNoDueno.length > 0 && (
        <div className="troya-seccion">
          <div className="troya-seccion-titulo">Matriz de permisos</div>
          <p className="troya-subtitulo" style={{ marginTop: -8, marginBottom: 12 }}>
            Todo (incluido Comercial: Costos y Precios, Promos, Stock) se maneja desde acá. Solo este Panel de Accesos queda siempre exclusivo del dueño.
          </p>

          <div className="troya-matriz-wrapper">
            <table className="troya-matriz-tabla">
              <thead>
                <tr>
                  <th>Módulo</th>
                  {usuariosNoDueno.map((u) => (
                    <th key={u.id}>{u.nombre}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modulosMatriz.map((m) => (
                  <tr key={m.id}>
                    <td>{m.nombre}</td>
                    {usuariosNoDueno.map((u) => {
                      const nivel = permisosPorUsuario[u.id]?.[m.codigo] ?? 'sin_acceso';
                      return (
                        <td key={u.id}>
                          <select
                            className={`troya-matriz-select troya-matriz-select--${nivel}`}
                            value={nivel}
                            onChange={(e) => cambiarNivel(u.id, m.id, e.target.value as Nivel)}
                          >
                            <option value="sin_acceso">Sin acceso</option>
                            <option value="lectura">Solo ver</option>
                            <option value="edicion">Editar</option>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function IconMas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconTacho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
      <path d="M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6" />
    </svg>
  );
}