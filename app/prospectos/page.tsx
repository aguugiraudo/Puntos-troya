'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Cliente = { id: string; nombre: string };

type Prospecto = {
  id: string;
  estado: string;
  minimo_trimestral: number | null;
  fecha_propuesta: string | null;
  clientes: { nombre: string; localidad: string | null; provincia: string | null } | null;
};

const ESTADOS = [
  { valor: 'a_prospectar', etiqueta: 'A prospectar' },
  { valor: 'propuesta_enviada', etiqueta: 'Propuesta enviada' },
  { valor: 'confirmado', etiqueta: 'Confirmado' },
  { valor: 'baja', etiqueta: 'Baja / No interesado' },
];

function etiquetaEstado(valor: string) {
  return ESTADOS.find((e) => e.valor === valor)?.etiqueta ?? valor;
}

export default function ProspectosPage() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [minimo, setMinimo] = useState('');
  const [cargando, setCargando] = useState(true);

  async function cargarTodo() {
    setCargando(true);

    const { data: clientesData } = await supabase.from('clientes').select('id, nombre').order('nombre');
    setClientes(clientesData ?? []);

    const { data: prospectosData, error } = await supabase
      .from('puntos_troya')
      .select('id, estado, minimo_trimestral, fecha_propuesta, clientes(nombre, localidad, provincia)')
      .neq('estado', 'confirmado')
      .order('fecha_propuesta', { ascending: false });

    if (!error) setProspectos((prospectosData as any) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

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

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Prospectos</h1>
          <p className="troya-subtitulo">{prospectos.length} en seguimiento</p>
        </div>
      </div>

      <form onSubmit={crearProspecto} className="troya-form">
        <select className="troya-input" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
          <option value="">Elegir cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <input
          className="troya-input"
          placeholder="Mínimo trimestral propuesto"
          type="number"
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
        />
        <button type="submit" className="troya-btn">Registrar propuesta</button>
      </form>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : prospectos.length === 0 ? (
        <div className="troya-vacio">
          <h3>No hay prospectos en seguimiento</h3>
          <p>Si el cliente todavía no existe, primero cargalo en Clientes.</p>
        </div>
      ) : (
        <div className="troya-lista">
          {prospectos.map((p) => (
            <div key={p.id} className="troya-card" style={{ flexWrap: 'wrap' }}>
              <div className="troya-card-info">
                <h3>{p.clientes?.nombre}</h3>
                <p>
                  {[p.clientes?.localidad, p.clientes?.provincia].filter(Boolean).join(', ')}
                  {p.minimo_trimestral ? ` · Mínimo propuesto: $${Number(p.minimo_trimestral).toLocaleString('es-AR')}` : ''}
                </p>
              </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}