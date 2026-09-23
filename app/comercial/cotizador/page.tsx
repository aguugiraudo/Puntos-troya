'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const MODULO = 'cotizador';

type Producto = {
  id: string;
  nombre: string;
  precio_lista: number | null;
  costo_completo: number | null;
  costo_materia_prima: number | null;
};

type ItemForm = {
  clientId: string;
  producto_id: string;
  cantidad: number;
  descuento_porcentaje: number;
};

type Cotizacion = { id: string; nombre_cliente: string | null; fecha: string; creado_en: string };
type CotizacionItem = {
  id: string;
  cotizacion_id: string;
  producto_id: string | null;
  nombre_producto: string;
  cantidad: number;
  descuento_porcentaje: number;
  precio_unitario: number;
  subtotal: number;
  costo_unitario: number | null;
};

function money(v: number | null | undefined) {
  return `$${(v ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function badgeRentabilidad(rentabilidad: number) {
  const color = rentabilidad < 0 ? 'var(--red)' : rentabilidad < 15 ? '#8A6D00' : '#2E7D32';
  const bg = rentabilidad < 0 ? 'var(--tint-red)' : rentabilidad < 15 ? '#FFF3CD' : '#E3F3E4';
  return (
    <span style={{ background: bg, color, padding: '3px 10px', borderRadius: 8, fontWeight: 700, fontSize: 13 }}>
      {rentabilidad.toFixed(1)}%
    </span>
  );
}

function nuevoItem(): ItemForm {
  return { clientId: Math.random().toString(36).slice(2), producto_id: '', cantidad: 1, descuento_porcentaje: 0 };
}

export default function CotizadorPage() {
  const { puedeVer, puedeEditar } = useAuth();
  const puedeVerModulo = puedeVer(MODULO);
  const puedeEditarModulo = puedeEditar(MODULO);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [itemsPorCotizacion, setItemsPorCotizacion] = useState<Record<string, CotizacionItem[]>>({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [baseRentabilidad, setBaseRentabilidad] = useState<'completo' | 'materia_prima'>('completo');

  const [panelAbierto, setPanelAbierto] = useState(false);
  const [nombreClienteForm, setNombreClienteForm] = useState('');
  const [fechaForm, setFechaForm] = useState(() => new Date().toISOString().slice(0, 10));
  const [itemsForm, setItemsForm] = useState<ItemForm[]>([nuevoItem()]);
  const [guardando, setGuardando] = useState(false);

  const [detalleAbiertoId, setDetalleAbiertoId] = useState<string | null>(null);

  async function cargarTodo() {
    setCargando(true);

    const { data: productosData } = await supabase
      .from('productos')
      .select('id, nombre, precio_lista, costo_completo, costo_materia_prima')
      .order('nombre');
    setProductos(productosData ?? []);

    const { data: cotizacionesData } = await supabase.from('cotizaciones').select('*').order('creado_en', { ascending: false });
    setCotizaciones(cotizacionesData ?? []);

    const { data: itemsData } = await supabase.from('cotizacion_items').select('*');
    const mapa: Record<string, CotizacionItem[]> = {};
    (itemsData ?? []).forEach((it) => {
      if (!mapa[it.cotizacion_id]) mapa[it.cotizacion_id] = [];
      mapa[it.cotizacion_id].push(it);
    });
    setItemsPorCotizacion(mapa);

    setCargando(false);
  }

  useEffect(() => {
    if (puedeVerModulo) cargarTodo();
  }, [puedeVerModulo]);

  if (!puedeVerModulo) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Pedile al administrador que te habilite el Cotizador desde el Panel de Accesos.</p>
      </div>
    );
  }

  const cotizacionesFiltradas = cotizaciones.filter((c) => {
    const texto = busqueda.trim().toLowerCase();
    return !texto || (c.nombre_cliente ?? '').toLowerCase().includes(texto);
  });

  function datosProducto(productoId: string) {
    return productos.find((p) => p.id === productoId);
  }

  function precioUnitario(item: ItemForm) {
    const prod = datosProducto(item.producto_id);
    const lista = prod?.precio_lista ?? 0;
    return lista * (1 - (item.descuento_porcentaje || 0) / 100);
  }

  function costoUnitario(item: ItemForm) {
    const prod = datosProducto(item.producto_id);
    if (!prod) return 0;
    return (baseRentabilidad === 'completo' ? prod.costo_completo : prod.costo_materia_prima) ?? 0;
  }

  function actualizarItem(clientId: string, cambios: Partial<ItemForm>) {
    setItemsForm((prev) => prev.map((it) => (it.clientId === clientId ? { ...it, ...cambios } : it)));
  }

  function agregarItem() {
    setItemsForm((prev) => [...prev, nuevoItem()]);
  }

  function quitarItem(clientId: string) {
    setItemsForm((prev) => (prev.length > 1 ? prev.filter((it) => it.clientId !== clientId) : prev));
  }

  function abrirNueva() {
    setNombreClienteForm('');
    setFechaForm(new Date().toISOString().slice(0, 10));
    setItemsForm([nuevoItem()]);
    setPanelAbierto(true);
  }

  const itemsValidos = itemsForm.filter((it) => it.producto_id);
  const totalPrecioForm = itemsValidos.reduce((acc, it) => acc + precioUnitario(it) * (it.cantidad || 0), 0);
  const totalCostoForm = itemsValidos.reduce((acc, it) => acc + costoUnitario(it) * (it.cantidad || 0), 0);
  const rentabilidadForm = totalPrecioForm > 0 ? ((totalPrecioForm - totalCostoForm) / totalPrecioForm) * 100 : 0;

  async function guardarCotizacion(e: React.FormEvent) {
    e.preventDefault();
    if (itemsValidos.length === 0) {
      alert('Agregá al menos un producto.');
      return;
    }

    setGuardando(true);
    try {
      const { data: nueva, error } = await supabase
        .from('cotizaciones')
        .insert({ nombre_cliente: nombreClienteForm || null, fecha: fechaForm })
        .select('id')
        .single();

      if (error || !nueva) throw new Error(error?.message ?? 'No se pudo crear la cotización');

      const filas = itemsValidos.map((it) => {
        const prod = datosProducto(it.producto_id);
        return {
          cotizacion_id: nueva.id,
          producto_id: it.producto_id,
          nombre_producto: prod?.nombre ?? '',
          cantidad: it.cantidad || 1,
          descuento_porcentaje: it.descuento_porcentaje || 0,
          precio_unitario: precioUnitario(it),
          subtotal: precioUnitario(it) * (it.cantidad || 1),
          costo_unitario: costoUnitario(it),
        };
      });

      const { error: errorItems } = await supabase.from('cotizacion_items').insert(filas);
      if (errorItems) throw new Error(errorItems.message);

      setPanelAbierto(false);
      cargarTodo();
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarCotizacion(c: Cotizacion) {
    const confirmado = confirm(`¿Eliminar la cotización de "${c.nombre_cliente || 'sin nombre'}"?`);
    if (!confirmado) return;
    const { error } = await supabase.from('cotizaciones').delete().eq('id', c.id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    cargarTodo();
  }

  function copiarTexto(c: Cotizacion) {
    const items = itemsPorCotizacion[c.id] ?? [];
    const total = items.reduce((acc, it) => acc + Number(it.subtotal), 0);
    const fecha = new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-AR');

    let texto = `Cotización${c.nombre_cliente ? ' - ' + c.nombre_cliente : ''} (${fecha})\n\n`;
    items.forEach((it) => {
      texto += `${it.nombre_producto} x${it.cantidad} — ${money(it.precio_unitario)} c/u = ${money(it.subtotal)}\n`;
    });
    texto += `\nTOTAL: ${money(total)}`;

    navigator.clipboard.writeText(texto).then(
      () => alert('Cotización copiada. Ya podés pegarla en WhatsApp.'),
      () => alert('No se pudo copiar automáticamente. Copiá el texto manualmente.')
    );
  }

  function toggleDetalle(id: string) {
    setDetalleAbiertoId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Cotizador</h1>
          <p className="troya-subtitulo">{cotizaciones.length} cotizaciones{!puedeEditarModulo && ' · Solo lectura'}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button
          className="troya-btn"
          style={baseRentabilidad === 'completo' ? {} : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}
          onClick={() => setBaseRentabilidad('completo')}
        >
          Rent. s/ costo completo
        </button>
        <button
          className="troya-btn"
          style={baseRentabilidad === 'materia_prima' ? {} : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}
          onClick={() => setBaseRentabilidad('materia_prima')}
        >
          Rent. s/ materia prima
        </button>
      </div>

      {puedeEditarModulo && (
        <div className="troya-panel" style={{ marginBottom: 20 }}>
          <button className={`troya-panel-toggle ${panelAbierto ? 'abierto' : ''}`} onClick={() => (panelAbierto ? setPanelAbierto(false) : abrirNueva())}>
            Nueva cotización
            <IconMas />
          </button>
          {panelAbierto && (
            <div className="troya-panel-body">
              <form onSubmit={guardarCotizacion}>
                <div className="troya-form">
                  <input className="troya-input" placeholder="Nombre del cliente (opcional)" value={nombreClienteForm} onChange={(e) => setNombreClienteForm(e.target.value)} />
                  <input className="troya-input" style={{ flex: '0 0 160px' }} type="date" value={fechaForm} onChange={(e) => setFechaForm(e.target.value)} />
                </div>

                <p style={{ fontSize: 13, fontWeight: 600, margin: '16px 0 8px' }}>Productos</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {itemsForm.map((it) => {
                    const prod = datosProducto(it.producto_id);
                    return (
                      <div key={it.clientId} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                        <div className="troya-form" style={{ paddingTop: 0 }}>
                          <select className="troya-input" value={it.producto_id} onChange={(e) => actualizarItem(it.clientId, { producto_id: e.target.value })}>
                            <option value="">Elegir producto...</option>
                            {productos.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                          <input
                            className="troya-input"
                            style={{ flex: '0 0 90px' }}
                            type="number"
                            placeholder="Cant."
                            value={it.cantidad}
                            onChange={(e) => actualizarItem(it.clientId, { cantidad: Number(e.target.value) || 1 })}
                          />
                          <input
                            className="troya-input"
                            style={{ flex: '0 0 130px' }}
                            type="number"
                            placeholder="% descuento"
                            value={it.descuento_porcentaje}
                            onChange={(e) => actualizarItem(it.clientId, { descuento_porcentaje: Number(e.target.value) || 0 })}
                          />
                          <button type="button" className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => quitarItem(it.clientId)} title="Quitar ítem">
                            <IconTacho />
                          </button>
                        </div>
                        {prod && (
                          <p className="troya-subtitulo" style={{ marginTop: 8, marginBottom: 0 }}>
                            Precio lista: {money(prod.precio_lista)} · Con descuento: {money(precioUnitario(it))} c/u · Subtotal: {money(precioUnitario(it) * (it.cantidad || 0))}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button type="button" className="troya-btn troya-btn-secundario" style={{ marginTop: 10 }} onClick={agregarItem}>
                  + Agregar producto
                </button>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 18, padding: '14px 16px', background: 'var(--tint-orange)', borderRadius: 10 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textTransform: 'uppercase' }}>Subtotal (para el cliente)</p>
                    <p style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{money(totalPrecioForm)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textTransform: 'uppercase' }}>Rentabilidad del negocio</p>
                    <div style={{ marginTop: 2 }}>{badgeRentabilidad(rentabilidadForm)}</div>
                  </div>
                </div>

                <div className="troya-card-acciones" style={{ marginTop: 16 }}>
                  <button type="submit" className="troya-btn" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cotización'}</button>
                  <button type="button" className="troya-btn troya-btn-secundario" onClick={() => setPanelAbierto(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      <div className="troya-buscador">
        <IconBuscar />
        <input type="text" placeholder="Buscar por cliente..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : cotizacionesFiltradas.length === 0 ? (
        <div className="troya-vacio">
          <h3>Todavía no hay cotizaciones</h3>
          <p>{puedeEditarModulo ? 'Usá "Nueva cotización" arriba para armar la primera.' : 'Todavía no hay cotizaciones cargadas.'}</p>
        </div>
      ) : (
        <div className="troya-lista">
          {cotizacionesFiltradas.map((c) => {
            const items = itemsPorCotizacion[c.id] ?? [];
            const totalPrecio = items.reduce((acc, it) => acc + Number(it.subtotal), 0);
            const totalCosto = items.reduce((acc, it) => acc + Number(it.costo_unitario ?? 0) * Number(it.cantidad), 0);
            const rentabilidad = totalPrecio > 0 ? ((totalPrecio - totalCosto) / totalPrecio) * 100 : 0;

            return (
              <div key={c.id} className="troya-card troya-card-editando">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', flexWrap: 'wrap', gap: 10 }}>
                  <div className="troya-card-info">
                    <h3>{c.nombre_cliente || 'Sin nombre de cliente'}</h3>
                    <p>{new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-AR')} · {items.length} producto(s) · Total: {money(totalPrecio)}</p>
                  </div>
                  <div className="troya-card-acciones">
                    <button className="troya-icon-btn" onClick={() => toggleDetalle(c.id)} title="Ver detalle">
                      <IconOjo />
                    </button>
                    <button className="troya-icon-btn" onClick={() => copiarTexto(c)} title="Copiar para enviar">
                      <IconCopiar />
                    </button>
                    {puedeEditarModulo && (
                      <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarCotizacion(c)} title="Eliminar">
                        <IconTacho />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Costo: {money(totalCosto)}</span>
                  {badgeRentabilidad(rentabilidad)}
                </div>

                {detalleAbiertoId === c.id && (
                  <div style={{ marginTop: 10, width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((it) => (
                      <div key={it.id} style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{it.nombre_producto}</span>
                        <span>x{it.cantidad}</span>
                        <span>{it.descuento_porcentaje}% desc.</span>
                        <span>{money(it.precio_unitario)} c/u</span>
                        <span style={{ fontWeight: 600 }}>= {money(it.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
function IconBuscar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
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
function IconOjo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconCopiar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
    </svg>
  );
}