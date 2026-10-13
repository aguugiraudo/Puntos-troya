'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

type Producto = {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  costo_completo: number | null;
  costo_materia_prima: number | null;
  precio_lista: number | null;
};

type Item = {
  key: string;
  producto_id: string | null; // null = ítem extra (regalo / otro)
  nombre: string;
  cantidad: string;
  precio_lista: number; // por unidad
  descuento: string; // % sobre lista
  precio_promo: string; // por unidad (se calcula del descuento, o se escribe a mano)
  costo_completo: number;
  costo_mp: number;
};

type Promo = {
  id: string;
  nombre: string;
  tipo: 'por_unidad' | 'combo_cerrado';
  precio_combo: number | null;
  activa: boolean;
  items: Array<{
    producto_id: string | null; nombre: string; cantidad: number; precio_lista: number;
    descuento: number; precio_promo: number; costo_completo: number; costo_mp: number;
  }>;
};

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
const num = (s: string) => {
  const v = parseFloat((s || '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
};
const redondear = (n: number) => Math.round(n);
let contador = 0;
const nuevaKey = () => `i${Date.now()}_${contador++}`;

function colorRent(r: number) {
  if (r >= 30) return '#2e7d32';
  if (r >= 15) return '#b8860b';
  return '#DA231F';
}

export default function PromosPage() {
  const { puedeVer, puedeEditar } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [editando, setEditando] = useState(false);
  const [promoId, setPromoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'por_unidad' | 'combo_cerrado'>('por_unidad');
  const [precioCombo, setPrecioCombo] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [descGlobal, setDescGlobal] = useState('');
  const [usarMP, setUsarMP] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const editar = puedeEditar('promos');

  async function cargar() {
    setCargando(true);
    const [p, pr] = await Promise.all([
      supabase.from('productos')
        .select('id, nombre, codigo, categoria, costo_completo, costo_materia_prima, precio_lista')
        .order('categoria').order('nombre'),
      supabase.from('promos_v2').select('*, promos_v2_items(*)').order('created_at', { ascending: false }),
    ]);
    if (p.error) setError(p.error.message);
    setProductos((p.data as Producto[]) || []);
    if (pr.error) {
      setError('No se pudo leer promos_v2. ¿Corriste el SQL? ' + pr.error.message);
    } else {
      setPromos(((pr.data as any[]) || []).map((x) => ({
        id: x.id, nombre: x.nombre, tipo: x.tipo, precio_combo: x.precio_combo, activa: x.activa,
        items: (x.promos_v2_items || []).sort((a: any, b: any) => (a.orden || 0) - (b.orden || 0)).map((i: any) => ({
          producto_id: i.producto_id, nombre: i.nombre, cantidad: Number(i.cantidad) || 1,
          precio_lista: Number(i.precio_lista) || 0, descuento: Number(i.descuento) || 0,
          precio_promo: Number(i.precio_promo) || 0,
          costo_completo: Number(i.costo_completo) || 0, costo_mp: Number(i.costo_mp) || 0,
        })),
      })));
    }
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  const porCategoria = useMemo(() => {
    const m: Record<string, Producto[]> = {};
    productos.forEach((p) => { (m[p.categoria || 'Sin categoría'] ||= []).push(p); });
    return m;
  }, [productos]);

  function nueva() {
    setPromoId(null); setNombre(''); setTipo('por_unidad'); setPrecioCombo('');
    setItems([itemVacio()]); setDescGlobal(''); setEditando(true);
  }
  function itemVacio(): Item {
    return { key: nuevaKey(), producto_id: null, nombre: '', cantidad: '1', precio_lista: 0, descuento: '0', precio_promo: '', costo_completo: 0, costo_mp: 0 };
  }
  function editarPromo(p: Promo) {
    setPromoId(p.id); setNombre(p.nombre); setTipo(p.tipo);
    setPrecioCombo(p.precio_combo ? String(p.precio_combo) : '');
    setItems(p.items.map((i) => ({
      key: nuevaKey(), producto_id: i.producto_id, nombre: i.nombre, cantidad: String(i.cantidad),
      precio_lista: i.precio_lista, descuento: String(i.descuento), precio_promo: String(i.precio_promo),
      costo_completo: i.costo_completo, costo_mp: i.costo_mp,
    })));
    setDescGlobal(''); setEditando(true);
  }

  function setItem(key: string, cambios: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...cambios } : i)));
  }
  function elegirProducto(key: string, id: string) {
    const p = productos.find((x) => x.id === id);
    if (!p) { setItem(key, { producto_id: null, nombre: '', precio_lista: 0, costo_completo: 0, costo_mp: 0, precio_promo: '' }); return; }
    const lista = p.precio_lista || 0;
    setItem(key, {
      producto_id: p.id, nombre: p.nombre, precio_lista: lista, descuento: '0',
      precio_promo: String(lista), costo_completo: p.costo_completo || 0, costo_mp: p.costo_materia_prima || 0,
    });
  }
  function cambiarDescuento(key: string, d: string) {
    const it = items.find((i) => i.key === key);
    if (!it) return;
    const precio = redondear(it.precio_lista * (1 - num(d) / 100));
    setItem(key, { descuento: d, precio_promo: it.precio_lista ? String(precio) : it.precio_promo });
  }
  function cambiarPrecio(key: string, v: string) {
    const it = items.find((i) => i.key === key);
    if (!it) return;
    let d = it.descuento;
    if (it.precio_lista > 0) d = String(Math.round((1 - num(v) / it.precio_lista) * 1000) / 10);
    setItem(key, { precio_promo: v, descuento: d });
  }
  function aplicarDescGlobal(d: string) {
    setDescGlobal(d);
    setItems((prev) => prev.map((i) => i.producto_id && i.precio_lista
      ? { ...i, descuento: d, precio_promo: String(redondear(i.precio_lista * (1 - num(d) / 100))) }
      : i));
  }
  function agregarExtra() {
    setItems((prev) => [...prev, { ...itemVacio(), nombre: '', descuento: '0', precio_promo: '0' }].map((i, idx, arr) =>
      idx === arr.length - 1 ? { ...i, producto_id: null, nombre: '__extra__' } : i));
  }

  // ---- Cálculos ----
  const filas = items.map((i) => {
    const cant = num(i.cantidad);
    const promoU = num(i.precio_promo);
    const costoU = usarMP ? i.costo_mp : i.costo_completo;
    return { ...i, cant, promoU, listaTotal: i.precio_lista * cant, promoTotal: promoU * cant, costoTotal: costoU * cant };
  });
  const totalLista = filas.reduce((a, f) => a + f.listaTotal, 0);
  const totalCosto = filas.reduce((a, f) => a + f.costoTotal, 0);
  const sumaPromoItems = filas.reduce((a, f) => a + f.promoTotal, 0);
  const totalPromo = tipo === 'combo_cerrado' ? num(precioCombo) : sumaPromoItems;
  const ganancia = totalPromo - totalCosto;
  const rent = totalPromo > 0 ? (ganancia / totalPromo) * 100 : 0;
  const descTotal = totalLista > 0 && totalPromo > 0 ? (1 - totalPromo / totalLista) * 100 : 0;

  async function guardar() {
    if (!nombre.trim()) { alert('Poné un nombre a la promo.'); return; }
    const validos = items.filter((i) => (i.producto_id || (i.nombre && i.nombre !== '__extra__')) && num(i.cantidad) > 0);
    if (!validos.length) { alert('Agregá al menos un ítem.'); return; }
    setGuardando(true);
    const cab = { nombre: nombre.trim(), tipo, precio_combo: tipo === 'combo_cerrado' ? num(precioCombo) : null };
    let id = promoId;
    if (id) {
      const { error: e } = await supabase.from('promos_v2').update(cab).eq('id', id);
      if (e) { alert(e.message); setGuardando(false); return; }
      await supabase.from('promos_v2_items').delete().eq('promo_id', id);
    } else {
      const { data, error: e } = await supabase.from('promos_v2').insert({ ...cab, activa: true }).select('id').single();
      if (e || !data) { alert(e?.message || 'Error'); setGuardando(false); return; }
      id = data.id;
    }
    const filasDb = validos.map((i, idx) => ({
      promo_id: id, orden: idx, producto_id: i.producto_id, nombre: i.nombre,
      cantidad: num(i.cantidad), precio_lista: i.precio_lista, descuento: num(i.descuento),
      precio_promo: num(i.precio_promo), costo_completo: i.costo_completo, costo_mp: i.costo_mp,
    }));
    const { error: e2 } = await supabase.from('promos_v2_items').insert(filasDb);
    if (e2) alert(e2.message);
    setGuardando(false); setEditando(false); cargar();
  }
  async function alternar(p: Promo) {
    await supabase.from('promos_v2').update({ activa: !p.activa }).eq('id', p.id); cargar();
  }
  async function eliminar(p: Promo) {
    if (!confirm(`¿Eliminar la promo "${p.nombre}"?`)) return;
    await supabase.from('promos_v2').delete().eq('id', p.id); cargar();
  }

  if (!puedeVer('promos')) return <div className="troya-vacio">No tenés acceso a este módulo.</div>;

  const celda: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' };
  const inp: React.CSSProperties = { width: '100%' };

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Promos</h1>
          <p className="troya-subtitulo">Armá combos con precio de lista, descuento y rentabilidad en vivo.</p>
        </div>
        {editar && !editando && <button className="troya-btn" onClick={nueva}>+ Nueva promo</button>}
      </div>

      {error && <div className="troya-vacio" style={{ color: 'var(--red)' }}>{error}</div>}

      {editando && (
        <div className="troya-card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 14 }}>
            <label>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nombre de la promo</div>
              <input className="troya-input" style={inp} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Combo asador" />
            </label>
            <label>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cómo se cobra</div>
              <select className="troya-input" style={inp} value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                <option value="por_unidad">Descuento por ítem (se suma cada precio)</option>
                <option value="combo_cerrado">Precio único para todo el combo</option>
              </select>
            </label>
            {tipo === 'combo_cerrado' ? (
              <label>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Precio del combo ($)</div>
                <input className="troya-input" style={inp} inputMode="decimal" value={precioCombo} onChange={(e) => setPrecioCombo(e.target.value)} placeholder="Precio final del combo" />
              </label>
            ) : (
              <label>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Descuento a todos los productos (%)</div>
                <input className="troya-input" style={inp} inputMode="decimal" value={descGlobal} onChange={(e) => aplicarDescGlobal(e.target.value)} placeholder="Ej: 15  (después ajustás uno por uno)" />
              </label>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="troya-matriz-tabla" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--muted)' }}>
                  <th style={celda}>Producto</th>
                  <th style={celda}>Cant.</th>
                  <th style={celda}>Precio lista</th>
                  {tipo === 'por_unidad' && <th style={celda}>Desc. %</th>}
                  {tipo === 'por_unidad' && <th style={celda}>Precio promo</th>}
                  <th style={celda}>{tipo === 'por_unidad' ? 'Subtotal promo' : 'Subtotal lista'}</th>
                  <th style={celda}>Costo</th>
                  <th style={celda}></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const esExtra = !f.producto_id && f.nombre !== '' ;
                  const sinElegir = !f.producto_id && f.nombre === '';
                  return (
                    <tr key={f.key} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ ...celda, minWidth: 220 }}>
                        {esExtra ? (
                          <input className="troya-input" style={inp} placeholder="Ej: Regalo – tabla de madera"
                            value={f.nombre === '__extra__' ? '' : f.nombre}
                            onChange={(e) => setItem(f.key, { nombre: e.target.value || '__extra__' })} />
                        ) : (
                          <select className="troya-input" style={inp} value={f.producto_id || ''} onChange={(e) => elegirProducto(f.key, e.target.value)}>
                            <option value="">Elegir producto…</option>
                            {Object.entries(porCategoria).map(([cat, ps]) => (
                              <optgroup key={cat} label={cat}>
                                {ps.map((p) => <option key={p.id} value={p.id}>{p.codigo ? p.codigo + ' · ' : ''}{p.nombre}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        )}
                        {esExtra && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Ítem fuera del catálogo (regalo u otro)</div>}
                      </td>
                      <td style={{ ...celda, width: 70 }}>
                        <input className="troya-input" style={inp} inputMode="numeric" value={f.cantidad} onChange={(e) => setItem(f.key, { cantidad: e.target.value })} />
                      </td>
                      <td style={celda}>
                        {esExtra
                          ? <input className="troya-input" style={{ ...inp, minWidth: 90 }} inputMode="decimal" placeholder="0" value={f.precio_lista || ''}
                              onChange={(e) => setItem(f.key, { precio_lista: num(e.target.value) })} />
                          : sinElegir ? '—' : pesos(f.precio_lista)}
                      </td>
                      {tipo === 'por_unidad' && (
                        <td style={{ ...celda, width: 90 }}>
                          <input className="troya-input" style={inp} inputMode="decimal" value={f.descuento}
                            disabled={!f.precio_lista} onChange={(e) => cambiarDescuento(f.key, e.target.value)} />
                        </td>
                      )}
                      {tipo === 'por_unidad' && (
                        <td style={{ ...celda, width: 130 }}>
                          <input className="troya-input" style={inp} inputMode="decimal" value={f.precio_promo}
                            placeholder={esExtra ? '0 = regalo' : ''} onChange={(e) => cambiarPrecio(f.key, e.target.value)} />
                        </td>
                      )}
                      <td style={{ ...celda, whiteSpace: 'nowrap' }}>
                        {tipo === 'por_unidad' ? (f.promoTotal === 0 && !sinElegir ? <b style={{ color: 'var(--orange)' }}>Regalo</b> : pesos(f.promoTotal)) : pesos(f.listaTotal)}
                      </td>
                      <td style={{ ...celda, whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        {pesos(f.costoTotal)}
                        {esExtra && (
                          <input className="troya-input" style={{ ...inp, marginTop: 4, minWidth: 90 }} inputMode="decimal"
                            placeholder="Costo c/u" value={(usarMP ? f.costo_mp : f.costo_completo) || ''}
                            onChange={(e) => setItem(f.key, { costo_completo: num(e.target.value), costo_mp: num(e.target.value) })} />
                        )}
                      </td>
                      <td style={celda}>
                        <button className="troya-btn-secundario" title="Quitar" onClick={() => setItems((p) => p.filter((i) => i.key !== f.key))}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0' }}>
            <button className="troya-btn-secundario" onClick={() => setItems((p) => [...p, itemVacio()])}>+ Agregar producto</button>
            <button className="troya-btn-secundario" onClick={agregarExtra}>+ Agregar regalo / ítem fuera del catálogo</button>
          </div>

          <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <input type="checkbox" checked={usarMP} onChange={(e) => setUsarMP(e.target.checked)} />
            Calcular rentabilidad sobre materia prima (si no, sobre costo completo)
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, background: 'var(--tint-orange)', padding: 12, borderRadius: 10 }}>
            <Dato t="Total a precio de lista" v={pesos(totalLista)} />
            <Dato t="Descuento total" v={`${descTotal.toFixed(1)}%`} />
            <Dato t="PRECIO TOTAL DE LA PROMO" v={pesos(totalPromo)} grande />
            <Dato t="Costo total" v={pesos(totalCosto)} />
            <Dato t="Ganancia" v={pesos(ganancia)} />
            <Dato t="RENTABILIDAD TOTAL" v={`${rent.toFixed(1)}%`} grande color={colorRent(rent)} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="troya-btn" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar promo'}</button>
            <button className="troya-btn-secundario" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {cargando ? <div className="troya-vacio">Cargando…</div> : promos.length === 0 && !editando ? (
        <div className="troya-vacio">Todavía no hay promos. Creá la primera con “Nueva promo”.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {promos.map((p) => {
            const costo = p.items.reduce((a, i) => a + (usarMP ? i.costo_mp : i.costo_completo) * i.cantidad, 0);
            const lista = p.items.reduce((a, i) => a + i.precio_lista * i.cantidad, 0);
            const total = p.tipo === 'combo_cerrado' ? (p.precio_combo || 0) : p.items.reduce((a, i) => a + i.precio_promo * i.cantidad, 0);
            const r = total > 0 ? ((total - costo) / total) * 100 : 0;
            return (
              <div key={p.id} className="troya-card" style={{ padding: 14, opacity: p.activa ? 1 : 0.55 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{p.nombre}</b>
                    {!p.activa && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>(desactivada)</span>}
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                      {p.items.map((i) => `${i.cantidad}× ${i.nombre}${i.precio_promo === 0 ? ' (regalo)' : ''}`).join(' · ')}
                    </div>
                  </div>
                  {editar && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="troya-btn-secundario" onClick={() => editarPromo(p)}>Editar</button>
                      <button className="troya-btn-secundario" onClick={() => alternar(p)}>{p.activa ? 'Desactivar' : 'Activar'}</button>
                      <button className="troya-btn-secundario" onClick={() => eliminar(p)}>Eliminar</button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10, fontSize: 14 }}>
                  <span>Lista: <b>{pesos(lista)}</b></span>
                  <span>Precio promo: <b>{pesos(total)}</b></span>
                  <span>Costo: <b>{pesos(costo)}</b></span>
                  <span>Rentabilidad: <b style={{ color: colorRent(r) }}>{r.toFixed(1)}%</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dato({ t, v, grande, color }: { t: string; v: string; grande?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{t}</div>
      <div style={{ fontSize: grande ? 22 : 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: color || 'var(--ink)' }}>{v}</div>
    </div>
  );
}
