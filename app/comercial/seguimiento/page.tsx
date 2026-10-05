'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import InputMoneda from '@/components/InputMoneda';

const MODULO = 'seguimiento_ventas';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

type DiaGuardado = { vendido: number | null; habil: boolean | null };

type FilaDia = {
  fecha: string;
  dia: number;
  semanaDia: number;
  habil: boolean;
  vendido: number | null;
  objetivo: number;
  objetivoAcum: number;
  cerrado: boolean;
  vendidoAcum: number | null;
  pctDia: number | null;
  pctAcum: number | null;
  dif: number | null;
};

const CSS = `
.sv-inp {
  width: 100%;
  padding: 7px 8px;
  border: 1px dashed #D8CCC2;
  border-radius: 8px;
  background: transparent;
  font-family: var(--font-body);
  font-size: 13.5px;
  font-weight: 700;
  text-align: center;
  color: var(--ink);
  transition: border-color 0.15s, background 0.15s;
}
.sv-inp:hover { border-color: var(--orange); }
.sv-inp:focus {
  outline: none;
  border: 1px solid var(--orange);
  background: #FFFBE6;
  box-shadow: 0 0 0 3px rgba(235, 103, 38, 0.13);
}
.sv-inp::placeholder { color: #C9BEB4; font-weight: 400; }
.sv-inp--grande { padding: 9px 6px; font-size: 17px; }
.sv-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--orange);
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  font-family: var(--font-body);
}
.sv-link:hover { text-decoration: underline; }
.sv-seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.sv-seg button {
  padding: 9px 18px;
  font-size: 13.5px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  font-family: var(--font-body);
  background: #fff;
  color: var(--ink);
}
.sv-seg button + button { border-left: 1px solid var(--line); }
.sv-seg button.on { background: var(--red); color: #fff; }
.sv-resumen {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 14px;
}
.sv-celda { background: #fff; padding: 14px 18px; }
@media print {
  body * { visibility: hidden !important; }
  .sv-hoja, .sv-hoja * { visibility: visible !important; }
  .sv-hoja { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
}
@page { size: landscape; margin: 8mm; }
`;

function dosDig(n: number) {
  return String(n).padStart(2, '0');
}

function iso(a: number, m: number, d: number) {
  return `${a}-${dosDig(m + 1)}-${dosDig(d)}`;
}

function fechaCorta(m: number, d: number) {
  return `${dosDig(d)}/${dosDig(m + 1)}`;
}

function money(v: number) {
  return `$${Math.round(v).toLocaleString('es-AR')}`;
}

function moneyDif(v: number) {
  return `${v < 0 ? '-' : '+'}$${Math.abs(Math.round(v)).toLocaleString('es-AR')}`;
}

function cap(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Lunes a viernes es hábil, salvo que se haya cambiado a mano (feriado o sábado trabajado)
function esHabilDia(fecha: string, dias: Record<string, DiaGuardado>) {
  const manual = dias[fecha]?.habil;
  if (manual !== null && manual !== undefined) return manual;
  const d = new Date(fecha + 'T00:00:00').getDay();
  return d >= 1 && d <= 5;
}

// Semanas de lunes a domingo; la primera y la última pueden tener menos días
function infoSemanas(a: number, m: number) {
  const n = new Date(a, m + 1, 0).getDate();
  const wd = ((new Date(a, m, 1).getDay() + 6) % 7) + 1;
  const diasSem1 = 8 - wd;
  const total = n <= diasSem1 ? 1 : 1 + Math.ceil((n - diasSem1) / 7);
  const rango = (k: number) => {
    const ini = k === 1 ? 1 : diasSem1 + 1 + 7 * (k - 2);
    const fin = Math.min(k === 1 ? diasSem1 : ini + 6, n);
    return { ini, fin };
  };
  return { n, diasSem1, total, rango };
}

function semanaDeDia(info: { diasSem1: number }, dia: number) {
  return dia <= info.diasSem1 ? 1 : 2 + Math.floor((dia - info.diasSem1 - 1) / 7);
}

function semaforo(p: number | null) {
  if (p === null) return null;
  if (p >= 1) return { bg: '#E3F3E4', fg: '#2E7D32' };
  if (p >= 0.8) return { bg: '#FFF3CD', fg: '#8A6D00' };
  return { bg: 'var(--tint-red)', fg: 'var(--red)' };
}

function Pct({ p, grande }: { p: number | null; grande?: boolean }) {
  const s = semaforo(p);
  if (!s || p === null) return null;
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        padding: grande ? '4px 12px' : '2px 8px',
        borderRadius: 8,
        fontWeight: 700,
        fontSize: grande ? 22 : 12.5,
        whiteSpace: 'nowrap',
      }}
    >
      {Math.round(p * 100)}%
    </span>
  );
}

