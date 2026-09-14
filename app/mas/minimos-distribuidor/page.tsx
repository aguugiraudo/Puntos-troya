'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Producto = {
  id: string;
  nombre: string;
  unidad: string | null;
  minimo_distribuidor: number | null;
  activo: boolean;
};

export default function MinimosDistribuidorPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('');
  const [minimo, setMinimo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Partial<Producto>>({});

  async function cargarProductos() {
    setCargando(true);
    const { data, error } = await supabase.from('productos').select('*').order('nombre');
    if (!error) setProductos(data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargarProductos();
  }, []);

  const productosFiltrados = productos.filter((p) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return p.nombre.toLowerCase().includes(texto);
  });

  async function crearProducto(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    const { error } = await supabase.from('productos').insert({
      nombre,
      unidad: unidad || null,
      minimo_distribuidor: minimo ? Number(minimo) : null,
    });

    if (error) {
      alert('Error al crear producto: ' + error.message);
      return;
    }

    setNombre('');
    setUnidad('');
    setMinimo('');
    setPanelAbierto(false);
    cargarProductos();
  }

  function empezarEdicion(p: Producto) {
    setEditandoId(p.id);
    setBorrador(p);
  }

  async function guardarEdicion(id: string) {
    const { error } = await supabase
      .from('productos')
      .update({
        nombre: borrador.nombre,
        unidad: borrador.unidad || null,
        minimo_distribuidor: borrador.minimo_distribuidor ?? null,
      })
      .eq('id', id);

    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }

    setEditandoId(null);
    setBorrador({});
    cargarProductos();
  }

  async function eliminarProducto(p: Producto) {
    const confirmado = confirm(`¿Eliminar "${p.nombre}" del listado?`);
    if (!confirmado) return;

    const { error } = await supabase.from('productos').delete().eq('id', p.id);
    if (error) {
      alert('No se pudo eliminar: ' + error.message);
      return;
    }
    cargarProductos();
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Mínimos por Distribuidor</h1>
          <p className="troya-subtitulo">Cantidad mínima por producto para acceder al 44% de descuento</p>
        </div>
      </div>

      <div className="troya-buscador">
        <IconBuscar />
        <input
          type="text"
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="troya-panel">
        <button className={`troya-panel-toggle ${panelAbierto ? 'abierto' : ''}`} onClick={() => setPanelAbierto(!panelAbierto)}>
          Nuevo producto
          <IconMas />
        </button>
        {panelAbierto && (
          <div className="troya-panel-body">
            <form onSubmit={crearProducto} className="troya-form">
              <input className="troya-input" placeholder="Nombre del producto *" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              <input className="troya-input" placeholder="Unidad (ej: cajas, u.)" value={unidad} onChange={(e) => setUnidad(e.target.value)} />
              <input className="troya-input" type="number" placeholder="Mínimo para 44%" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
              <button type="submit" className="troya-btn">Guardar</button>
            </form>
          </div>
        )}
      </div>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : productos.length === 0 ? (
        <div className="troya-vacio">
          <h3>Todavía no cargaste productos</h3>
          <p>Usá &ldquo;Nuevo producto&rdquo; arriba para dar de alta el primero.</p>
        </div>
      ) : productosFiltrados.length === 0 ? (
        <div className="troya-vacio">
          <h3>No hay resultados para &ldquo;{busqueda}&rdquo;</h3>
        </div>
      ) : (
        <div className="troya-lista">
          {productosFiltrados.map((p) =>
            editandoId === p.id ? (
              <div key={p.id} className="troya-card troya-card-editando">
                <div className="troya-form">
                  <input className="troya-input" value={borrador.nombre ?? ''} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} placeholder="Nombre" />
                  <input className="troya-input" value={borrador.unidad ?? ''} onChange={(e) => setBorrador({ ...borrador, unidad: e.target.value })} placeholder="Unidad" />
                  <input
                    className="troya-input"
                    type="number"
                    value={borrador.minimo_distribuidor ?? ''}
                    onChange={(e) => setBorrador({ ...borrador, minimo_distribuidor: e.target.value ? Number(e.target.value) : null })}
                    placeholder="Mínimo para 44%"
                  />
                </div>
                <div className="troya-card-acciones">
                  <button className="troya-btn" onClick={() => guardarEdicion(p.id)}>Guardar cambios</button>
                  <button className="troya-btn troya-btn-secundario" onClick={() => { setEditandoId(null); setBorrador({}); }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="troya-card">
                <div className="troya-card-info">
                  <h3>{p.nombre}</h3>
                  <p>
                    {p.minimo_distribuidor != null
                      ? `Mínimo: ${p.minimo_distribuidor.toLocaleString('es-AR')} ${p.unidad ?? ''}`.trim()
                      : 'Sin mínimo cargado'}
                  </p>
                </div>
                <div className="troya-card-acciones">
                  <button className="troya-icon-btn" onClick={() => empezarEdicion(p)} title="Editar">
                    <IconLapiz />
                  </button>
                  <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarProducto(p)} title="Eliminar">
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