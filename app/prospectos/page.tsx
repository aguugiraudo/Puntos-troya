'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import InputMoneda from '@/components/InputMoneda';

type Cliente = { id: string; nombre: string };

type Prospecto = {
  id: string;
  estado: string;
  minimo_trimestral: number | null;
  clientes: { nombre: string; localidad: string | null; provincia: string | null } | null;
};

const ESTADOS = [
  { valor: 'a_prospectar', etiqueta: 'A prospectar' },
  { valor: 'propuesta_enviada', etiqueta: 'Propuesta enviada' },
  { valor: 'confirmado', etiqueta: 'Confirmado' },
  { valor: 'baja', etiqueta: 'Baja / No interesado' },
];

export default function ProspectosPage() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [minimo, setMinimo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [minimoEdit, setMinimoEdit] = useState('');

  async function cargarTodo() {
    setCargando(true);

    const { data: clientesData } = await supabase.from('clientes').select('id, nombre').order('nombre');
    setClientes(clientesData ?? []);

    const { data: prospectosData, error } = await supabase
      .from('puntos_troya')
      .select('id, estado, minimo_trimestral, clientes(nombre, localidad, provincia)')
      .neq('estado', 'confirmado')
      .order('id', { ascending: false });

    if (!error) setProspectos((prospectosData as any) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  const prospectosFiltrados = prospectos.filter((p) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return [p.clientes?.nombre, p.clientes?.localidad, p.clientes?.provincia]
      .filter(Boolean)
      .some((campo) => campo!.toLowerCase().includes(texto));
  });

  async function crearProspecto(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) return;

    const { error } = await supabase.from('puntos_troya').insert({
      cliente_id: clienteId,
      estado: 'a_prospectar',
      minimo_trimestral: minimo ? Number(minimo) : null,
    });

    if (error) {
      alert('Error al crear prospecto: ' + error.message);
      return;
    }

    setClienteId('');
    setMinimo('');
    setPanelAbierto(false);
    cargarTodo();
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    const patch: any = { estado: nuevoEstado };
    if (nuevoEstado === 'propuesta_enviada') patch.fecha_propuesta = new Date().toISOString().slice(0, 10);
    if (nuevoEstado === 'confirmado') patch.fecha_confirmacion = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from('puntos_troya').update(patch).eq('id', id);
    if (error) {
      alert('Error al actualizar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  function empezarEdicion(p: Prospecto) {
    setEditandoId(p.id);
    setMinimoEdit(p.minimo_trimestral ? String(p.minimo_trimestral) : '');
  }

  async function guardarMinimo(id: string) {
    const { error } = await supabase
      .from('puntos_troya')
      .update({ minimo_trimestral: minimoEdit ? Number(minimoEdit) : null })
      .eq('id', id);

    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }

    setEditandoId(null);
    cargarTodo();
  }

  async function eliminarProspecto(p: Prospecto) {
    const confirmado = confirm(`¿Eliminar el prospecto de "${p.clientes?.nombre}"? Esto no borra al cliente, solo esta propuesta.`);
    if (!confirmado) return;

    const { error } = await supabase.from('puntos_troya').delete().eq('id', p.id);
    if (error) {
      alert('No se pudo eliminar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Prospectos</h1>
          <p className="troya-subtitulo">
            {busqueda ? `${prospectosFiltrados.length} de ${prospectos.length}` : `${prospectos.length} en seguimiento`}
          </p>
        </div>
      </div>

      <div className="troya-buscador">
        <IconBuscar />
        <input
          type="text"
          placeholder="Buscar por nombre, localidad o provincia..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="troya-panel">
        <button className={`troya-panel-toggle ${panelAbierto ? 'abierto' : ''}`} onClick={() => setPanelAbierto(!panelAbierto)}>
          Nueva propuesta
          <IconMas />
        </button>
        {panelAbierto && (
          <div className="troya-panel-body">
            <form onSubmit={crearProspecto} className="troya-form">
              <select className="troya-input" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
                <option value="">Elegir cliente...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <InputMoneda value={minimo} onChange={setMinimo} placeholder="Mínimo trimestral propuesto" />
              <button type="submit" className="troya-btn">Registrar</button>
            </form>
          </div>
        )}
      </div>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : prospectos.length === 0 ? (
        <div className="troya-vacio">
          <h3>No hay prospectos en seguimiento</h3>
          <p>Si el cliente todavía no existe, primero cargalo en Clientes.</p>
        </div>
      ) : prospectosFiltrados.length === 0 ? (
        <div className="troya-vacio">
          <h3>No hay resultados para &ldquo;{busqueda}&rdquo;</h3>
          <p>Probá con otro nombre, localidad o provincia.</p>
        </div>
      ) : (
        <div className="troya-lista">
          {prospectosFiltrados.map((p) => (
            <div key={p.id} className="troya-card">
              <div className="troya-card-info">
                <h3>{p.clientes?.nombre}</h3>
                {editandoId === p.id ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <InputMoneda value={minimoEdit} onChange={setMinimoEdit} placeholder="Mínimo trimestral" />
                    <button className="troya-btn" onClick={() => guardarMinimo(p.id)}>Guardar</button>
                    <button className="troya-btn troya-btn-secundario" onClick={() => setEditandoId(null)}>Cancelar</button>
                  </div>
                ) : (
                  <p>
                    {[p.clientes?.localidad, p.clientes?.provincia].filter(Boolean).join(', ')}
                    {p.minimo_trimestral ? ` · Mínimo propuesto: $${Number(p.minimo_trimestral).toLocaleString('es-AR')}` : ' · Sin mínimo cargado'}
                  </p>
                )}
              </div>
              <div className="troya-card-derecha">
                <select
                  className="troya-input"
                  style={{ flex: '0 0 auto' }}
                  value={p.estado}
                  onChange={(e) => cambiarEstado(p.id, e.target.value)}
                >
                  {ESTADOS.map((e) => (
                    <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
                  ))}
                </select>
                <div className="troya-card-acciones">
                  <button className="troya-icon-btn" onClick={() => empezarEdicion(p)} title="Editar mínimo">
                    <IconLapiz />
                  </button>
                  <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarProspecto(p)} title="Eliminar">
                    <IconTacho />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBuscar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function IconMas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconLapiz() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
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