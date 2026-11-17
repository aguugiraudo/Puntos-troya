'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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

type Config = {
  factor: string; // multiplicador sobre el precio de lista del sistema
  descuento: string; // % de descuento objetivo sobre el precio web
  paso: string; // redondeo: 0 = sin redondeo, 1000, 5000, 10000
  modo: 'cercano' | 'abajo' | 'arriba';
  comision: string; // % comisión de la tienda (aplica a todos los medios)
};

type Medio = { key: string; nombre: string; costo: string; activo: boolean };

type Base = 'completo' | 'mp';

const CONFIG_INICIAL: Config = { factor: '1.6', descuento: '20', paso: '1000', modo: 'cercano', comision: '0' };

const pesos = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR');
const num = (s: string | number | null | undefined) => {
  const v = parseFloat(String(s ?? '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
};
let contador = 0;
const nuevaKey = () => `m${Date.now()}_${contador++}`;

// Redondeo "atractivo": al múltiplo del paso y menos $1 (ej: 1.000.000 -> 999.999)
function redondear(x: number, paso: number, modo: 'cercano' | 'abajo' | 'arriba') {
  if (!x || x <= 0) return 0;
  if (!paso) return Math.round(x);
  // se redondea el valor "x + 1" para que 999.999 cuente como 1.000.000
  const y = x + 1;
  const m = modo === 'abajo' ? Math.floor(y / paso) : modo === 'arriba' ? Math.ceil(y / paso) : Math.round(y / paso);
  return Math.max(m * paso - 1, paso - 1);
}

function colorRent(r: number) {
  if (r >= 30) return '#2e7d32';
  if (r >= 15) return '#b8860b';
  return '#DA231F';
}

function InputPesos({ value, onChange, onBlur, placeholder }: {
  value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string;
}) {
  const d = (value || '').replace(/\D/g, '');
  const texto = d ? '$ ' + Number(d).toLocaleString('es-AR') : '';
  return (
    <input
      className="troya-input"
      style={{ width: '100%', minWidth: 120 }}
      inputMode="numeric"
      placeholder={placeholder || '$ 0'}
      value={texto}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export default function EcommercePage() {
  const { puedeVer, puedeEditar } = useAuth();
  const editar = puedeEditar('costos_precios');

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cfg, setCfg] = useState<Config>(CONFIG_INICIAL);
  const [medios, setMedios] = useState<Medio[]>([]);
  const [manuales, setManuales] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [verConfig, setVerConfig] = useState(false);
  const [guardandoCfg, setGuardandoCfg] = useState(false);
  const [base, setBase] = useState<Base>('completo');
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    const [p, c, m, pr] = await Promise.all([
      supabase.from('productos')
        .select('id, nombre, codigo, categoria, costo_completo, costo_materia_prima, precio_lista')
        .order('categoria').order('nombre'),
      supabase.from('ecommerce_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('ecommerce_medios').select('*').order('orden'),
      supabase.from('ecommerce_precios').select('*'),
    ]);
    if (p.error) setError(p.error.message);
    if (c.error || m.error || pr.error) {
      setError('No se pudo leer las tablas de e-commerce. ¿Corriste el SQL? ' + (c.error?.message || m.error?.message || pr.error?.message));
    }
    setProductos((p.data as Producto[]) || []);
    if (c.data) {
      const x: any = c.data;
      setCfg({
        factor: String(x.factor ?? '1.6'), descuento: String(x.descuento_pct ?? '20'),
        paso: String(x.redondeo_paso ?? '1000'), modo: x.redondeo_modo || 'cercano',
        comision: String(x.comision_tienda_pct ?? '0'),
      });
    }
    setMedios(((m.data as any[]) || []).map((x) => ({ key: nuevaKey(), nombre: x.nombre, costo: String(x.costo_pct ?? '0'), activo: !!x.activo })));
    const map: Record<string, string> = {};
    ((pr.data as any[]) || []).forEach((x) => { if (x.precio_manual) map[x.producto_id] = String(Math.round(Number(x.precio_manual))); });
    setManuales(map);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  // ---------- Configuración ----------
  async function guardarConfig() {
    setGuardandoCfg(true);
    const { error: e1 } = await supabase.from('ecommerce_config').upsert({
      id: 1, factor: num(cfg.factor), descuento_pct: num(cfg.descuento), redondeo_paso: num(cfg.paso),
      redondeo_modo: cfg.modo, comision_tienda_pct: num(cfg.comision),
    });
    if (e1) { alert(e1.message); setGuardandoCfg(false); return; }
    await supabase.from('ecommerce_medios').delete().neq('nombre', '___');
    const filas = medios.filter((m) => m.nombre.trim()).map((m, i) => ({ nombre: m.nombre.trim(), costo_pct: num(m.costo), activo: m.activo, orden: i }));
    if (filas.length) {
      const { error: e2 } = await supabase.from('ecommerce_medios').insert(filas);
      if (e2) alert(e2.message);
    }
    setGuardandoCfg(false);
    setVerConfig(false);
    cargar();
  }

  // ---------- Precios manuales ----------
  async function guardarManual(id: string) {
    const v = num(manuales[id]);
    if (!editar) return;
    if (v > 0) {
      const { error: e } = await supabase.from('ecommerce_precios').upsert({ producto_id: id, precio_manual: v, updated_at: new Date().toISOString() });
      if (e) alert(e.message);
    } else {
      await supabase.from('ecommerce_precios').delete().eq('producto_id', id);
    }
  }
  async function fijarTodosRedondeados() {
    if (!confirm('Esto guarda como precio final el precio redondeado de TODOS los productos (pisa los manuales). ¿Continuar?')) return;
    const filas = calculados.filter((r) => r.objetivo > 0).map((r) => ({ producto_id: r.p.id, precio_manual: r.objetivo, updated_at: new Date().toISOString() }));
    const { error: e } = await supabase.from('ecommerce_precios').upsert(filas);
    if (e) { alert(e.message); return; }
    cargar();
  }
  async function borrarManuales() {
    if (!confirm('¿Borrar todos los precios manuales? Los productos vuelven al precio redondeado automático.')) return;
    await supabase.from('ecommerce_precios').delete().neq('producto_id', '00000000-0000-0000-0000-000000000000');
    cargar();
  }

  // ---------- Cálculos ----------
  const factor = num(cfg.factor);
  const desc = num(cfg.descuento);
  const paso = num(cfg.paso);
  const comision = num(cfg.comision);
  const activos = medios.filter((m) => m.activo && m.nombre.trim());

  const categorias = useMemo(() => Array.from(new Set(productos.map((p) => p.categoria || 'Sin categoría'))), [productos]);

  const calculados = useMemo(() => {
    return productos.map((p) => {
      const lista = p.precio_lista || 0;
      const costo = (base === 'mp' ? p.costo_materia_prima : p.costo_completo) || 0;
      const web = lista * factor;
      const conDesc = web * (1 - desc / 100);
      const objetivo = redondear(conDesc, paso, cfg.modo);
      const manual = num(manuales[p.id]);
      const usado = manual > 0 ? manual : objetivo;
      const descReal = web > 0 && usado > 0 ? (1 - usado / web) * 100 : 0;
      const porMedio = activos.map((m) => {
        const costoVenta = comision + num(m.costo); // % sobre el precio cobrado
        const neto = usado * (1 - costoVenta / 100);
        const rent = usado > 0 && costo > 0 ? ((neto - costo) / usado) * 100 : null;
        return { neto, rent, ganancia: neto - costo };
      });
      return { p, lista, costo, web, conDesc, objetivo, manual, usado, descReal, porMedio };
    });
  }, [productos, base, factor, desc, paso, cfg.modo, comision, manuales, medios]); // eslint-disable-line

  const visibles = calculados.filter((r) => {
    const t = buscar.trim().toLowerCase();
    if (categoria && (r.p.categoria || 'Sin categoría') !== categoria) return false;
    if (t && !(`${r.p.nombre} ${r.p.codigo || ''}`.toLowerCase().includes(t))) return false;
    return true;
  });

  const promedios = activos.map((_, idx) => {
    const v = calculados.map((r) => r.porMedio[idx]?.rent).filter((x): x is number => x !== null && x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });

  function exportarExcel() {
    const filas = visibles.map((r) => {
      const o: Record<string, any> = {
        'Código': r.p.codigo || '', 'Producto': r.p.nombre, 'Categoría': r.p.categoria || '',
        [base === 'mp' ? 'Costo MP' : 'Costo completo']: Math.round(r.costo),
        'Precio lista sistema': Math.round(r.lista),
        [`Precio web (x${cfg.factor})`]: Math.round(r.web),
        [`Con ${cfg.descuento}% desc.`]: Math.round(r.conDesc),
        'Precio redondeado': r.objetivo, 'Precio manual': r.manual || '', 'Precio final': r.usado,
        'Desc. real vs web %': Math.round(r.descReal * 10) / 10,
      };
      activos.forEach((m, i) => {
        o[`Neto ${m.nombre}`] = Math.round(r.porMedio[i].neto);
        o[`Rent. ${m.nombre} %`] = r.porMedio[i].rent === null ? '' : Math.round((r.porMedio[i].rent as number) * 10) / 10;
      });
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'E-commerce');
    XLSX.writeFile(wb, 'Ecommerce-Troya.xlsx');
  }

  if (!puedeVer('costos_precios')) return <div className="troya-vacio">No tenés acceso a este módulo.</div>;

  const etiqueta: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', marginBottom: 2 };
  const th: React.CSSProperties = { padding: '8px 8px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--muted)', whiteSpace: 'nowrap', verticalAlign: 'bottom' };
  const td: React.CSSProperties = { padding: '6px 8px', whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 14 };

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Venta e-commerce</h1>
          <p className="troya-subtitulo">Precio web, descuento, precio final redondeado y rentabilidad por medio de pago.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="troya-btn-secundario" onClick={exportarExcel}>Exportar Excel</button>
          <button className="troya-btn" onClick={() => setVerConfig((v) => !v)}>{verConfig ? 'Cerrar configuración' : 'Configuración'}</button>
        </div>
      </div>

      {error && <div className="troya-vacio" style={{ color: 'var(--red)' }}>{error}</div>}

      {/* Configuración */}
      {verConfig && (
        <div style={{ display: 'block', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20, marginBottom: 18 }}>
          <Titulo n="1" t="Reglas de precio" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 22 }}>
            <label>
              <div style={etiqueta}>Factor sobre precio de lista (ej: 1.6)</div>
              <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={cfg.factor} onChange={(e) => setCfg({ ...cfg, factor: e.target.value })} />
            </label>
            <label>
              <div style={etiqueta}>Descuento objetivo sobre precio web (%)</div>
              <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={cfg.descuento} onChange={(e) => setCfg({ ...cfg, descuento: e.target.value })} />
            </label>
            <label>
              <div style={etiqueta}>Redondeo del precio final</div>
              <select className="troya-input" style={{ width: '100%' }} value={cfg.paso} onChange={(e) => setCfg({ ...cfg, paso: e.target.value })}>
                <option value="0">Sin redondeo</option>
                <option value="1000">A miles (terminar en 999)</option>
                <option value="5000">A cinco mil (terminar en 4.999 / 9.999)</option>
                <option value="10000">A diez mil (terminar en 9.999)</option>
              </select>
            </label>
            <label>
              <div style={etiqueta}>Redondear hacia</div>
              <select className="troya-input" style={{ width: '100%' }} value={cfg.modo} onChange={(e) => setCfg({ ...cfg, modo: e.target.value as any })}>
                <option value="cercano">El más cercano</option>
                <option value="abajo">Abajo (más barato)</option>
                <option value="arriba">Arriba (más caro)</option>
              </select>
            </label>
            <label>
              <div style={etiqueta}>Comisión de la tienda (% sobre cada venta)</div>
              <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={cfg.comision} onChange={(e) => setCfg({ ...cfg, comision: e.target.value })} />
            </label>
          </div>

          <Titulo n="2" t="Medios de pago y su costo" />
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
            Cargá el costo de cada medio como % del precio que paga el cliente (comisión de cobro + costo de financiar las cuotas). Se suma a la comisión de la tienda.
          </p>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {medios.map((m) => (
              <div key={m.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) minmax(110px,1fr) auto auto', gap: 10, alignItems: 'center' }}>
                <input className="troya-input" value={m.nombre} placeholder="Ej: 6 cuotas sin interés"
                  onChange={(e) => setMedios((p) => p.map((x) => x.key === m.key ? { ...x, nombre: e.target.value } : x))} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={m.costo}
                    onChange={(e) => setMedios((p) => p.map((x) => x.key === m.key ? { ...x, costo: e.target.value } : x))} />
                  <span>%</span>
                </div>
                <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={m.activo} onChange={(e) => setMedios((p) => p.map((x) => x.key === m.key ? { ...x, activo: e.target.checked } : x))} />
                  Mostrar
                </label>
                <button className="troya-btn-secundario" title="Quitar" onClick={() => setMedios((p) => p.filter((x) => x.key !== m.key))}>✕</button>
              </div>
            ))}
          </div>
          <button className="troya-btn-secundario" onClick={() => setMedios((p) => [...p, { key: nuevaKey(), nombre: '', costo: '0', activo: true }])}>+ Agregar medio de pago</button>

          <div style={{ display: 'flex', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <button className="troya-btn" disabled={guardandoCfg || !editar} onClick={guardarConfig}>{guardandoCfg ? 'Guardando…' : 'Guardar configuración'}</button>
            <button className="troya-btn-secundario" onClick={() => { setVerConfig(false); cargar(); }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Resumen de la regla vigente */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 14, margin: '0 0 12px' }}>
        <Chip t={`Factor ×${cfg.factor}`} />
        <Chip t={`Descuento ${cfg.descuento}%`} />
        <Chip t={paso ? `Redondeo a $${paso.toLocaleString('es-AR')} − $1` : 'Sin redondeo'} />
        <Chip t={`Comisión tienda ${cfg.comision}%`} />
      </div>

      {/* Barra de herramientas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
        <label>
          <div style={etiqueta}>Buscar</div>
          <input className="troya-input" style={{ width: '100%' }} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre o código" />
        </label>
        <label>
          <div style={etiqueta}>Categoría</div>
          <select className="troya-input" style={{ width: '100%' }} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <div style={etiqueta}>Rentabilidad calculada</div>
          <select className="troya-input" style={{ width: '100%' }} value={base} onChange={(e) => setBase(e.target.value as Base)}>
            <option value="completo">Sobre costo completo</option>
            <option value="mp">Sobre materia prima</option>
          </select>
        </label>
        {editar && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <button className="troya-btn-secundario" onClick={fijarTodosRedondeados}>Fijar todos al redondeado</button>
            <button className="troya-btn-secundario" onClick={borrarManuales}>Borrar manuales</button>
          </div>
        )}
      </div>

      {cargando ? <div className="troya-vacio">Cargando…</div> : (
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid var(--line)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={th}>Código</th>
                <th style={th}>Producto</th>
                <th style={th}>{base === 'mp' ? 'Costo MP' : 'Costo completo'}</th>
                <th style={th}>Lista sistema</th>
                <th style={th}>Precio web ×{cfg.factor}</th>
                <th style={th}>Con {cfg.descuento}% desc.</th>
                <th style={th}>Redondeado</th>
                <th style={{ ...th, color: 'var(--red)' }}>Precio final<div style={{ textTransform: 'none', fontWeight: 400 }}>(manual o redondeado)</div></th>
                <th style={th}>Desc. real</th>
                {activos.map((m) => (
                  <th key={m.key} style={th}>
                    Rent. {m.nombre}
                    <div style={{ textTransform: 'none', fontWeight: 400 }}>costo {(comision + num(m.costo)).toLocaleString('es-AR')}%</div>
                  </th>
                ))}
              </tr>
              {/* promedios */}
              <tr style={{ background: 'var(--tint-orange)', borderBottom: '1px solid var(--line)' }}>
                <td style={{ ...td, fontWeight: 700 }} colSpan={9}>Rentabilidad promedio de los productos</td>
                {promedios.map((v, i) => (
                  <td key={i} style={{ ...td, fontWeight: 700, color: v === null ? 'var(--muted)' : colorRent(v) }}>{v === null ? '—' : v.toFixed(1) + '%'}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr><td colSpan={9 + activos.length} className="troya-vacio">No hay productos para mostrar.</td></tr>
              )}
              {visibles.map((r) => {
                const esManual = r.manual > 0;
                return (
                  <tr key={r.p.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...td, color: 'var(--muted)' }}>{r.p.codigo || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 220 }}>{r.p.nombre}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{r.costo ? pesos(r.costo) : '—'}</td>
                    <td style={td}>{r.lista ? pesos(r.lista) : '—'}</td>
                    <td style={td}>{r.web ? pesos(r.web) : '—'}</td>
                    <td style={td}>{r.conDesc ? pesos(r.conDesc) : '—'}</td>
                    <td style={td}>{r.objetivo ? pesos(r.objetivo) : '—'}</td>
                    <td style={{ ...td, minWidth: 150 }}>
                      <InputPesos
                        value={manuales[r.p.id] || ''}
                        placeholder={r.objetivo ? pesos(r.objetivo) : '$ 0'}
                        onChange={(v) => setManuales((prev) => ({ ...prev, [r.p.id]: v }))}
                        onBlur={() => guardarManual(r.p.id)}
                      />
                      <div style={{ fontSize: 11, color: esManual ? 'var(--orange)' : 'var(--muted)' }}>{esManual ? 'Precio manual' : 'Automático'}</div>
                    </td>
                    <td style={td}>{r.usado ? r.descReal.toFixed(1) + '%' : '—'}</td>
                    {r.porMedio.map((x, i) => (
                      <td key={i} style={td}>
                        {x.rent === null ? '—' : (
                          <>
                            <b style={{ color: colorRent(x.rent) }}>{x.rent.toFixed(1)}%</b>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Neto {pesos(x.neto)}</div>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Titulo({ n, t }: { n: string; t: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
      <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 999, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{n}</span>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{t}</b>
    </div>
  );
}

function Chip({ t }: { t: string }) {
  return <span style={{ background: 'var(--tint-orange)', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>{t}</span>;
}
