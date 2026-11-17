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
  iva: string; // % de IVA
  webConIva: boolean; // true = lista × factor ya incluye IVA
  cuotasDist: string; // cuotas que el precio del distribuidor ya incluye
  ivaCostos: boolean; // true = a los costos de cobro se les suma IVA (no recuperable)
  comTransf: string; // % comisión de cobro por transferencia
  comTarjeta: string; // % comisión de cobro con tarjeta (según plazo de retiro elegido)
};

type Medio = { key: string; nombre: string; tipo: 'tarjeta' | 'transferencia'; cuotas: string; costo: string; activo: boolean };

type Base = 'completo' | 'mp';
type Vista = 'rent' | 'neto' | 'ganancia';

const CONFIG_INICIAL: Config = { factor: '1.5703', descuento: '20', paso: '1000', modo: 'cercano', comision: '0', iva: '21', webConIva: true, cuotasDist: '3', ivaCostos: false, comTransf: '0.99', comTarjeta: '4.19' };

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

function InputPesos({ value, onChange, onBlur, placeholder, resaltado }: {
  value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; resaltado?: boolean;
}) {
  const d = (value || '').replace(/\D/g, '');
  const texto = d ? '$ ' + Number(d).toLocaleString('es-AR') : '';
  return (
    <input
      className="troya-input"
      style={{ width: '100%', minWidth: 130, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', background: '#fff', border: resaltado ? '2px solid #F08723' : '1px solid #FABF1F' }}
      inputMode="numeric"
      placeholder={placeholder || '$ 0'}
      value={texto}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

const COLUMNAS: Array<{ k: string; label: string; grupo: string }> = [
  { k: 'costo', label: 'Costo', grupo: 'Datos del sistema' },
  { k: 'lista', label: 'Lista sin IVA', grupo: 'Datos del sistema' },
  { k: 'listaIva', label: 'Lista con IVA', grupo: 'Datos del sistema' },
  { k: 'web', label: 'Precio web', grupo: 'Precio web' },
  { k: 'conDesc', label: 'Con descuento', grupo: 'Precio web' },
  { k: 'redondeado', label: 'Redondeado', grupo: 'Precio web' },
  { k: 'descReal', label: 'Descuento real', grupo: 'Tu precio' },
  { k: 'piso', label: 'Piso web', grupo: 'Control Punto Troya' },
  { k: 'estado', label: 'Tu precio vs. piso', grupo: 'Control Punto Troya' },
];
const COLS_INICIAL: Record<string, boolean> = {
  costo: true, lista: false, listaIva: true, web: true, conDesc: false, redondeado: true, descReal: true, piso: true, estado: true,
};
const PRESETS: Record<string, string[]> = {
  'Todo': COLUMNAS.map((c) => c.k),
  'Precios': ['listaIva', 'web', 'conDesc', 'redondeado', 'descReal'],
  'Rentabilidad': ['costo', 'redondeado'],
  'Control Punto Troya': ['listaIva', 'redondeado', 'piso', 'estado'],
};

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
  const [vista, setVista] = useState<Vista>('rent');
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descPT, setDescPT] = useState(33);
  const [cols, setCols] = useState<Record<string, boolean>>(COLS_INICIAL);
  const [verCols, setVerCols] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    const [p, c, m, pr, ld] = await Promise.all([
      supabase.from('productos')
        .select('id, nombre, codigo, categoria, costo_completo, costo_materia_prima, precio_lista')
        .order('categoria').order('nombre'),
      supabase.from('ecommerce_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('ecommerce_medios').select('*').order('orden'),
      supabase.from('ecommerce_precios').select('*'),
      supabase.from('listas_precio').select('codigo, descuento_porcentaje'),
    ]);
    const filaPT = ((ld.data as any[]) || []).find((x) => x.codigo === 'punto_troya');
    if (filaPT) setDescPT(Number(filaPT.descuento_porcentaje) || 33);
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
        iva: String(x.iva_pct ?? '21'), webConIva: x.web_incluye_iva ?? true,
        cuotasDist: String(x.cuotas_distribuidor ?? '3'), ivaCostos: x.iva_en_costos ?? false,
        comTransf: String(x.comision_transferencia ?? '0.99'), comTarjeta: String(x.comision_tarjeta ?? '4.19'),
      });
    }
    setMedios(((m.data as any[]) || []).map((x) => ({ key: nuevaKey(), nombre: x.nombre, tipo: x.tipo === 'transferencia' ? 'transferencia' : 'tarjeta', cuotas: String(x.cuotas ?? '0'), costo: String(x.costo_pct ?? '0'), activo: !!x.activo })));
    const map: Record<string, string> = {};
    ((pr.data as any[]) || []).forEach((x) => { if (x.precio_manual) map[x.producto_id] = String(Math.round(Number(x.precio_manual))); });
    setManuales(map);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    try {
      const g = localStorage.getItem('ecom_cols');
      if (g) setCols({ ...COLS_INICIAL, ...JSON.parse(g) });
    } catch { /* sin almacenamiento: se usan los valores por defecto */ }
  }, []);
  function cambiarCols(n: Record<string, boolean>) {
    setCols(n);
    try { localStorage.setItem('ecom_cols', JSON.stringify(n)); } catch { /* ignorar */ }
  }
  const ver = (k: string) => cols[k] !== false;
  const verMedio = (nombre: string) => cols['m:' + nombre] !== false;
  function aplicarPreset(nombre: string) {
    const lista = PRESETS[nombre];
    const n: Record<string, boolean> = {};
    COLUMNAS.forEach((c) => { n[c.k] = lista.includes(c.k); });
    activos.forEach((m) => { n['m:' + m.nombre] = true; });
    cambiarCols(n);
  }

  // ---------- Configuración ----------
  async function guardarConfig() {
    setGuardandoCfg(true);
    const { error: e1 } = await supabase.from('ecommerce_config').upsert({
      id: 1, factor: num(cfg.factor), descuento_pct: num(cfg.descuento), redondeo_paso: num(cfg.paso),
      redondeo_modo: cfg.modo, comision_tienda_pct: num(cfg.comision),
      iva_pct: num(cfg.iva), web_incluye_iva: cfg.webConIva, cuotas_distribuidor: num(cfg.cuotasDist), iva_en_costos: cfg.ivaCostos,
      comision_transferencia: num(cfg.comTransf), comision_tarjeta: num(cfg.comTarjeta),
    });
    if (e1) { alert(e1.message); setGuardandoCfg(false); return; }
    await supabase.from('ecommerce_medios').delete().neq('nombre', '___');
    const filas = medios.filter((m) => m.nombre.trim()).map((m, i) => ({ nombre: m.nombre.trim(), tipo: m.tipo, cuotas: num(m.cuotas), costo_pct: num(m.costo), activo: m.activo, orden: i }));
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
  const k = 1 + num(cfg.iva) / 100; // 1,21
  const kCostos = cfg.ivaCostos ? k : 1;
  const activos = medios.filter((m) => m.activo && m.nombre.trim());
  const comCobro = (m: Medio) => (m.tipo === 'transferencia' ? num(cfg.comTransf) : num(cfg.comTarjeta));
  const costoVentaPct = (m: Medio) => (comision + comCobro(m) + num(m.costo)) * kCostos;

  // Piso de la web = precio de lista (sugerido al público) + IVA + intereses de las cuotas que
  // excedan las que el precio de lista ya incluye (las de Punto Troya y distribuidores).
  const cuotasDist = num(cfg.cuotasDist);
  const medioDist = cuotasDist > 0 ? medios.find((m) => num(m.cuotas) === cuotasDist) : undefined;
  const costoDistPct = medioDist ? num(medioDist.costo) * kCostos : 0;
  const medioMax = [...activos].filter((m) => num(m.cuotas) > 0).sort((x, y) => num(y.cuotas) - num(x.cuotas))[0];
  const deltaPct = medioMax ? Math.max(0, num(medioMax.costo) * kCostos - costoDistPct) : 0;

  const categorias = useMemo(() => Array.from(new Set(productos.map((p) => p.categoria || 'Sin categoría'))), [productos]);

  const calculados = useMemo(() => {
    return productos.map((p) => {
      const lista = p.precio_lista || 0;
      const listaIva = lista * k;
      const costo = (base === 'mp' ? p.costo_materia_prima : p.costo_completo) || 0;
      const web = lista * factor * (cfg.webConIva ? 1 : k); // precio web con IVA
      const conDesc = web * (1 - desc / 100);
      const objetivo = redondear(conDesc, paso, cfg.modo);
      const manual = num(manuales[p.id]);
      const usado = manual > 0 ? manual : objetivo; // con IVA
      const descReal = web > 0 && usado > 0 ? (1 - usado / web) * 100 : 0;
      const ingreso = usado / k; // sin IVA
      const porMedio = activos.map((m) => {
        const neto = ingreso - (usado * costoVentaPct(m)) / 100;
        const rent = ingreso > 0 && costo > 0 ? ((neto - costo) / ingreso) * 100 : null;
        return { neto, rent, ganancia: neto - costo };
      });
      const piso = lista > 0 ? (lista * k) / (1 - deltaPct / 100) : 0;
      const vsPiso = piso > 0 && usado > 0 ? (usado / piso - 1) * 100 : null;
      const compraPT = lista * (1 - descPT / 100); // lo que paga el Punto Troya (sin IVA)
      const margenPT = compraPT > 0 && usado > 0 ? (usado / k / compraPT - 1) * 100 : null; // si tuviera que vender al precio web
      return { p, lista, listaIva, costo, web, conDesc, objetivo, manual, usado, descReal, porMedio, piso, vsPiso, compraPT, margenPT };
    });
  }, [productos, base, factor, desc, paso, cfg.modo, cfg.webConIva, comision, k, kCostos, descPT, deltaPct, manuales, medios, cfg.comTransf, cfg.comTarjeta]); // eslint-disable-line

  // Descuento que habría que hacerle al precio web para volver a la lista con IVA
  const ratioWeb = factor * (cfg.webConIva ? 1 : k) / k;
  const descEquilibrio = ratioWeb > 0 ? (1 - 1 / ratioWeb) * 100 : 0;

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
        'Precio lista sistema (sin IVA)': Math.round(r.lista),
        'Lista con IVA': Math.round(r.listaIva),
        [`Precio web c/IVA (x${cfg.factor})`]: Math.round(r.web),
        [`Con ${cfg.descuento}% desc.`]: Math.round(r.conDesc),
        'Precio redondeado': r.objetivo, 'Precio manual': r.manual || '', 'Precio final': r.usado,
        'Desc. real vs web %': Math.round(r.descReal * 10) / 10,
        'Compra Punto Troya (sin IVA)': Math.round(r.compraPT),
        'Piso web c/IVA (lista + IVA + cuotas)': Math.round(r.piso),
        'Precio final vs piso %': r.vsPiso === null ? '' : Math.round(r.vsPiso * 10) / 10,
      };
      activos.forEach((m, i) => {
        o[`Neto sin IVA ${m.nombre}`] = Math.round(r.porMedio[i].neto);
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
  const NUM: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const thBase: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', whiteSpace: 'nowrap', verticalAlign: 'bottom', background: '#fff' };
  const tdBase: React.CSSProperties = { padding: '7px 12px', whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 14 };
  const sepIzq: React.CSSProperties = { borderLeft: '1px solid var(--line)' };
  const COL_PRODUCTO = 300;
  const nCols = 12 + activos.length;
  const colRent = (x: { rent: number | null; neto: number; ganancia: number }) => {
    if (x.rent === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
    if (vista === 'neto') return <b>{pesos(x.neto)}</b>;
    if (vista === 'ganancia') return <b style={{ color: x.ganancia >= 0 ? 'var(--ink)' : '#DA231F' }}>{pesos(x.ganancia)}</b>;
    return <b style={{ color: colorRent(x.rent) }}>{x.rent.toFixed(1)}%</b>;
  };

  // Ocupa casi todo el ancho de la pantalla, aunque el resto de la app use un contenedor angosto
  const anchoCompleto: React.CSSProperties = {
    width: 'calc(100vw - 48px)', maxWidth: 2200, position: 'relative', left: '50%', transform: 'translateX(-50%)', boxSizing: 'border-box',
  };

  return (
    <div style={anchoCompleto}>
      <div className="troya-header">
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Venta e-commerce</h1>
          <p className="troya-subtitulo">Del precio de lista al precio final de la tienda, y cuánto te queda por medio de pago.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="troya-btn-secundario" onClick={exportarExcel}>Exportar a Excel</button>
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
            <label>
              <div style={etiqueta}>Pago Nube: comisión por transferencia (%)</div>
              <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={cfg.comTransf} onChange={(e) => setCfg({ ...cfg, comTransf: e.target.value })} />
            </label>
            <label>
              <div style={etiqueta}>Pago Nube: comisión con tarjeta (%) — retiro elegido</div>
              <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={cfg.comTarjeta} onChange={(e) => setCfg({ ...cfg, comTarjeta: e.target.value })} />
            </label>
            <label>
              <div style={etiqueta}>IVA (%)</div>
              <input className="troya-input" style={{ width: '100%' }} inputMode="decimal" value={cfg.iva} onChange={(e) => setCfg({ ...cfg, iva: e.target.value })} />
            </label>
            <label>
              <div style={etiqueta}>Lista × factor: ¿ya incluye IVA?</div>
              <select className="troya-input" style={{ width: '100%' }} value={cfg.webConIva ? 'si' : 'no'} onChange={(e) => setCfg({ ...cfg, webConIva: e.target.value === 'si' })}>
                <option value="si">Sí, ya incluye IVA</option>
                <option value="no">No, hay que sumarle el IVA</option>
              </select>
            </label>
            <label>
              <div style={etiqueta}>Cuotas ya incluidas en el precio de lista (Punto Troya y distribuidores)</div>
              <input className="troya-input" style={{ width: '100%' }} inputMode="numeric" value={cfg.cuotasDist} onChange={(e) => setCfg({ ...cfg, cuotasDist: e.target.value })} />
            </label>
            <label>
              <div style={etiqueta}>Costos de cobro: ¿se les suma IVA?</div>
              <select className="troya-input" style={{ width: '100%' }} value={cfg.ivaCostos ? 'si' : 'no'} onChange={(e) => setCfg({ ...cfg, ivaCostos: e.target.value === 'si' })}>
                <option value="no">No (el IVA es crédito fiscal)</option>
                <option value="si">Sí (el IVA es un costo más)</option>
              </select>
            </label>
          </div>

          <Titulo n="2" t="Medios de pago y su costo" />
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
            En “Costo de cuotas” cargá lo que informa Tienda Nube (sin IVA): si dice “10,2% + IVA”, cargá 10,2. Poné 0 para transferencia o pago en 1 cuota. La comisión de Pago Nube se suma sola según el tipo de cobro.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) 150px 80px minmax(110px,1fr) 80px 40px', gap: 10, fontSize: 12, color: 'var(--muted)', margin: '0 0 4px' }}>
            <span>Medio de pago</span><span>Tipo de cobro</span><span>Cuotas</span><span>Costo de cuotas (%)</span><span>Mostrar</span><span />
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {medios.map((m) => (
              <div key={m.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) 150px 80px minmax(110px,1fr) 80px 40px', gap: 10, alignItems: 'center' }}>
                <input className="troya-input" value={m.nombre} placeholder="Ej: 6 cuotas sin interés"
                  onChange={(e) => setMedios((p) => p.map((x) => x.key === m.key ? { ...x, nombre: e.target.value } : x))} />
                <select className="troya-input" value={m.tipo}
                  onChange={(e) => setMedios((p) => p.map((x) => x.key === m.key ? { ...x, tipo: e.target.value as any } : x))}>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </select>
                <input className="troya-input" inputMode="numeric" value={m.cuotas}
                  onChange={(e) => setMedios((p) => p.map((x) => x.key === m.key ? { ...x, cuotas: e.target.value } : x))} />
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
          <button className="troya-btn-secundario" onClick={() => setMedios((p) => [...p, { key: nuevaKey(), nombre: '', tipo: 'tarjeta', cuotas: '0', costo: '0', activo: true }])}>+ Agregar medio de pago</button>

          <div style={{ display: 'flex', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <button className="troya-btn" disabled={guardandoCfg || !editar} onClick={guardarConfig}>{guardandoCfg ? 'Guardando…' : 'Guardar configuración'}</button>
            <button className="troya-btn-secundario" onClick={() => { setVerConfig(false); cargar(); }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Reglas vigentes */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 14px' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>Reglas vigentes:</span>
        <Chip t={`Factor ×${cfg.factor}`} />
        <Chip t={`Descuento ${cfg.descuento}%`} />
        <Chip t={paso ? `Redondeo a $${paso.toLocaleString('es-AR')} − $1` : 'Sin redondeo'} />
        <Chip t={`Comisión de la tienda ${cfg.comision}%`} />
        <Chip t={`IVA ${cfg.iva}%`} />
        <Chip t={`Punto Troya: lista −${descPT}% · ${cuotasDist} cuotas incluidas`} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '-4px 0 14px' }}>
        El precio web {cfg.webConIva ? '(lista × factor, ya con IVA)' : '(lista × factor + IVA)'} queda <b style={{ color: 'var(--ink)' }}>{ratioWeb >= 1 ? descEquilibrio.toFixed(1).replace('.', ',') + '%' : '—'}</b> por encima de la lista con IVA: ese es el descuento que le tendrías que hacer para volver al precio de lista. Piso de la web = lista + IVA + intereses extra: suma {deltaPct.toFixed(1).replace('.', ',')} puntos por las cuotas{medioMax ? ` (hasta ${medioMax.cuotas} cuotas)` : ''}.
      </div>

      {/* Filtros y opciones de vista */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 10 }}>
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
          <div style={etiqueta}>Costo de referencia</div>
          <select className="troya-input" style={{ width: '100%' }} value={base} onChange={(e) => setBase(e.target.value as Base)}>
            <option value="completo">Costo completo</option>
            <option value="mp">Materia prima</option>
          </select>
        </label>
        <label>
          <div style={etiqueta}>Medios de pago: mostrar</div>
          <select className="troya-input" style={{ width: '100%' }} value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
            <option value="rent">Rentabilidad (%)</option>
            <option value="neto">Neto sin IVA ($)</option>
            <option value="ganancia">Ganancia ($)</option>
          </select>
        </label>
      </div>

      {/* Leyenda + acciones masivas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 10px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#EFE8E1', marginRight: 6 }} />Datos del sistema (solo lectura)</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, border: '1px solid var(--ink)', marginRight: 6 }} />Calculado</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#FFF3C4', border: '1px solid #FABF1F', marginRight: 6 }} />Lo cargás vos</span>
        </div>
        {editar && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="troya-btn-secundario" onClick={fijarTodosRedondeados}>Usar el redondeado en todos</button>
            <button className="troya-btn-secundario" onClick={borrarManuales}>Limpiar precios manuales</button>
          </div>
        )}
      </div>

      {/* Selector de columnas */}
      <div style={{ margin: '0 0 10px' }}>
        <button className="troya-btn-secundario" onClick={() => setVerCols((v) => !v)}>{verCols ? 'Cerrar columnas' : 'Elegir columnas'}</button>
        {verCols && (
          <div style={{ marginTop: 8, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Vistas rápidas:</span>
              {Object.keys(PRESETS).map((p) => (
                <button key={p} className="troya-btn-secundario" onClick={() => aplicarPreset(p)}>{p}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
              {Array.from(new Set(COLUMNAS.map((c) => c.grupo))).map((g) => (
                <div key={g}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 6 }}>{g}</div>
                  {COLUMNAS.filter((c) => c.grupo === g).map((c) => (
                    <label key={c.k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '2px 0' }}>
                      <input type="checkbox" checked={ver(c.k)} onChange={(e) => cambiarCols({ ...cols, [c.k]: e.target.checked })} />
                      {c.label}
                    </label>
                  ))}
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 6 }}>Medios de pago</div>
                {activos.map((m) => (
                  <label key={m.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '2px 0' }}>
                    <input type="checkbox" checked={verMedio(m.nombre)} onChange={(e) => cambiarCols({ ...cols, ['m:' + m.nombre]: e.target.checked })} />
                    {m.nombre}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Siempre se muestran el producto y el precio final. Tu elección queda guardada en este navegador.</div>
          </div>
        )}
      </div>

      {cargando ? <div className="troya-vacio">Cargando…</div> : (() => {
        const mediosVis = activos.map((m, i) => ({ m, i })).filter((x) => verMedio(x.m.nombre));
        const nSis = ['costo', 'lista', 'listaIva'].filter(ver).length;
        const nWeb = ['web', 'conDesc', 'redondeado'].filter(ver).length;
        const nTu = 1 + (ver('descReal') ? 1 : 0);
        const nCtl = ['piso', 'estado'].filter(ver).length;
        const total = 1 + nSis + nWeb + nTu + nCtl + mediosVis.length;
        const P: React.CSSProperties = { padding: '7px 8px', fontSize: 13 };
        const TH2: React.CSSProperties = { ...thBase, padding: '6px 8px', fontSize: 10.5, ...NUM, position: 'sticky', top: 30, zIndex: 2, borderBottom: '1px solid var(--line)', whiteSpace: 'normal', lineHeight: 1.2 };
        const TH1: React.CSSProperties = { ...thBase, padding: '6px 8px', fontSize: 10.5, position: 'sticky', top: 0, zIndex: 3, textAlign: 'center', borderBottom: '1px solid var(--line)', color: 'var(--ink)', ...sepIzq };
        const sub = (t: string) => <div style={{ textTransform: 'none', fontWeight: 400 }}>{t}</div>;
        return (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '72vh', background: '#fff', border: '1px solid var(--line)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, padding: '6px 8px', position: 'sticky', top: 0, left: 0, zIndex: 5, borderBottom: '1px solid var(--line)', color: 'var(--ink)', textAlign: 'left' }}>Producto</th>
                  {nSis > 0 && <th colSpan={nSis} style={{ ...TH1, background: '#F5F0EA' }}>Datos del sistema</th>}
                  {nWeb > 0 && <th colSpan={nWeb} style={TH1}>Precio web con IVA</th>}
                  <th colSpan={nTu} style={{ ...TH1, background: '#FFF3C4' }}>Tu precio</th>
                  {nCtl > 0 && <th colSpan={nCtl} style={TH1}>Control vs. Punto Troya</th>}
                  {mediosVis.length > 0 && (
                    <th colSpan={mediosVis.length} style={TH1}>
                      {vista === 'rent' ? 'Rentabilidad por medio de pago' : vista === 'neto' ? 'Neto sin IVA por medio de pago' : 'Ganancia por medio de pago'}
                    </th>
                  )}
                </tr>
                <tr>
                  <th style={{ ...TH2, position: 'sticky', left: 0, zIndex: 5, textAlign: 'left', background: '#fff' }}>Nombre y código</th>
                  {ver('costo') && <th style={{ ...TH2, background: '#F5F0EA', ...sepIzq }}>{base === 'mp' ? 'Materia prima' : 'Costo completo'}</th>}
                  {ver('lista') && <th style={{ ...TH2, background: '#F5F0EA', ...(ver('costo') ? {} : sepIzq) }}>Lista{sub('sin IVA')}</th>}
                  {ver('listaIva') && <th style={{ ...TH2, background: '#F5F0EA', ...(ver('costo') || ver('lista') ? {} : sepIzq) }}>Lista{sub('con IVA')}</th>}
                  {ver('web') && <th style={{ ...TH2, ...sepIzq }}>Precio web{sub(`lista × ${cfg.factor}`)}</th>}
                  {ver('conDesc') && <th style={{ ...TH2, ...(ver('web') ? {} : sepIzq) }}>Con descuento{sub(`−${cfg.descuento}%`)}</th>}
                  {ver('redondeado') && <th style={{ ...TH2, ...(ver('web') || ver('conDesc') ? {} : sepIzq) }}>Redondeado{sub('sugerido')}</th>}
                  <th style={{ ...TH2, background: '#FFF3C4', color: 'var(--ink)', ...sepIzq }}>Precio final{sub('editable')}</th>
                  {ver('descReal') && <th style={{ ...TH2, background: '#FFF3C4', color: 'var(--ink)' }}>Desc. real{sub('vs. web')}</th>}
                  {ver('piso') && <th style={{ ...TH2, ...sepIzq }}>Piso web{sub('lista + IVA + cuotas')}</th>}
                  {ver('estado') && <th style={{ ...TH2, ...(ver('piso') ? {} : sepIzq) }}>Tu precio{sub('vs. piso')}</th>}
                  {mediosVis.map(({ m }, j) => (
                    <th key={m.key} style={{ ...TH2, ...(j === 0 ? sepIzq : {}) }}>
                      {m.nombre.replace(' sin interés', '')}
                      {sub(`costo ${costoVentaPct(m).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <td style={{ ...P, position: 'sticky', top: 62, left: 0, zIndex: 5, background: 'var(--tint-orange)', fontWeight: 700, fontSize: 12, borderBottom: '1px solid var(--line)' }}>Rentabilidad promedio</td>
                  <td colSpan={total - 1 - mediosVis.length} style={{ ...P, position: 'sticky', top: 62, zIndex: 2, background: 'var(--tint-orange)', borderBottom: '1px solid var(--line)' }} />
                  {mediosVis.map(({ i }, j) => {
                    const v = promedios[i];
                    return (
                      <td key={i} style={{ ...P, ...NUM, position: 'sticky', top: 62, zIndex: 2, background: 'var(--tint-orange)', fontWeight: 700, borderBottom: '1px solid var(--line)', color: v === null ? 'var(--muted)' : colorRent(v), ...(j === 0 ? sepIzq : {}) }}>
                        {v === null ? '—' : v.toFixed(1) + '%'}
                      </td>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr><td colSpan={total} className="troya-vacio">No hay productos para mostrar.</td></tr>
                )}
                {visibles.map((r) => {
                  const esManual = r.manual > 0;
                  const borde = '1px solid #F0EAE3';
                  const c: React.CSSProperties = { ...P, ...NUM, borderBottom: borde };
                  return (
                    <tr key={r.p.id}>
                      <td style={{ ...P, position: 'sticky', left: 0, zIndex: 1, background: '#fff', borderBottom: borde, minWidth: 220, maxWidth: 340 }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.25 }} title={r.p.nombre}>{r.p.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.p.codigo || 'Sin código'}</div>
                      </td>
                      {ver('costo') && <td style={{ ...c, background: '#FAF7F3', color: 'var(--muted)', ...sepIzq }}>{r.costo ? pesos(r.costo) : '—'}</td>}
                      {ver('lista') && <td style={{ ...c, background: '#FAF7F3', color: 'var(--muted)', ...(ver('costo') ? {} : sepIzq) }}>{r.lista ? pesos(r.lista) : '—'}</td>}
                      {ver('listaIva') && <td style={{ ...c, background: '#FAF7F3', color: 'var(--muted)', ...(ver('costo') || ver('lista') ? {} : sepIzq) }}>{r.lista ? pesos(r.listaIva) : '—'}</td>}
                      {ver('web') && <td style={{ ...c, ...sepIzq }}>{r.web ? pesos(r.web) : '—'}</td>}
                      {ver('conDesc') && <td style={{ ...c, ...(ver('web') ? {} : sepIzq) }}>{r.conDesc ? pesos(r.conDesc) : '—'}</td>}
                      {ver('redondeado') && <td style={{ ...c, ...(ver('web') || ver('conDesc') ? {} : sepIzq) }}>{r.objetivo ? pesos(r.objetivo) : '—'}</td>}
                      <td style={{ ...P, borderBottom: borde, background: '#FFFBE6', minWidth: 130, ...sepIzq }}>
                        <InputPesos
                          value={manuales[r.p.id] || ''}
                          placeholder={r.objetivo ? pesos(r.objetivo) : '$ 0'}
                          onChange={(v) => setManuales((prev) => ({ ...prev, [r.p.id]: v }))}
                          onBlur={() => guardarManual(r.p.id)}
                          resaltado={esManual}
                        />
                        <div style={{ fontSize: 10.5, textAlign: 'right', color: esManual ? 'var(--orange)' : 'var(--muted)', marginTop: 2 }}>{esManual ? 'Precio manual' : 'Usa el redondeado'}</div>
                      </td>
                      {ver('descReal') && <td style={{ ...c, background: '#FFFBE6' }}>{r.usado ? r.descReal.toFixed(1) + '%' : '—'}</td>}
                      {ver('piso') && <td style={{ ...c, color: 'var(--muted)', ...sepIzq }} title={`El Punto Troya compra a ${pesos(r.compraPT)} + IVA y vende a la lista (${pesos(r.lista)} + IVA)`}>{r.piso ? pesos(r.piso) : '—'}</td>}
                      {ver('estado') && (
                        <td style={{ ...c, ...(ver('piso') ? {} : sepIzq) }}>
                          {r.vsPiso === null ? <span style={{ color: 'var(--muted)' }}>—</span> : r.vsPiso >= 0
                            ? <b style={{ color: '#2e7d32' }}>✔ +{r.vsPiso.toFixed(1)}%</b>
                            : <b style={{ color: '#DA231F' }}>⚠ {r.vsPiso.toFixed(1)}%</b>}
                          {r.vsPiso !== null && r.vsPiso < 0 && r.margenPT !== null && (
                            <div style={{ fontSize: 10.5, color: '#DA231F' }}>Punto Troya: margen {r.margenPT.toFixed(1)}%</div>
                          )}
                        </td>
                      )}
                      {mediosVis.map(({ i }, j) => (
                        <td key={i} style={{ ...c, ...(j === 0 ? sepIzq : {}) }}>{colRent(r.porMedio[i])}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
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
