'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

type Producto = {
  id: string;
  nombre: string;
  costo_materia_prima: number | null;
  costo_completo: number | null;
};

type PromoItem = {
  clientId: string;
  producto_id: string | null;
  nombre_item: string;
  cantidad: number;
  costo_unitario_manual: number | null;
  precio_unitario_promo: number | null;
  es_regalo: boolean;
};

type Promo = {
  id: string;
  nombre: string;
  tipo: 'combo_cerrado' | 'por_unidad';
  precio_promocional: number | null;
  activa: boolean;
};

type PromoItemGuardado = {
  id: string;
  promo_id: string;
  producto_id: string | null;
  nombre_item: string;
  cantidad: number;
  costo_unitario_manual: number | null;
  precio_unitario_promo: number | null;
  es_regalo: boolean;
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

function nuevoItem(): PromoItem {
  return {
    clientId: Math.random().toString(36).slice(2),
    producto_id: null,
    nombre_item: '',
    cantidad: 1,
    costo_unitario_manual: null,
    precio_unitario_promo: null,
    es_regalo: false,
  };
}

export default function PromosPage() {
  const { usuario } = useAuth();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [itemsPorPromo, setItemsPorPromo] = useState<Record<string, PromoItemGuardado[]>>({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [baseRentabilidad, setBaseRentabilidad] = useState<'completo' | 'materia_prima'>('completo');

  const [panelAbierto, setPanelAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreForm, setNombreForm] = useState('');
  const [tipoForm, setTipoForm] = useState<'combo_cerrado' | 'por_unidad'>('combo_cerrado');
  const [precioComboForm, setPrecioComboForm] = useState('');
  const [itemsForm, setItemsForm] = useState<PromoItem[]>([nuevoItem()]);
  const [guardando, setGuardando] = useState(false);

  async function cargarTodo() {
    setCargando(true);

    const { data: productosData } = await supabase.from('productos').select('id, nombre, costo_materia_prima, costo_completo').order('nombre');
    setProductos(productosData ?? []);

    const { data: promosData } = await supabase.from('promos').select('*').order('creado_en', { ascending: false });
    setPromos(promosData ?? []);

    const { data: itemsData } = await supabase.from('promo_items').select('*');
    const mapa: Record<string, PromoItemGuardado[]> = {};
    (itemsData ?? []).forEach((it) => {
      if (!mapa[it.promo_id]) mapa[it.promo_id] = [];
      mapa[it.promo_id].push(it);
    });
    setItemsPorPromo(mapa);

    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  if (!usuario?.es_dueno) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Promos es exclusivo del dueño.</p>
      </div>
    );
  }

  const promosFiltradas = promos.filter((p) => {
    const texto = busqueda.trim().toLowerCase();
    return !texto || p.nombre.toLowerCase().includes(texto);
  });

  function costoUnitario(item: { producto_id: string | null; costo_unitario_manual: number | null }) {
    if (item.producto_id) {
      const prod = productos.find((p) => p.id === item.producto_id);
      if (!prod) return 0;
      return (baseRentabilidad === 'completo' ? prod.costo_completo : prod.costo_materia_prima) ?? 0;
    }
    return item.costo_unitario_manual ?? 0;
  }

  function abrirNuevaPromo() {
    setEditandoId(null);
    setNombreForm('');
    setTipoForm('combo_cerrado');
    setPrecioComboForm('');
    setItemsForm([nuevoItem()]);
    setPanelAbierto(true);
  }

  function abrirEdicion(promo: Promo) {
    setEditandoId(promo.id);
    setNombreForm(promo.nombre);
    setTipoForm(promo.tipo);
    setPrecioComboForm(promo.precio_promocional != null ? String(promo.precio_promocional) : '');
    const guardados = itemsPorPromo[promo.id] ?? [];
    setItemsForm(
      guardados.length > 0
        ? guardados.map((it) => ({
            clientId: it.id,
            producto_id: it.producto_id,
            nombre_item: it.nombre_item,
            cantidad: Number(it.cantidad),
            costo_unitario_manual: it.costo_unitario_manual,
            precio_unitario_promo: it.precio_unitario_promo,
            es_regalo: it.es_regalo,
          }))
        : [nuevoItem()]
    );
    setPanelAbierto(true);
  }

  function actualizarItem(clientId: string, cambios: Partial<PromoItem>) {
    setItemsForm((prev) => prev.map((it) => (it.clientId === clientId ? { ...it, ...cambios } : it)));
  }

  function seleccionarProducto(clientId: string, productoId: string) {
    const prod = productos.find((p) => p.id === productoId);
    actualizarItem(clientId, {
      producto_id: productoId || null,
      nombre_item: prod?.nombre ?? '',
      es_regalo: false,
      costo_unitario_manual: null,
    });
  }

  function agregarItem() {
    setItemsForm((prev) => [...prev, nuevoItem()]);
  }

  function quitarItem(clientId: string) {
    setItemsForm((prev) => (prev.length > 1 ? prev.filter((it) => it.clientId !== clientId) : prev));
  }

  const costoTotalForm = itemsForm.reduce((acc, it) => acc + costoUnitario(it) * (it.cantidad || 0), 0);
  const precioTotalForm =
    tipoForm === 'combo_cerrado'
      ? Number(precioComboForm) || 0
      : itemsForm.reduce((acc, it) => acc + (it.precio_unitario_promo ?? 0) * (it.cantidad || 0), 0);
  const rentabilidadForm = precioTotalForm > 0 ? ((precioTotalForm - costoTotalForm) / precioTotalForm) * 100 : 0;

  async function guardarPromo(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreForm.trim()) return;
    if (itemsForm.some((it) => !it.nombre_item.trim())) {
      alert('Todos los ítems necesitan un producto elegido o un nombre (si es regalo/libre).');
      return;
    }

    setGuardando(true);

    try {
      let promoId = editandoId;

      if (editandoId) {
        const { error } = await supabase
          .from('promos')
          .update({
            nombre: nombreForm,
            tipo: tipoForm,
            precio_promocional: tipoForm === 'combo_cerrado' ? Number(precioComboForm) || 0 : null,
          })
          .eq('id', editandoId);
        if (error) throw new Error(error.message);

        await supabase.from('promo_items').delete().eq('promo_id', editandoId);
      } else {
        const { data: nueva, error } = await supabase
          .from('promos')
          .insert({
            nombre: nombreForm,
            tipo: tipoForm,
            precio_promocional: tipoForm === 'combo_cerrado' ? Number(precioComboForm) || 0 : null,
          })
          .select('id')
          .single();
        if (error || !nueva) throw new Error(error?.message ?? 'No se pudo crear la promo');
        promoId = nueva.id;
      }

      const filasItems = itemsForm.map((it) => ({
        promo_id: promoId,
        producto_id: it.producto_id,
        nombre_item: it.nombre_item,
        cantidad: it.cantidad || 1,
        costo_unitario_manual: it.producto_id ? null : it.costo_unitario_manual,
        precio_unitario_promo: tipoForm === 'por_unidad' ? it.precio_unitario_promo : null,
        es_regalo: it.es_regalo,
      }));

      const { error: errorItems } = await supabase.from('promo_items').insert(filasItems);
      if (errorItems) throw new Error(errorItems.message);

      setPanelAbierto(false);
      cargarTodo();
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActiva(promo: Promo) {
    const { error } = await supabase.from('promos').update({ activa: !promo.activa }).eq('id', promo.id);
    if (error) { alert('Error: ' + error.message); return; }
    cargarTodo();
  }

  async function eliminarPromo(promo: Promo) {
    const confirmado = confirm(`¿Eliminar la promo "${promo.nombre}"?`);
    if (!confirmado) return;
    const { error } = await supabase.from('promos').delete().eq('id', promo.id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    cargarTodo();
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Promos</h1>
          <p className="troya-subtitulo">{promos.length} promos armadas</p>
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

      <div className="troya-panel" style={{ marginBottom: 20 }}>
        <button className={`troya-panel-toggle ${panelAbierto ? 'abierto' : ''}`} onClick={() => (panelAbierto ? setPanelAbierto(false) : abrirNuevaPromo())}>
          {editandoId ? 'Editando promo' : 'Nueva promo'}
          <IconMas />
        </button>
        {panelAbierto && (
          <div className="troya-panel-body">
            <form onSubmit={guardarPromo}>
              <div className="troya-form">
                <input className="troya-input" placeholder="Nombre de la promo" value={nombreForm} onChange={(e) => setNombreForm(e.target.value)} required />
                <select className="troya-input" style={{ flex: '0 0 220px' }} value={tipoForm} onChange={(e) => setTipoForm(e.target.value as any)}>
                  <option value="combo_cerrado">Precio único de combo</option>
                  <option value="por_unidad">Precio especial por unidad</option>
                </select>
                {tipoForm === 'combo_cerrado' && (
                  <input className="troya-input" style={{ flex: '0 0 180px' }} type="number" placeholder="Precio del combo" value={precioComboForm} onChange={(e) => setPrecioComboForm(e.target.value)} />
                )}
              </div>

              <p style={{ fontSize: 13, fontWeight: 600, margin: '16px 0 8px' }}>Ítems de la promo</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {itemsForm.map((it) => (
                  <div key={it.clientId} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                    <div className="troya-form" style={{ paddingTop: 0, marginBottom: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={it.es_regalo}
                          onChange={(e) => actualizarItem(it.clientId, { es_regalo: e.target.checked, producto_id: e.target.checked ? null : it.producto_id })}
                        />
                        Ítem libre / regalo (no está en el catálogo)
                      </label>
                    </div>

                    <div className="troya-form" style={{ paddingTop: 0 }}>
                      {it.es_regalo ? (
                        <>
                          <input
                            className="troya-input"
                            placeholder="Nombre del regalo/ítem"
                            value={it.nombre_item}
                            onChange={(e) => actualizarItem(it.clientId, { nombre_item: e.target.value })}
                          />
                          <input
                            className="troya-input"
                            style={{ flex: '0 0 160px' }}
                            type="number"
                            placeholder="Costo estimado (opcional)"
                            value={it.costo_unitario_manual ?? ''}
                            onChange={(e) => actualizarItem(it.clientId, { costo_unitario_manual: e.target.value ? Number(e.target.value) : null })}
                          />
                        </>
                      ) : (
                        <select className="troya-input" value={it.producto_id ?? ''} onChange={(e) => seleccionarProducto(it.clientId, e.target.value)}>
                          <option value="">Elegir producto...</option>
                          {productos.map((p) => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                          ))}
                        </select>
                      )}

                      <input
                        className="troya-input"
                        style={{ flex: '0 0 90px' }}
                        type="number"
                        placeholder="Cant."
                        value={it.cantidad}
                        onChange={(e) => actualizarItem(it.clientId, { cantidad: Number(e.target.value) || 1 })}
                      />

                      {tipoForm === 'por_unidad' && (
                        <input
                          className="troya-input"
                          style={{ flex: '0 0 160px' }}
                          type="number"
                          placeholder="Precio promo x unidad"
                          value={it.precio_unitario_promo ?? ''}
                          onChange={(e) => actualizarItem(it.clientId, { precio_unitario_promo: e.target.value ? Number(e.target.value) : null })}
                        />
                      )}

                      <button type="button" className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => quitarItem(it.clientId)} title="Quitar ítem">
                        <IconTacho />
                      </button>
                    </div>

                    <p className="troya-subtitulo" style={{ marginTop: 8, marginBottom: 0 }}>
                      Costo de este ítem: {money(costoUnitario(it))} x {it.cantidad || 0} = {money(costoUnitario(it) * (it.cantidad || 0))}
                    </p>
                  </div>
                ))}
              </div>

              <button type="button" className="troya-btn troya-btn-secundario" style={{ marginTop: 10 }} onClick={agregarItem}>
                + Agregar ítem
              </button>

              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 18, padding: '14px 16px', background: 'var(--tint-orange)', borderRadius: 10 }}>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textTransform: 'uppercase' }}>Costo total</p>
                  <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{money(costoTotalForm)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textTransform: 'uppercase' }}>Precio total</p>
                  <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{money(precioTotalForm)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textTransform: 'uppercase' }}>Rentabilidad</p>
                  <div style={{ marginTop: 2 }}>{badgeRentabilidad(rentabilidadForm)}</div>
                </div>
              </div>

              <div className="troya-card-acciones" style={{ marginTop: 16 }}>
                <button type="submit" className="troya-btn" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar promo'}</button>
                <button type="button" className="troya-btn troya-btn-secundario" onClick={() => setPanelAbierto(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="troya-buscador">
        <IconBuscar />
        <input type="text" placeholder="Buscar promo..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : promosFiltradas.length === 0 ? (
        <div className="troya-vacio">
          <h3>Todavía no armaste ninguna promo</h3>
          <p>Usá "Nueva promo" arriba para crear la primera.</p>
        </div>
      ) : (
        <div className="troya-lista">
          {promosFiltradas.map((promo) => {
            const items = itemsPorPromo[promo.id] ?? [];
            const costoTotal = items.reduce((acc, it) => {
              const c = it.producto_id
                ? (baseRentabilidad === 'completo'
                    ? productos.find((p) => p.id === it.producto_id)?.costo_completo
                    : productos.find((p) => p.id === it.producto_id)?.costo_materia_prima) ?? 0
                : it.costo_unitario_manual ?? 0;
              return acc + c * Number(it.cantidad);
            }, 0);
            const precioTotal =
              promo.tipo === 'combo_cerrado'
                ? promo.precio_promocional ?? 0
                : items.reduce((acc, it) => acc + (it.precio_unitario_promo ?? 0) * Number(it.cantidad), 0);
            const rentabilidad = precioTotal > 0 ? ((precioTotal - costoTotal) / precioTotal) * 100 : 0;

            return (
              <div key={promo.id} className="troya-card troya-card-editando">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', flexWrap: 'wrap', gap: 10 }}>
                  <div className="troya-card-info">
                    <h3>{promo.nombre} {!promo.activa && '(desactivada)'}</h3>
                    <p>
                      {items.map((it) => `${it.nombre_item} x${it.cantidad}`).join(' + ')}
                      {' · '}
                      {promo.tipo === 'combo_cerrado' ? 'Precio de combo' : 'Precio por unidad'}: {money(precioTotal)}
                    </p>
                  </div>
                  <div className="troya-card-acciones">
                    <button className="troya-btn troya-btn-secundario" onClick={() => toggleActiva(promo)}>
                      {promo.activa ? 'Desactivar' : 'Reactivar'}
                    </button>
                    <button className="troya-icon-btn" onClick={() => abrirEdicion(promo)} title="Editar">
                      <IconLapiz />
                    </button>
                    <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarPromo(promo)} title="Eliminar">
                      <IconTacho />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Costo: {money(costoTotal)}</span>
                  {badgeRentabilidad(rentabilidad)}
                </div>
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