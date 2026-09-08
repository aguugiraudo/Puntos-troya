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

    if (error) {
      console.error('Error cargando clientes:', error);
    } else {
      setClientes(data ?? []);
    }
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
      <h1>Clientes</h1>

      <form
        onSubmit={crearCliente}
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <input
          placeholder="Nombre *"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <input
          placeholder="Localidad"
          value={localidad}
          onChange={(e) => setLocalidad(e.target.value)}
        />
        <input
          placeholder="Provincia"
          value={provincia}
          onChange={(e) => setProvincia(e.target.value)}
        />
        <input
          placeholder="Contacto"
          value={contacto}
          onChange={(e) => setContacto(e.target.value)}
        />
        <input
          placeholder="Teléfono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
        <button type="submit">Agregar cliente</button>
      </form>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table
          border={1}
          cellPadding={8}
          style={{ borderCollapse: 'collapse', width: '100%' }}
        >
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Localidad</th>
              <th>Provincia</th>
              <th>Contacto</th>
              <th>Teléfono</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{c.localidad}</td>
                <td>{c.provincia}</td>
                <td>{c.contacto}</td>
                <td>{c.telefono}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
