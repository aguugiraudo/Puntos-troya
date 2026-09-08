'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Cliente = {
  id: string;
  nombre: string;
  localidad: string | null;
  provincia: string | null;
  contacto: string | null;
  telefono: string | null;
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [nombre, setNombre] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [provincia, setProvincia] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Partial<Cliente>>({});

  async function cargarClientes() {
    setCargando(true);
    const { data, error } = await supabase.from('clientes').select('*').order('nombre');
    if (!error) setClientes(data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargarClientes();
  }, []);

  async function crearCliente(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    const { error } = await supabase.from('clientes').insert({
      nombre,
      localidad: localidad || null,
      provincia: provincia || null,
      contacto: contacto || null,
      telefono: telefono || null,
    });

    if (error) {
      alert('Error al crear cliente: ' + error.message);
      return;
    }

    setNombre('');
    setLocalidad('');
    setProvincia('');
    setContacto('');
    setTelefono('');
    cargarClientes();
  }

  function empezarEdicion(c: Cliente) {
    setEditandoId(c.id);
    setBorrador(c);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setBorrador({});
  }

  async function guardarEdicion(id: string) {
    const { error } = await supabase
      .from('clientes')
      .update({
        nombre: borrador.nombre,
        localidad: borrador.localidad || null,
        provincia: borrador.provincia || null,
        contacto: borrador.contacto || null,
        telefono: borrador.telefono || null,
      })
      .eq('id', id);

    if (error) {
      alert('Error al guardar cambios: ' + error.message);
      return;
    }

    cancelarEdicion();
    cargarClientes();
  }

  async function eliminarCliente(c: Cliente) {
    const confirmado = confirm(
      `¿Eliminar a "${c.nombre}"? Si tiene un Punto Troya o prospecto asociado, primero hay que eliminar ese registro.`
    );
    if (!confirmado) return;

    const { error } = await supabase.from('clientes').delete().eq('id', c.id);

    if (error) {
      alert('No se pudo eliminar: ' + error.message);
      return;
    }

    cargarClientes();
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Clientes</h1>
          <p className="troya-subtitulo">{clientes.length} cargados</p>
        </div>
      </div>

      <form onSubmit={crearCliente} className="troya-form">
        <input className="troya-input" placeholder="Nombre *" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <input className="troya-input" placeholder="Localidad" value={localidad} onChange={(e) => setLocalidad(e.target.value)} />
        <input className="troya-input" placeholder="Provincia" value={provincia} onChange={(e) => setProvincia(e.target.value)} />
        <input className="troya-input" placeholder="Contacto" value={contacto} onChange={(e) => setContacto(e.target.value)} />
        <input className="troya-input" placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <button type="submit" className="troya-btn">Agregar</button>
      </form>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : clientes.length === 0 ? (
        <div className="troya-vacio">
          <h3>Todavía no cargaste ningún cliente</h3>
          <p>Usá el formulario de arriba para dar de alta el primero.</p>
        </div>
      ) : (
        <div className="troya-lista">
          {clientes.map((c) =>
            editandoId === c.id ? (
              <div key={c.id} className="troya-card troya-card-editando">
                <div className="troya-form">
                  <input className="troya-input" value={borrador.nombre ?? ''} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} placeholder="Nombre" />
                  <input className="troya-input" value={borrador.localidad ?? ''} onChange={(e) => setBorrador({ ...borrador, localidad: e.target.value })} placeholder="Localidad" />
                  <input className="troya-input" value={borrador.provincia ?? ''} onChange={(e) => setBorrador({ ...borrador, provincia: e.target.value })} placeholder="Provincia" />
                  <input className="troya-input" value={borrador.contacto ?? ''} onChange={(e) => setBorrador({ ...borrador, contacto: e.target.value })} placeholder="Contacto" />
                  <input className="troya-input" value={borrador.telefono ?? ''} onChange={(e) => setBorrador({ ...borrador, telefono: e.target.value })} placeholder="Teléfono" />
                </div>
                <div className="troya-card-acciones">
                  <button className="troya-btn" onClick={() => guardarEdicion(c.id)}>Guardar</button>
                  <button className="troya-icon-btn" onClick={cancelarEdicion} title="Cancelar">✕</button>
                </div>
              </div>
            ) : (
              <div key={c.id} className="troya-card">
                <div className="troya-card-info">
                  <h3>{c.nombre}</h3>
                  <p>
                    {[c.localidad, c.provincia].filter(Boolean).join(', ') || 'Sin ubicación cargada'}
                    {c.contacto ? ` · ${c.contacto}` : ''}
                    {c.telefono ? ` · ${c.telefono}` : ''}
                  </p>
                </div>
                <div className="troya-card-acciones">
                  <button className="troya-icon-btn" onClick={() => empezarEdicion(c)} title="Editar">
                    <IconLapiz />
                  </button>
                  <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarCliente(c)} title="Eliminar">
                    <IconTacho />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function IconLapiz() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function IconTacho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
      <path d="M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6" />
    </svg>
  );
}