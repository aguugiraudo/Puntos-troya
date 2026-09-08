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

  async function cargarClientes() {
    setCargando(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre', { ascending: true });

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
          {clientes.map((c) => (
            <div key={c.id} className="troya-card">
              <div className="troya-card-info">
                <h3>{c.nombre}</h3>
                <p>
                  {[c.localidad, c.provincia].filter(Boolean).join(', ') || 'Sin ubicación cargada'}
                  {c.contacto ? ` · ${c.contacto}` : ''}
                  {c.telefono ? ` · ${c.telefono}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}