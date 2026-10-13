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
  extra: boolean; // true = regalo / ítem fuera del catálogo
  producto_id: string | null;
  nombre: string;
  cantidad: string;
  precio_lista: number;
  descuento: string; // % sobre lista
  precio_promo: string; // solo dígitos, por unidad
  costo_completo: number;
  costo_mp: number;
};

type Promo = {
  id: string;
  nombre: string;
  tipo: 'por_unidad' | 'combo_cerrado';
  precio_combo: number | null;
  activa: boolean;
  plazo: string;
  observacion: string;
  costo_fin_30: number;
  items: Array<{
    producto_id: string | null; nombre: string; cantidad: number; precio_lista: number;
    descuento: number; precio_promo: number; costo_completo: number; costo_mp: number;
  }>;
};

type Base = 'completo' | 'mp' | 'ambas';

const PLAZOS = ['Contado', '30', '30/60', '30/60/90', '30/60/90/120'];

const pesos = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR');
const num = (s: string) => {
  const v = parseFloat((s || '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
};
let contador = 0;
const nuevaKey = () => `i${Date.now()}_${contador++}`;

// Plazo "30/60/90" -> promedio de días 60 -> 2 períodos de 30 días.
function periodos(plazo: string): number {
  const d = (plazo || '').match(/\d+/g);
  if (!d || !d.length) return 0;
  const nums = d.map(Number);
  const prom = nums.reduce((a, b) => a + b, 0) / nums.length;
  return prom / 30;
}

function colorRent(r: number) {
  if (r >= 30) return '#2e7d32';
  if (r >= 15) return '#b8860b';
  return '#DA231F';
}

// Campo de dinero: muestra siempre "$ 1.234.567" y guarda solo dígitos.
function InputPesos({ value, onChange, placeholder, disabled, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; style?: React.CSSProperties;
}) {
  const digitos = (value || '').replace(/\D/g, '');
  const texto = digitos ? '$ ' + Number(digitos).toLocaleString('es-AR') : '';
  return (
    <input
      className="troya-input"
      style={{ width: '100%', ...style }}
      inputMode="numeric"
      disabled={disabled}
      placeholder={placeholder ? '$ ' + placeholder : '$ 0'}
      value={texto}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  );
}

export default function PromosPage() {
  const { puedeVer, puedeEditar } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Parámetro general: costo financiero cada 30 días (%)
  const [cf30, setCf30] = useState(0);
  const [cf30Txt, setCf30Txt] = useState('');
  const [editandoCf, setEditandoCf] = useState(false);

  const [editando, setEditando] = useState(false);
  const [promoId, setPromoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'por_unidad' | 'combo_cerrado'>('por_unidad');
  const [precioCombo, setPrecioCombo] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [descGlobal, setDescGlobal] = useState('');
  const [base, setBase] = useState<Base>('completo');
  const [plazoSel, setPlazoSel] = useState('Contado');
  const [plazoOtro, setPlazoOtro] = useState('');
  const [observacion, setObservacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const editar = puedeEditar('promos');

  async function cargar() {
    setCargando(true);
    const [p, pr, cfg] = await Promise.all([
      supabase.from('productos')
        .select('id, nombre, codigo, categoria, costo_completo, costo_materia_prima, precio_lista')
        .order('categoria').order('nombre'),
      supabase.from('promos_v2').select('*, promos_v2_items(*)').order('created_at', { ascending: false }),
      supabase.from('promos_config').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (p.error) setError(p.error.message);
    setProductos((p.data as Producto[]) || []);
    if (cfg.data) { setCf30(Number((cfg.data as any).costo_financiero_30) || 0); }
    if (pr.error) {
      setError('No se pudo leer promos_v2. ¿Corriste el SQL nuevo? ' + pr.error.message);
    } else {
      setPromos(((pr.data as any[]) || []).map((x) => ({
        id: x.id, nombre: x.nombre, tipo: x.tipo, precio_combo: x.precio_combo, activa: x.activa,
        plazo: x.plazo || 'Contado', observacion: x.observacion || '', costo_fin_30: Number(x.costo_fin_30) || 0,
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

  async function guardarCf() {
    const v = num(cf30Txt);
    const { error: e } = await supabase.from('promos_config').upsert({ id: 1, costo_financiero_30: v });
    if (e) { alert(e.message); return; }
    setCf30(v); setEditandoCf(false);
  }

  const porCategoria = useMemo(() => {
    const m: Record<string, Producto[]> = {};
    productos.forEach((p) => { (m[p.categoria || 'Sin categoría'] ||= []).push(p); });
    return m;
  }, [productos]);

  function itemVacio(extra = false): Item {
    return { key: nuevaKey(), extra, producto_id: null, nombre: '', cantidad: '1', precio_lista: 0, descuento: '0', precio_promo: '', costo_completo: 0, costo_mp: 0 };
  }
  function nueva() {
    setPromoId(null); setNombre(''); setTipo('por_unidad'); setPrecioCombo('');
    setItems([itemVacio()]); setDescGlobal(''); setBase('completo');
    setPlazoSel('Contado'); setPlazoOtro(''); setObservacion(''); setEditando(true);
  }
  function editarPromo(p: Promo) {
    setPromoId(p.id); setNombre(p.nombre); setTipo(p.tipo);
    setPrecioCombo(p.precio_combo ? String(Math.round(p.precio_combo)) : '');
    setItems(p.items.map((i) => ({
      key: nuevaKey(), extra: !i.producto_id, producto_id: i.producto_id, nombre: i.nombre, cantidad: String(i.cantidad),
      precio_lista: i.precio_lista, descuento: String(i.descuento), precio_promo: String(Math.round(i.precio_promo)),
      costo_completo: i.costo_completo, costo_mp: i.costo_mp,
    })));
    if (PLAZOS.includes(p.plazo)) { setPlazoSel(p.plazo); setPlazoOtro(''); }
    else { setPlazoSel('Otro'); setPlazoOtro(p.plazo); }
    setObservacion(p.observacion); setDescGlobal(''); setBase('completo'); setEditando(true);
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
      precio_promo: String(Math.round(lista)), costo_completo: p.costo_completo || 0, costo_mp: p.costo_materia_prima || 0,
    });
  }
  function cambiarDescuento(key: string, d: string) {
    const it = items.find((i) => i.key === key);
    if (!it) return;
    setItem(key, { descuento: d, precio_promo: it.precio_lista ? String(Math.round(it.precio_lista * (1 - num(d) / 100))) : it.precio_promo });
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
      ? { ...i, descuento: d, precio_promo: String(Math.round(i.precio_lista * (1 - num(d) / 100))) }
      : i));
  }

  // ---- Cálculos ----
  const plazo = plazoSel === 'Otro' ? plazoOtro : plazoSel;
  const pct30 = cf30;
  const pctFin = pct30 * periodos(plazo); // % del precio

  const filas = items.map((i) => {
    const cant = num(i.cantidad);
    const promoU = num(i.precio_promo);
    return { ...i, cant, promoU, listaTotal: i.precio_lista * cant, promoTotal: promoU * cant, cc: i.costo_completo * cant, cm: i.costo_mp * cant };
  });
  const totalLista = filas.reduce((a, f) => a + f.listaTotal, 0);
  const totalCostoC = filas.reduce((a, f) => a + f.cc, 0);
  const totalCostoM = filas.reduce((a, f) => a + f.cm, 0);
  const sumaPromoItems = filas.reduce((a, f) => a + f.promoTotal, 0);
  const totalPromo = tipo === 'combo_cerrado' ? num(precioCombo) : sumaPromoItems;
  const descTotal = totalLista > 0 && totalPromo > 0 ? (1 - totalPromo / totalLista) * 100 : 0;
  const costoFinPesos = (totalPromo * pctFin) / 100;

  function rentDe(costo: number) {
    const bruta = totalPromo > 0 ? ((totalPromo - costo) / totalPromo) * 100 : 0;
    return { bruta, real: bruta - pctFin, gananciaReal: totalPromo - costo - costoFinPesos };
  }
  const bloques: Array<{ titulo: string; costo: number }> =
    base === 'completo' ? [{ titulo: 'sobre costo completo', costo: totalCostoC }]
    : base === 'mp' ? [{ titulo: 'sobre materia prima', costo: totalCostoM }]
    : [{ titulo: 'sobre costo completo', costo: totalCostoC }, { titulo: 'sobre materia prima', costo: totalCostoM }];

  async function guardar() {
    if (!nombre.trim()) { alert('Poné un nombre a la promo.'); return; }
    const validos = items.filter((i) => (i.producto_id || (i.extra && i.nombre.trim())) && num(i.cantidad) > 0);
    if (!validos.length) { alert('Agregá al menos un ítem.'); return; }
    setGuardando(true);
    const cab = {
      nombre: nombre.trim(), tipo, precio_combo: tipo === 'combo_cerrado' ? num(precioCombo) : null,
      plazo: plazo || 'Contado', observacion: observacion.trim(), costo_fin_30: pct30,
    };
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
  const etiqueta: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', marginBottom: 2 };

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Promos</h1>
          <p className="troya-subtitulo">Armá combos con precio de lista, descuento, plazo y rentabilidad real.</p>
        </div>
        {editar && !editando && <button className="troya-btn" onClick={nueva}>+ Nueva promo</button>}
      </div>

      {/* Parámetro general */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 14px', fontSize: 14 }}>
        <span style={{ color: 'var(--muted)' }}>Costo financiero cada 30 días:</span>
        {editandoCf ? (
          <>
            <input className="troya-input" style={{ width: 90 }} inputMode="decimal" value={cf30Txt} onChange={(e) => setCf30Txt(e.target.value)} placeholder="Ej: 3" />
            <span>%</span>
            <button className="troya-btn" onClick={guardarCf}>Guardar</button>
            <button className="troya-btn-secundario" onClick={() => setEditandoCf(false)}>Cancelar</button>
          </>
        ) : (
          <>
            <b>{cf30.toLocaleString('es-AR')}%</b>
            {editar && <button className="troya-btn-secundario" onClick={() => { setCf30Txt(String(cf30)); setEditandoCf(true); }}>Cambiar</button>}
          </>
        )}
      </div>

      {error && <div className="troya-vacio" style={{ color: 'var(--red)' }}>{error}</div>}

      {editando && (
        <div style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <TituloSeccion n="1" t="Datos de la promo" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 22 }}>
            <label>
              <div style={etiqueta}>Nombre de la promo</div>
              <input className="troya-input" style={{ width: '100%' }} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Combo asador" />
            </label>
            <label>
              <div style={etiqueta}>Cómo se cobra</div>
              <select className="troya-input" style={{ width: '100%' }} value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                <option value="por_unidad">Descuento por ítem</option>
                <option value="combo_cerrado">Precio único del combo</option>
              </select>
            </label>
            {tipo === 'combo_cerrado' ? (
              <label>
                <div style={etiqueta}>Precio del combo</div>
                <InputPesos value={precioCombo} onChange={setPrecioCombo} />
              </label>
            ) : (
              <label>
                <div style={etiqueta}>Descuento a todos (%)</div>
                <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={descGlobal} onChange={(e) => aplicarDescGlobal(e.target.value)} placeholder="Ej: 15" />
              </label>
            )}
            <label>
              <div style={etiqueta}>Plazo de pago</div>
              <select className="troya-input" style={{ width: '100%' }} value={plazoSel} onChange={(e) => setPlazoSel(e.target.value)}>
                {PLAZOS.map((p) => <option key={p} value={p}>{p === 'Contado' ? 'Contado' : p + ' días'}</option>)}
                <option value="Otro">Otro…</option>
              </select>
            </label>
            {plazoSel === 'Otro' && (
              <label>
                <div style={etiqueta}>Plazo (ej: 30/45/60)</div>
                <input className="troya-input" style={{ width: '100%' }} value={plazoOtro} onChange={(e) => setPlazoOtro(e.target.value)} placeholder="30/45/60" />
              </label>
            )}
            <label>
              <div style={etiqueta}>Rentabilidad calculada</div>
              <select className="troya-input" style={{ width: '100%' }} value={base} onChange={(e) => setBase(e.target.value as Base)}>
                <option value="completo">Sobre costo completo</option>
                <option value="mp">Sobre materia prima</option>
                <option value="ambas">Ver ambas</option>
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <div style={etiqueta}>Observación (opcional)</div>
              <input className="troya-input" style={{ width: '100%' }} value={observacion} onChange={(e) => setObservacion(e.target.value)}
                placeholder="Ej: válida hasta fin de mes, entrega en 15 días, solo para Puntos Troya…" />
            </label>
          </div>

          <TituloSeccion n="2" t="Productos de la promo" />
          <div style={{ overflowX: 'auto' }}>
            <table className="troya-matriz-tabla" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--muted)' }}>
                  <th style={celda}>Producto</th>
                  <th style={celda}>Cant.</th>
                  <th style={celda}>Precio lista</th>
                  {tipo === 'por_unidad' && <th style={celda}>Desc. %</th>}
                  {tipo === 'por_unidad' && <th style={celda}>Precio promo</th>}
                  <th style={celda}>{tipo === 'por_unidad' ? 'Subtotal promo' : 'Subtotal lista'}</th>
                  <th style={celda}>{base === 'mp' ? 'Costo MP' : base === 'ambas' ? 'Costo (comp. / MP)' : 'Costo completo'}</th>
                  <th style={celda}></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.key} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...celda, minWidth: 220 }}>
                      {f.extra ? (
                        <>
                          <input className="troya-input" style={{ width: '100%' }} placeholder="Ej: Regalo – tabla de madera"
                            value={f.nombre} onChange={(e) => setItem(f.key, { nombre: e.target.value })} />
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Fuera del catálogo (regalo u otro)</div>
                        </>
                      ) : (
                        <select className="troya-input" style={{ width: '100%' }} value={f.producto_id || ''} onChange={(e) => elegirProducto(f.key, e.target.value)}>
                          <option value="">Elegir producto…</option>
                          {Object.entries(porCategoria).map(([cat, ps]) => (
                            <optgroup key={cat} label={cat}>
                              {ps.map((p) => <option key={p.id} value={p.id}>{p.codigo ? p.codigo + ' · ' : ''}{p.nombre}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ ...celda, width: 70 }}>
                      <input className="troya-input" style={{ width: '100%' }} inputMode="numeric" value={f.cantidad} onChange={(e) => setItem(f.key, { cantidad: e.target.value })} />
                    </td>
                    <td style={{ ...celda, minWidth: 110 }}>
                      {f.extra
                        ? <InputPesos value={f.precio_lista ? String(f.precio_lista) : ''} onChange={(v) => setItem(f.key, { precio_lista: num(v) })} />
                        : f.producto_id ? pesos(f.precio_lista) : '—'}
                    </td>
                    {tipo === 'por_unidad' && (
                      <td style={{ ...celda, width: 90 }}>
                        <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={f.descuento}
                          disabled={!f.precio_lista} onChange={(e) => cambiarDescuento(f.key, e.target.value)} />
                      </td>
                    )}
                    {tipo === 'por_unidad' && (
                      <td style={{ ...celda, width: 150 }}>
                        <InputPesos value={f.precio_promo} onChange={(v) => cambiarPrecio(f.key, v)} placeholder={f.extra ? '0 = regalo' : '0'} />
                      </td>
                    )}
                    <td style={{ ...celda, whiteSpace: 'nowrap' }}>
                      {tipo === 'por_unidad'
                        ? (f.promoTotal === 0 && (f.producto_id || f.nombre) ? <b style={{ color: 'var(--orange)' }}>Regalo</b> : pesos(f.promoTotal))
                        : pesos(f.listaTotal)}
                    </td>
                    <td style={{ ...celda, whiteSpace: 'nowrap', color: 'var(--muted)', minWidth: 120 }}>
                      {f.extra ? (
                        <InputPesos value={(f.costo_completo ? String(f.costo_completo) : '')}
                          onChange={(v) => setItem(f.key, { costo_completo: num(v), costo_mp: num(v) })} placeholder="Costo c/u" />
                      ) : base === 'mp' ? pesos(f.cm)
                        : base === 'ambas' ? `${pesos(f.cc)} / ${pesos(f.cm)}` : pesos(f.cc)}
                    </td>
                    <td style={celda}>
                      <button className="troya-btn-secundario" title="Quitar" onClick={() => setItems((p) => p.filter((i) => i.key !== f.key))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 24px' }}>
            <button className="troya-btn-secundario" onClick={() => setItems((p) => [...p, itemVacio(false)])}>+ Agregar producto</button>
            <button className="troya-btn-secundario" onClick={() => setItems((p) => [...p, itemVacio(true)])}>+ Agregar regalo / ítem fuera del catálogo</button>
          </div>


          <TituloSeccion n="3" t="Resultado" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 14, alignItems: 'stretch' }}>
            <Tarjeta titulo="Precio">
              <Fila t="Total a precio de lista" v={pesos(totalLista)} />
              <Fila t="Descuento total" v={`${descTotal.toFixed(1)}%`} />
              <Fila t="Precio total de la promo" v={pesos(totalPromo)} destacado />
            </Tarjeta>
            <Tarjeta titulo="Costos">
              {(base === 'completo' || base === 'ambas') && <Fila t="Costo completo" v={pesos(totalCostoC)} />}
              {(base === 'mp' || base === 'ambas') && <Fila t="Costo materia prima" v={pesos(totalCostoM)} />}
              <Fila t={`Costo financiero (${plazo || 'Contado'}${pctFin ? ' · ' + pctFin.toFixed(1) + '%' : ''})`} v={pesos(costoFinPesos)} />
            </Tarjeta>
            {bloques.map((b) => {
              const r = rentDe(b.costo);
              return (
                <Tarjeta key={b.titulo} titulo={`Rentabilidad ${b.titulo}`}>
                  <Fila t="Rentabilidad bruta" v={`${r.bruta.toFixed(1)}%`} />
                  <Fila t="Menos costo financiero" v={`− ${pctFin.toFixed(1)} pts`} />
                  <Fila t="Rentabilidad real" v={`${r.real.toFixed(1)}%`} destacado color={colorRent(r.real)} />
                  <Fila t="Ganancia real" v={pesos(r.gananciaReal)} />
                </Tarjeta>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
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
            const costoC = p.items.reduce((a, i) => a + i.costo_completo * i.cantidad, 0);
            const costoM = p.items.reduce((a, i) => a + i.costo_mp * i.cantidad, 0);
            const lista = p.items.reduce((a, i) => a + i.precio_lista * i.cantidad, 0);
            const total = p.tipo === 'combo_cerrado' ? (p.precio_combo || 0) : p.items.reduce((a, i) => a + i.precio_promo * i.cantidad, 0);
            const pf = p.costo_fin_30 * periodos(p.plazo);
            const realC = total > 0 ? ((total - costoC) / total) * 100 - pf : 0;
            const realM = total > 0 ? ((total - costoM) / total) * 100 - pf : 0;
            return (
              <div key={p.id} style={{ display: 'block', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16, opacity: p.activa ? 1 : 0.55 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{p.nombre}</b>
                    {!p.activa && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>(desactivada)</span>}
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                      {p.items.map((i) => `${i.cantidad}× ${i.nombre}${i.precio_promo === 0 ? ' (regalo)' : ''}`).join(' · ')}
                    </div>
                    {p.observacion && <div style={{ fontSize: 13, marginTop: 4 }}>📝 {p.observacion}</div>}
                  </div>
                  {editar && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <button className="troya-btn-secundario" onClick={() => editarPromo(p)}>Editar</button>
                      <button className="troya-btn-secundario" onClick={() => alternar(p)}>{p.activa ? 'Desactivar' : 'Activar'}</button>
                      <button className="troya-btn-secundario" onClick={() => eliminar(p)}>Eliminar</button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10, fontSize: 14 }}>
                  <span>Lista: <b>{pesos(lista)}</b></span>
                  <span>Precio promo: <b>{pesos(total)}</b></span>
                  <span>Plazo: <b>{p.plazo === 'Contado' ? 'Contado' : p.plazo + ' días'}</b></span>
                  <span>Rent. real s/ costo completo: <b style={{ color: colorRent(realC) }}>{realC.toFixed(1)}%</b></span>
                  <span>s/ MP: <b style={{ color: colorRent(realM) }}>{realM.toFixed(1)}%</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--tint-orange)', borderRadius: 10, padding: '12px 16px', display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 6 }}>{titulo}</div>
      {children}
    </div>
  );
}

function Fila({ t, v, destacado, color }: { t: string; v: string; destacado?: boolean; color?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
      padding: destacado ? '6px 0 2px' : '3px 0',
      borderTop: destacado ? '1px solid var(--line)' : undefined, marginTop: destacado ? 4 : 0,
    }}>
      <span style={{ fontSize: destacado ? 14 : 13, fontWeight: destacado ? 700 : 400 }}>{t}</span>
      <span style={{ fontSize: destacado ? 20 : 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: color || 'var(--ink)', whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  );
}

function TituloSeccion({ n, t }: { n: string; t: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
      <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 999, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{n}</span>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{t}</b>
    </div>
  );
}
