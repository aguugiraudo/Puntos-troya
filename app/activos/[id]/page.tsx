'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type PuntoDetalle = {
  id: string;
  minimo_trimestral: number | null;
  exclusividad_zona: boolean;
  clientes: { nombre: string; localidad: string | null; provincia: string | null; contacto: string | null; telefono: string | null } | null;
};

type TipoEntregable = { id: string; nombre: string };
type EntregableCargado = { tipo_entregable_id: string; entregado: boolean; fecha_entrega: string | null };
type Archivo = { id: string; tipo: string; url: string; nombre_archivo: string | null };

export default function FichaPuntoTroyaPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [punto, setPunto] = useState<PuntoDetalle | null>(null);
  const [tipos, setTipos] = useState<TipoEntregable[]>([]);
  const [entregables, setEntregables] = useState<Record<string, EntregableCargado>>({});
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  async function cargarTodo() {
    setCargando(true);

    const { data: puntoData } = await supabase
      .from('puntos_troya')
      .select('id, minimo_trimestral, exclusividad_zona, clientes(nombre, localidad, provincia, contacto, telefono)')
      .eq('id', id)
      .single();
    setPunto((puntoData as any) ?? null);

    const { data: tiposData } = await supabase.from('tipos_entregable').select('*').order('nombre');
    setTipos(tiposData ?? []);

    const { data: entregadosData } = await supabase
      .from('entregables_punto_troya')
      .select('tipo_entregable_id, entregado, fecha_entrega')
      .eq('punto_troya_id', id);

    const mapa: Record<string, EntregableCargado> = {};
    (entregadosData ?? []).forEach((e) => { mapa[e.tipo_entregable_id] = e; });
    setEntregables(mapa);

    const { data: archivosData } = await supabase
      .from('archivos_punto_troya')
      .select('*')
      .eq('punto_troya_id', id)
      .order('subido_en', { ascending: false });
    setArchivos(archivosData ?? []);

    setCargando(false);
  }

  useEffect(() => {
    if (id) cargarTodo();
  }, [id]);

  async function agregarTipoEntregable(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoTipo.trim()) return;

    const { error } = await supabase.from('tipos_entregable').insert({ nombre: nuevoTipo.trim() });
    if (error) {
      alert('Error al crear el tipo: ' + error.message);
      return;
    }
    setNuevoTipo('');
    cargarTodo();
  }

  async function toggleEntregado(tipoId: string, valorActual: boolean) {
    const { error } = await supabase.from('entregables_punto_troya').upsert(
      {
        punto_troya_id: id,
        tipo_entregable_id: tipoId,
        entregado: !valorActual,
        fecha_entrega: !valorActual ? new Date().toISOString().slice(0, 10) : null,
      },
      { onConflict: 'punto_troya_id,tipo_entregable_id' }
    );

    if (error) {
      alert('Error al actualizar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>, tipo: 'contrato' | 'foto') {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendo(true);
    const rutaArchivo = `${id}/${tipo}-${Date.now()}-${file.name}`;

    const { error: errorSubida } = await supabase.storage
      .from('archivos-puntos-troya')
      .upload(rutaArchivo, file);

    if (errorSubida) {
      alert('Error al subir el archivo: ' + errorSubida.message);
      setSubiendo(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('archivos-puntos-troya').getPublicUrl(rutaArchivo);

    const { error: errorInsert } = await supabase.from('archivos_punto_troya').insert({
      punto_troya_id: id,
      tipo,
      url: urlData.publicUrl,
      nombre_archivo: file.name,
    });

    if (errorInsert) {
      alert('Error al guardar la referencia: ' + errorInsert.message);
    }

    setSubiendo(false);
    e.target.value = '';
    cargarTodo();
  }

  async function eliminarArchivo(archivo: Archivo) {
    const confirmado = confirm(`¿Eliminar "${archivo.nombre_archivo}"?`);
    if (!confirmado) return;

    const { error } = await supabase.from('archivos_punto_troya').delete().eq('id', archivo.id);
    if (error) {
      alert('No se pudo eliminar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  if (cargando) return <p className="troya-subtitulo">Cargando...</p>;
  if (!punto) return <p className="troya-subtitulo">No se encontró este Punto Troya.</p>;

  const contratos = archivos.filter((a) => a.tipo === 'contrato');
  const fotos = archivos.filter((a) => a.tipo === 'foto');

  return (
    <div>
      <button className="troya-btn troya-btn-secundario" onClick={() => router.push('/activos')} style={{ marginBottom: 18 }}>
        ← Volver a Activos
      </button>

      <div className="troya-header">
        <div>
          <h1>{punto.clientes?.nombre}</h1>
          <p className="troya-subtitulo">
            {[punto.clientes?.localidad, punto.clientes?.provincia].filter(Boolean).join(', ')}
            {punto.clientes?.contacto ? ` · ${punto.clientes.contacto}` : ''}
            {punto.clientes?.telefono ? ` · ${punto.clientes.telefono}` : ''}
          </p>
        </div>
      </div>

      {/* ENTREGABLES */}
      <div className="troya-panel" style={{ marginBottom: 20 }}>
        <div className="troya-panel-body" style={{ borderTop: 'none', paddingTop: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>Entregables</h3>

          <div className="troya-lista" style={{ marginBottom: 14 }}>
            {tipos.map((tipo) => {
              const estado = entregables[tipo.id];
              const entregado = estado?.entregado ?? false;
              return (
                <div key={tipo.id} className="troya-card" style={{ padding: '12px 16px' }}>
                  <div className="troya-card-info">
                    <h3 style={{ fontSize: 14.5 }}>{tipo.nombre}</h3>
                    {entregado && estado?.fecha_entrega && (
                      <p>Entregado el {new Date(estado.fecha_entrega).toLocaleDateString('es-AR')}</p>
                    )}
                  </div>
                  <button
                    className="troya-btn"
                    style={entregado ? {} : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}
                    onClick={() => toggleEntregado(tipo.id, entregado)}
                  >
                    {entregado ? '✓ Entregado' : 'Marcar entregado'}
                  </button>
                </div>
              );
            })}
          </div>

          <form onSubmit={agregarTipoEntregable} className="troya-form">
            <input
              className="troya-input"
              placeholder="Agregar tipo de entregable nuevo (ej: Cartel de local)"
              value={nuevoTipo}
              onChange={(e) => setNuevoTipo(e.target.value)}
            />
            <button type="submit" className="troya-btn troya-btn-secundario">+ Agregar tipo</button>
          </form>
        </div>
      </div>

      {/* CONTRATOS */}
      <div className="troya-panel" style={{ marginBottom: 20 }}>
        <div className="troya-panel-body" style={{ borderTop: 'none', paddingTop: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>Contratos</h3>

          {contratos.length === 0 ? (
            <p className="troya-subtitulo" style={{ marginBottom: 12 }}>Todavía no hay contratos subidos.</p>
          ) : (
            <div className="troya-lista" style={{ marginBottom: 14 }}>
              {contratos.map((c) => (
                <div key={c.id} className="troya-card" style={{ padding: '12px 16px' }}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="troya-card-info">
                    <h3 style={{ fontSize: 14.5 }}>{c.nombre_archivo}</h3>
                    <p>Click para ver / descargar</p>
                  </a>
                  <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarArchivo(c)} title="Eliminar">
                    <IconTacho />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="troya-btn troya-btn-secundario" style={{ display: 'inline-block', cursor: 'pointer' }}>
            {subiendo ? 'Subiendo...' : '+ Subir contrato'}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => subirArchivo(e, 'contrato')} disabled={subiendo} />
          </label>
        </div>
      </div>

      {/* FOTOS */}
      <div className="troya-panel">
        <div className="troya-panel-body" style={{ borderTop: 'none', paddingTop: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>Fotos del local</h3>

          {fotos.length === 0 ? (
            <p className="troya-subtitulo" style={{ marginBottom: 12 }}>Todavía no hay fotos cargadas.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 14 }}>
              {fotos.map((f) => (
                <div key={f.id} style={{ position: 'relative' }}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <img src={f.url} alt={f.nombre_archivo ?? ''} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
                  </a>
                  <button
                    className="troya-icon-btn troya-icon-btn--eliminar"
                    style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28 }}
                    onClick={() => eliminarArchivo(f)}
                    title="Eliminar"
                  >
                    <IconTacho />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="troya-btn troya-btn-secundario" style={{ display: 'inline-block', cursor: 'pointer' }}>
            {subiendo ? 'Subiendo...' : '+ Subir foto'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => subirArchivo(e, 'foto')} disabled={subiendo} />
          </label>
        </div>
      </div>
    </div>
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