function Dif({ v, grande }: { v: number | null; grande?: boolean }) {
  if (v === null) return null;
  return (
    <span style={{ color: v >= 0 ? '#2E7D32' : 'var(--red)', fontWeight: 700, fontSize: grande ? 26 : undefined, whiteSpace: 'nowrap' }}>
      {moneyDif(v)}
    </span>
  );
}

function CeldaMonto({
  valor, editable, estatico, grande, onGuardar,
}: {
  valor: number | null;
  editable: boolean;
  estatico: boolean;
  grande?: boolean;
  onGuardar: (v: number | null) => Promise<boolean>;
}) {
  const base = valor !== null ? String(Math.round(valor)) : '';
  const [texto, setTexto] = useState(base);
  const [enfocado, setEnfocado] = useState(false);

  useEffect(() => {
    if (!enfocado) setTexto(base);
  }, [base, enfocado]);

  if (estatico || !editable) {
    return <span style={{ fontWeight: 700, fontSize: grande ? 17 : undefined }}>{valor !== null ? money(valor) : ''}</span>;
  }

  const formateado = texto === '' ? '' : Number(texto).toLocaleString('es-AR');

  return (
    <input
      className={`sv-inp ${grande ? 'sv-inp--grande' : ''}`}
      type="text"
      inputMode="numeric"
      value={formateado}
      placeholder="—"
      onFocus={(e) => {
        setEnfocado(true);
        e.target.select();
      }}
      onChange={(e) => setTexto(e.target.value.replace(/\D/g, ''))}
      onBlur={async () => {
        const nuevo = texto === '' ? null : Number(texto);
        const actual = valor === null ? null : Math.round(valor);
        if (nuevo !== actual) await onGuardar(nuevo);
        setEnfocado(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export default function SeguimientoVentasPage() {
  const { puedeVer, puedeEditar } = useAuth();
  const puedeVerModulo = puedeVer(MODULO);
  const puedeEditarModulo = puedeEditar(MODULO);

  const hoy = new Date();
  const hoyISO = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const [mesSel, setMesSel] = useState<{ a: number; m: number }>({ a: hoy.getFullYear(), m: hoy.getMonth() });
  const [vista, setVista] = useState<'semana' | 'mes'>('semana');
  const [semana, setSemana] = useState(1);
  const [cargando, setCargando] = useState(true);

  const [objetivo, setObjetivo] = useState(0);
  const [objetivoEdit, setObjetivoEdit] = useState('');
  const [editandoObj, setEditandoObj] = useState(false);
  const [guardandoObj, setGuardandoObj] = useState(false);
  const [dias, setDias] = useState<Record<string, DiaGuardado>>({});

  const [qFecha, setQFecha] = useState('');
  const [qMonto, setQMonto] = useState('');
  const [guardandoQ, setGuardandoQ] = useState(false);

  const [exportando, setExportando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const hojaRef = useRef<HTMLDivElement>(null);

  const esMesActual = mesSel.a === hoy.getFullYear() && mesSel.m === hoy.getMonth();
  const limiteMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const esUltimoMes = mesSel.a === limiteMes.getFullYear() && mesSel.m === limiteMes.getMonth();
  const esFuturo = new Date(mesSel.a, mesSel.m, 1) > new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const diasEnMes = new Date(mesSel.a, mesSel.m + 1, 0).getDate();
  const inicioISO = iso(mesSel.a, mesSel.m, 1);
  const finISO = iso(mesSel.a, mesSel.m, diasEnMes);

  async function cargarMes() {
    setCargando(true);

    const { data: obj } = await supabase.from('seguimiento_ventas_mes').select('objetivo').eq('mes', inicioISO).maybeSingle();
    const o = obj ? Number(obj.objetivo) : 0;
    setObjetivo(o);
    setObjetivoEdit(o > 0 ? String(Math.round(o)) : '');
    setEditandoObj(false);

    const { data: diasData } = await supabase
      .from('seguimiento_ventas_dia')
      .select('fecha, vendido, habil')
      .gte('fecha', inicioISO)
      .lte('fecha', finISO);

    const mapa: Record<string, DiaGuardado> = {};
    (diasData ?? []).forEach((d: any) => {
      mapa[String(d.fecha).slice(0, 10)] = { vendido: d.vendido === null ? null : Number(d.vendido), habil: d.habil };
    });
    setDias(mapa);
    setCargando(false);
  }

  useEffect(() => {
    if (puedeVerModulo) cargarMes();
  }, [puedeVerModulo, mesSel.a, mesSel.m]);

  // Fecha sugerida para la carga rápida: el primer día hábil después del último día cargado
  function sugerirFecha(mapa: Record<string, DiaGuardado>) {
    let ultimo = 0;
    for (let d = 1; d <= diasEnMes; d++) {
      if ((mapa[iso(mesSel.a, mesSel.m, d)]?.vendido ?? null) !== null) ultimo = d;
    }
    const tope = esMesActual ? hoy.getDate() : diasEnMes;
    for (let d = ultimo + 1; d <= tope; d++) {
      const f = iso(mesSel.a, mesSel.m, d);
      if (esHabilDia(f, mapa)) return f;
    }
    return esMesActual ? hoyISO : iso(mesSel.a, mesSel.m, Math.min(ultimo + 1, diasEnMes));
  }

  // Al abrir un mes: semana de hoy (o la 1) y día sugerido para cargar
  useEffect(() => {
    if (cargando) return;
    const info = infoSemanas(mesSel.a, mesSel.m);
    setSemana(esMesActual ? Math.min(semanaDeDia(info, hoy.getDate()), info.total) : 1);
    setQFecha(sugerirFecha(dias));
    setQMonto('');
  }, [cargando, mesSel.a, mesSel.m]);

  function cambiarMes(delta: number) {
    const f = new Date(mesSel.a, mesSel.m + delta, 1);
    if (f > limiteMes) return;
    setMesSel({ a: f.getFullYear(), m: f.getMonth() });
  }

  async function guardarVendido(fecha: string, valor: number | null): Promise<boolean> {
    const { error } = await supabase.from('seguimiento_ventas_dia').upsert({ fecha, vendido: valor }, { onConflict: 'fecha' });
    if (error) {
      alert('Error al guardar: ' + error.message);
      return false;
    }
    setDias((prev) => ({ ...prev, [fecha]: { vendido: valor, habil: prev[fecha]?.habil ?? null } }));
    return true;
  }

  async function cambiarHabil(fila: FilaDia, nuevo: boolean) {
    const porDefecto = fila.semanaDia >= 1 && fila.semanaDia <= 5;
    const manual = nuevo === porDefecto ? null : nuevo;
    const { error } = await supabase.from('seguimiento_ventas_dia').upsert({ fecha: fila.fecha, habil: manual }, { onConflict: 'fecha' });
    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }
    setDias((prev) => ({ ...prev, [fila.fecha]: { vendido: prev[fila.fecha]?.vendido ?? null, habil: manual } }));
  }

  async function guardarObjetivo() {
    if (objetivoEdit === '') {
      alert('Escribí el objetivo del mes.');
      return;
    }
    setGuardandoObj(true);
    const { error } = await supabase
      .from('seguimiento_ventas_mes')
      .upsert({ mes: inicioISO, objetivo: Number(objetivoEdit) }, { onConflict: 'mes' });
    setGuardandoObj(false);
    if (error) {
      alert('Error al guardar el objetivo: ' + error.message);
      return;
    }
    setObjetivo(Number(objetivoEdit));
    setEditandoObj(false);
  }

  async function guardarRapida() {
    if (!qFecha || qMonto === '') {
      alert('Elegí el día y escribí el monto vendido.');
      return;
    }
    setGuardandoQ(true);
    const ok = await guardarVendido(qFecha, Number(qMonto));
    setGuardandoQ(false);
    if (!ok) return;
    const nuevo = { ...dias, [qFecha]: { vendido: Number(qMonto), habil: dias[qFecha]?.habil ?? null } };
    setQFecha(sugerirFecha(nuevo));
    setQMonto('');
  }

  async function imprimir() {
    setExportando(true);
    await new Promise((r) => setTimeout(r, 150));
    window.print();
    setExportando(false);
  }

  async function descargarImagen() {
    if (!hojaRef.current) return;
    setGenerando(true);
    setExportando(true);
    await new Promise((r) => setTimeout(r, 150));
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(hojaRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `ventas-semana-${semana}-${MESES[mesSel.m]}-${mesSel.a}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      alert('No se pudo generar la imagen. Probá de nuevo.');
    } finally {
      setExportando(false);
      setGenerando(false);
    }
  }

  if (!puedeVerModulo) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Pedile al administrador que te habilite Seguimiento de ventas desde el Panel de Accesos.</p>
      </div>
    );
  }

  if (cargando) return <p className="troya-subtitulo">Cargando...</p>;

  // ---------- Cálculos del mes ----------
  const info = infoSemanas(mesSel.a, mesSel.m);

  let diasHabiles = 0;
  let ultimoCargado = 0;
  for (let d = 1; d <= info.n; d++) {
    const f = iso(mesSel.a, mesSel.m, d);
    if (esHabilDia(f, dias)) diasHabiles++;
    if ((dias[f]?.vendido ?? null) !== null) ultimoCargado = d;
  }
  const objDia = diasHabiles > 0 ? objetivo / diasHabiles : 0;

  const filas: FilaDia[] = [];
  let objAcum = 0;
  let vendAcum = 0;
  for (let d = 1; d <= info.n; d++) {
    const f = iso(mesSel.a, mesSel.m, d);
    const habil = esHabilDia(f, dias);
    const vendido = dias[f]?.vendido ?? null;
    const objetivoDia = habil ? objDia : 0;
    objAcum += objetivoDia;
    if (vendido !== null) vendAcum += vendido;
    const cerrado = d <= ultimoCargado;
    filas.push({
      fecha: f,
      dia: d,
      semanaDia: new Date(mesSel.a, mesSel.m, d).getDay(),
      habil,
      vendido,
      objetivo: objetivoDia,
      objetivoAcum: objAcum,
      cerrado,
      vendidoAcum: cerrado ? vendAcum : null,
      pctDia: vendido !== null && objetivoDia > 0 ? vendido / objetivoDia : null,
      pctAcum: cerrado && objAcum > 0 ? vendAcum / objAcum : null,
      dif: cerrado ? vendAcum - objAcum : null,
    });
  }

  const vendidoTotal = filas.reduce((a, f) => a + (f.vendido ?? 0), 0);
  const pctMes = objetivo > 0 ? vendidoTotal / objetivo : null;
  const ultimaFila = ultimoCargado > 0 ? filas[ultimoCargado - 1] : null;
  const difActual = ultimaFila ? ultimaFila.dif : null;
  const pctAcumUlt = ultimaFila ? ultimaFila.pctAcum : null;
  const planPct = ultimaFila && objetivo > 0 ? ultimaFila.objetivoAcum / objetivo : null;

  const cargadosHabiles = filas.filter((f) => f.habil && f.vendido !== null);
  const vendidoHabil = cargadosHabiles.reduce((a, f) => a + (f.vendido ?? 0), 0);
  const ritmo = cargadosHabiles.length > 0 ? vendidoHabil / cargadosHabiles.length : null;
  const proyeccion = ritmo !== null ? vendidoTotal - vendidoHabil + ritmo * diasHabiles : null;
  const restantes = filas.filter((f) => f.habil && f.dia > ultimoCargado).length;
  const faltante = objetivo - vendidoTotal;
  const porDia = faltante > 0 && restantes > 0 ? faltante / restantes : null;

  // ---------- Cálculos de la semana ----------
  const semanaOk = Math.min(Math.max(semana, 1), info.total);
  const { ini: sIni, fin: sFin } = info.rango(semanaOk);
  const filasSemana = filas.filter((f) => f.dia >= sIni && f.dia <= sFin);
  const objetivoSemana = filasSemana.reduce((a, f) => a + f.objetivo, 0);
  const vendidoSemana = filasSemana.reduce((a, f) => a + (f.vendido ?? 0), 0);
  const hayCargaSemana = filasSemana.some((f) => f.vendido !== null);
  const pctSemana = objetivoSemana > 0 && hayCargaSemana ? vendidoSemana / objetivoSemana : null;
  const cerradasHastaFin = filas.filter((f) => f.dia <= sFin && f.cerrado);
  const difSemana = cerradasHastaFin.length > 0 ? cerradasHastaFin[cerradasHastaFin.length - 1].dif : null;

  const tarjeta: React.CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px' };
  const etiqueta: React.CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };
  const numeroGrande: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, lineHeight: 1.15, marginTop: 4 };
  const chico: React.CSSProperties = { fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 };

  const vendidoQ = qFecha ? dias[qFecha]?.vendido ?? null : null;
  const mostrarEdicionObj = puedeEditarModulo && (editandoObj || objetivo === 0);

  return (
    <div>
      <style>{CSS}</style>

      {/* TÍTULO + MES */}
      <div className="troya-header">
        <div>
          <h1>Seguimiento de ventas</h1>
          <p className="troya-subtitulo">Objetivo diario, semanal y mensual de la unidad{!puedeEditarModulo && ' · Solo lectura'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button className="troya-btn troya-btn-secundario" style={{ padding: '8px 14px' }} onClick={() => cambiarMes(-1)} title="Mes anterior">←</button>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, minWidth: 150, textAlign: 'center' }}>
            {cap(MESES[mesSel.m])} {mesSel.a}
          </div>
          <button className="troya-btn troya-btn-secundario" style={{ padding: '8px 14px' }} onClick={() => cambiarMes(1)} disabled={esUltimoMes} title="Mes siguiente">→</button>
          {!esMesActual && (
            <button className="troya-btn" style={{ padding: '8px 14px' }} onClick={() => setMesSel({ a: hoy.getFullYear(), m: hoy.getMonth() })}>
              Mes actual
            </button>
          )}
        </div>
      </div>

      {/* FRANJA DE RESUMEN */}
      <div className="sv-resumen">
        {/* Objetivo */}
        <div className="sv-celda">
          <div style={etiqueta}>Objetivo del mes</div>
          {mostrarEdicionObj ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 150px', display: 'flex' }}>
                <InputMoneda value={objetivoEdit} onChange={setObjetivoEdit} placeholder="Objetivo mensual" />
              </div>
              <button className="troya-btn" style={{ padding: '10px 16px' }} onClick={guardarObjetivo} disabled={guardandoObj}>
                {guardandoObj ? 'Guardando...' : 'Guardar'}
              </button>
              {objetivo > 0 && (
                <button
                  className="troya-btn troya-btn-secundario"
                  style={{ padding: '10px 16px' }}
                  onClick={() => {
                    setEditandoObj(false);
                    setObjetivoEdit(String(Math.round(objetivo)));
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ ...numeroGrande, color: '#EB6726' }}>{objetivo > 0 ? money(objetivo) : '—'}</div>
              <div style={chico}>
                {diasHabiles} días hábiles · {objetivo > 0 ? money(objDia) : '—'} por día{' '}
                {puedeEditarModulo && (
                  <button className="sv-link" onClick={() => setEditandoObj(true)}>
                    Editar
                  </button>
                )}
              </div>
            </>
          )}
          {objetivo === 0 && puedeEditarModulo && (
            <div style={{ ...chico, color: '#8A6D00' }}>Definilo para calcular objetivos diarios y porcentajes.</div>
          )}
        </div>

        {/* Vendido */}
        <div className="sv-celda">
          <div style={etiqueta}>Vendido del mes</div>
          <div style={numeroGrande}>{money(vendidoTotal)}</div>
          <div style={{ position: 'relative', height: 8, background: '#F1EDE8', borderRadius: 6, margin: '10px 0 6px' }}>
            <div style={{ width: `${Math.min(100, (pctMes ?? 0) * 100)}%`, height: '100%', background: 'var(--orange)', borderRadius: 6 }} />
            {planPct !== null && (
              <div
                title="Dónde deberías ir según el plan"
                style={{ position: 'absolute', top: -3, bottom: -3, left: `${Math.min(100, planPct * 100)}%`, width: 2, background: 'var(--ink)' }}
              />
            )}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {pctMes !== null ? `${Math.round(pctMes * 100)}% del objetivo` : 'Sin objetivo definido'}
            {planPct !== null ? ` · el plan marca ${Math.round(planPct * 100)}%` : ''}
          </div>
        </div>

        {/* Diferencia */}
        <div className="sv-celda">
          <div style={etiqueta}>Diferencia contra el plan</div>
          <div style={{ marginTop: 6 }}>{difActual !== null ? <Dif v={difActual} grande /> : <span style={{ ...numeroGrande, color: 'var(--muted)' }}>—</span>}</div>
          <div style={chico}>
            {pctAcumUlt !== null ? `${Math.round(pctAcumUlt * 100)}% del plan hasta el último día cargado` : 'Cargá un día para verla'}
          </div>
        </div>

        {/* Ritmo / cierre */}
        <div className="sv-celda">
          <div style={etiqueta}>{esMesActual ? 'Ritmo' : 'Cierre del mes'}</div>
          {objetivo === 0 ? (
            <div style={{ ...chico, marginTop: 8 }}>Definí el objetivo para ver la proyección.</div>
          ) : esFuturo ? (
            <div style={{ ...chico, marginTop: 8 }}>Mes por comenzar.</div>
          ) : esMesActual ? (
            <div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
              {proyeccion !== null ? (
                <div>
                  Cerrás en <strong>{money(proyeccion)}</strong> ({Math.round((proyeccion / objetivo) * 100)}%)
                </div>
              ) : (
                <div style={{ color: 'var(--muted)' }}>Cargá un día para ver la proyección.</div>
              )}
              <div>
                {faltante <= 0 ? (
                  <strong style={{ color: '#2E7D32' }}>Objetivo cumplido.</strong>
                ) : porDia !== null ? (
                  <>
                    Hay que vender <strong>{money(porDia)}</strong> por día ({restantes} hábiles)
                  </>
                ) : (
                  <>Faltaron {money(faltante)}</>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
              {faltante <= 0 ? (
                <strong style={{ color: '#2E7D32' }}>Objetivo cumplido.</strong>
              ) : (
                <>Faltaron <strong>{money(faltante)}</strong> para el objetivo.</>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CARGAR VENTA */}
      {puedeEditarModulo && (
        <div style={{ ...tarjeta, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Cargar venta</span>
          <input
            className="troya-input"
            type="date"
            style={{ flex: '0 0 150px', padding: '8px 10px' }}
            min={inicioISO}
            max={finISO}
            value={qFecha}
            onChange={(e) => {
              const f = e.target.value;
              setQFecha(f);
              const v = dias[f]?.vendido ?? null;
              setQMonto(v !== null ? String(Math.round(v)) : '');
            }}
          />
          {qFecha && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', minWidth: 72 }}>
              {DIAS_LARGOS[new Date(qFecha + 'T00:00:00').getDay()]}
            </span>
          )}
          <div style={{ flex: '1 1 180px', maxWidth: 280, display: 'flex' }}>
            <InputMoneda value={qMonto} onChange={setQMonto} placeholder="Monto vendido ese día" />
          </div>
          <button className="troya-btn" onClick={guardarRapida} disabled={guardandoQ}>
            {guardandoQ ? 'Guardando...' : 'Guardar venta'}
          </button>
          {vendidoQ !== null && (
            <span className="troya-subtitulo" style={{ margin: 0 }}>
              Ya tiene {money(vendidoQ)}: si guardás, se reemplaza.
            </span>
          )}
        </div>
      )}

      {/* SELECTOR DE VISTA */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div className="sv-seg">
          <button className={vista === 'semana' ? 'on' : ''} onClick={() => setVista('semana')}>Semana</button>
          <button className={vista === 'mes' ? 'on' : ''} onClick={() => setVista('mes')}>Mes completo</button>
        </div>

        {vista === 'semana' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="troya-btn troya-btn-secundario" style={{ padding: '8px 14px' }} onClick={() => setSemana(Math.max(1, semanaOk - 1))} disabled={semanaOk <= 1}>←</button>
              <div style={{ fontWeight: 700, minWidth: 210, textAlign: 'center', fontSize: 14 }}>
                Semana {semanaOk} · del {fechaCorta(mesSel.m, sIni)} al {fechaCorta(mesSel.m, sFin)}
              </div>
              <button className="troya-btn troya-btn-secundario" style={{ padding: '8px 14px' }} onClick={() => setSemana(Math.min(info.total, semanaOk + 1))} disabled={semanaOk >= info.total}>→</button>
            </div>
            <span style={{ flex: 1 }} />
            <button className="troya-btn troya-btn-secundario" style={{ padding: '8px 14px' }} onClick={imprimir}>Imprimir</button>
            <button className="troya-btn troya-btn-secundario" style={{ padding: '8px 14px' }} onClick={descargarImagen} disabled={generando}>
              {generando ? 'Generando...' : 'Descargar imagen'}
            </button>
          </>
        )}
      </div>

      {/* ============ VISTA SEMANA ============ */}
      {vista === 'semana' && (
        <div style={{ overflowX: 'auto' }}>
          <div
            ref={hojaRef}
            className="sv-hoja"
            style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18, minWidth: 900 }}
          >
            <div
              style={{
                background: '#1C1512',
                color: '#fff',
                borderRadius: 8,
                borderBottom: '4px solid #DA231F',
                padding: '12px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>TROYA · Seguimiento semanal de ventas</span>
              <span style={{ fontSize: 14.5 }}>
                {cap(MESES[mesSel.m])} {mesSel.a} · Semana {semanaOk} · Del {fechaCorta(mesSel.m, sIni)} al {fechaCorta(mesSel.m, sFin)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 14 }}>
              <div style={{ ...tarjeta, background: '#FDF0E7' }}>
                <div style={etiqueta}>Objetivo de la semana</div>
                <div style={{ ...numeroGrande, color: '#EB6726' }}>{objetivoSemana > 0 ? money(objetivoSemana) : '—'}</div>
              </div>
              <div style={tarjeta}>
                <div style={etiqueta}>Vendido en la semana</div>
                <div style={numeroGrande}>{hayCargaSemana ? money(vendidoSemana) : '—'}</div>
              </div>
              <div style={tarjeta}>
                <div style={etiqueta}>Cumplimiento de la semana</div>
                <div style={{ marginTop: 8 }}>{pctSemana !== null ? <Pct p={pctSemana} grande /> : <span style={{ color: 'var(--muted)' }}>—</span>}</div>
              </div>
              <div style={tarjeta}>
                <div style={etiqueta}>Diferencia acumulada del mes</div>
                <div style={{ marginTop: 8 }}>{difSemana !== null ? <Dif v={difSemana} grande /> : <span style={{ color: 'var(--muted)' }}>—</span>}</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: 14 }}>
              <colgroup>
                <col style={{ width: '11%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '13%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2} style={thEstilo('#1C1512')}>Día</th>
                  <th rowSpan={2} style={thEstilo('#1C1512')}>Fecha</th>
                  <th colSpan={3} style={thEstilo('#EB6726')}>DIARIO ($)</th>
                  <th colSpan={3} style={thEstilo('#DA231F')}>ACUMULADO ($)</th>
                  <th rowSpan={2} style={thEstilo('#2E7D32')}>DIFERENCIA ACUMULADA</th>
                </tr>
                <tr>
                  <th style={thEstilo('#F3A572', '#1C1512')}>Objetivo</th>
                  <th style={thEstilo('#F3A572', '#1C1512')}>Vendido</th>
                  <th style={thEstilo('#F3A572', '#1C1512')}>%</th>
                  <th style={thEstilo('#E2726E')}>Objetivo</th>
                  <th style={thEstilo('#E2726E')}>Vendido</th>
                  <th style={thEstilo('#E2726E')}>%</th>
                </tr>
              </thead>
              <tbody>
                {filasSemana.map((f) => {
                  const esHoy = f.fecha === hoyISO;
                  const fondo = !f.habil ? '#EEEAE5' : esHoy ? '#FFF8F3' : '#fff';
                  return (
                    <tr key={f.fecha} style={{ background: fondo }}>
                      <td style={tdEstilo({ fondo: !f.habil ? '#EEEAE5' : '#FDF0E7', color: '#5C4636', peso: 700, tam: 16 })}>
                        {DIAS_LARGOS[f.semanaDia]}
                        {!f.habil && <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>no hábil</div>}
                      </td>
                      <td style={tdEstilo({ color: '#5C4636', peso: 700, tam: 16 })}>{fechaCorta(mesSel.m, f.dia)}</td>
                      <td style={tdEstilo({ tam: 17 })}>{f.objetivo > 0 ? money(f.objetivo) : '—'}</td>
                      <td style={tdEstilo({ tam: 17 })}>
                        <CeldaMonto valor={f.vendido} editable={puedeEditarModulo} estatico={exportando} grande onGuardar={(v) => guardarVendido(f.fecha, v)} />
                      </td>
                      <td style={tdEstilo({})}><Pct p={f.pctDia} /></td>
                      <td style={tdEstilo({ tam: 17 })}>{money(f.objetivoAcum)}</td>
                      <td style={tdEstilo({ tam: 17 })}>{f.vendidoAcum !== null ? money(f.vendidoAcum) : ''}</td>
                      <td style={tdEstilo({})}><Pct p={f.pctAcum} /></td>
                      <td style={tdEstilo({ tam: 17 })}><Dif v={f.dif} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '10px 0 0', textAlign: 'center' }}>
              Verde: 100% o más · Amarillo: 80% a 99% · Rojo: menos de 80%. Los acumulados aparecen hasta el último día cargado.
            </p>
          </div>
        </div>
      )}

      {/* ============ VISTA MES ============ */}
      {vista === 'mes' && (
        <>
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} style={thEstilo('#1C1512')}>Fecha</th>
                    <th colSpan={3} style={thEstilo('#EB6726')}>DIARIO ($)</th>
                    <th colSpan={3} style={thEstilo('#DA231F')}>ACUMULADO ($)</th>
                    <th rowSpan={2} style={thEstilo('#2E7D32')}>DIFERENCIA</th>
                    <th rowSpan={2} style={thEstilo('#1C1512')}>HÁBIL</th>
                  </tr>
                  <tr>
                    <th style={thEstilo('#F3A572', '#1C1512')}>Objetivo</th>
                    <th style={thEstilo('#F3A572', '#1C1512')}>Vendido</th>
                    <th style={thEstilo('#F3A572', '#1C1512')}>%</th>
                    <th style={thEstilo('#E2726E')}>Objetivo</th>
                    <th style={thEstilo('#E2726E')}>Vendido</th>
                    <th style={thEstilo('#E2726E')}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: info.total }, (_, i) => i + 1).map((k) => {
                    const { ini, fin } = info.rango(k);
                    const filasSem = filas.slice(ini - 1, fin);
                    const objSem = filasSem.reduce((a, f) => a + f.objetivo, 0);
                    const vendSem = filasSem.reduce((a, f) => a + (f.vendido ?? 0), 0);
                    const hayCarga = filasSem.some((f) => f.vendido !== null);
                    const pctSem = objSem > 0 && hayCarga ? vendSem / objSem : null;

                    return (
                      <Fragment key={k}>
                        <tr>
                          <td colSpan={9} style={{ background: '#FDF0E7', padding: '8px 14px', borderTop: '1px solid #F0E3D8' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#8A5A3C', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                Semana {k} · del {fechaCorta(mesSel.m, ini)} al {fechaCorta(mesSel.m, fin)}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, color: '#5C4636', flexWrap: 'wrap' }}>
                                <span>Objetivo <strong>{objSem > 0 ? money(objSem) : '—'}</strong></span>
                                <span>Vendido <strong>{hayCarga ? money(vendSem) : '—'}</strong></span>
                                <Pct p={pctSem} />
                                <button
                                  className="sv-link"
                                  onClick={() => {
                                    setSemana(k);
                                    setVista('semana');
                                  }}
                                >
                                  Ver semana →
                                </button>
                              </span>
                            </div>
                          </td>
                        </tr>
                        {filasSem.map((f) => {
                          const esHoy = f.fecha === hoyISO;
                          const apagado = !f.habil;
                          return (
                            <tr key={f.fecha} style={{ background: apagado ? '#F8F5F1' : esHoy ? '#FFF8F3' : '#fff' }}>
                              <td
                                style={{
                                  ...tdMes(apagado ? 'var(--muted)' : 'var(--ink)'),
                                  textAlign: 'left',
                                  paddingLeft: 16,
                                  boxShadow: esHoy ? 'inset 3px 0 0 var(--orange)' : undefined,
                                  fontWeight: esHoy ? 800 : 600,
                                }}
                              >
                                {DIAS_CORTOS[f.semanaDia]} {fechaCorta(mesSel.m, f.dia)}
                                {esHoy && (
                                  <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase' }}>hoy</span>
                                )}
                              </td>
                              <td style={tdMes(apagado ? 'var(--muted)' : 'var(--ink)')}>{f.objetivo > 0 ? money(f.objetivo) : '—'}</td>
                              <td style={tdMes('var(--ink)')}>
                                <CeldaMonto valor={f.vendido} editable={puedeEditarModulo} estatico={false} onGuardar={(v) => guardarVendido(f.fecha, v)} />
                              </td>
                              <td style={tdMes('var(--ink)')}><Pct p={f.pctDia} /></td>
                              <td style={tdMes(apagado ? 'var(--muted)' : 'var(--ink)')}>{money(f.objetivoAcum)}</td>
                              <td style={tdMes('var(--ink)')}>{f.vendidoAcum !== null ? money(f.vendidoAcum) : ''}</td>
                              <td style={tdMes('var(--ink)')}><Pct p={f.pctAcum} /></td>
                              <td style={tdMes('var(--ink)')}><Dif v={f.dif} /></td>
                              <td style={tdMes('var(--ink)')}>
                                <input
                                  type="checkbox"
                                  style={{ width: 17, height: 17, cursor: puedeEditarModulo ? 'pointer' : 'default' }}
                                  checked={f.habil}
                                  disabled={!puedeEditarModulo}
                                  onChange={(e) => cambiarHabil(f, e.target.checked)}
                                  title="Destildá los feriados o los días sin actividad"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="troya-subtitulo" style={{ marginTop: 10 }}>
            Destildá Hábil en los feriados: el objetivo diario se reparte solo entre los días hábiles que quedan y el acumulado siempre cierra en el objetivo del mes.
            También podés tildar un sábado si se trabaja.
          </p>
        </>
      )}
    </div>
  );
}

function thEstilo(fondo: string, color = '#fff'): React.CSSProperties {
  return {
    background: fondo,
    color,
    border: '1px solid #D8CCC2',
    padding: '8px 4px',
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: 0.3,
  };
}

function tdEstilo(o: { fondo?: string; color?: string; peso?: number; tam?: number }): React.CSSProperties {
  return {
    background: o.fondo,
    color: o.color ?? 'var(--ink)',
    border: '1px solid #D8CCC2',
    padding: '10px 4px',
    textAlign: 'center',
    fontSize: o.tam ?? 14,
    fontWeight: o.peso ?? 700,
    height: 54,
  };
}

function tdMes(color: string): React.CSSProperties {
  return {
    color,
    borderBottom: '1px solid #F1EDE8',
    padding: '8px 6px',
    textAlign: 'center',
    fontSize: 13.5,
    fontWeight: 600,
    height: 46,
  };
}