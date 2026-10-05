'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import CumplimientoGauge from '@/components/CumplimientoGauge';
import InputMoneda from '@/components/InputMoneda';

const MODULO = 'activos';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

type PuntoTroya = {
  id: string;
  minimo_trimestral: number | null;
  exclusividad_zona: boolean;
  clientes: { nombre: string; localidad: string | null; provincia: string | null } | null;
};

// punto_troya_id -> { 'AAAA-MM-01' -> monto comprado ese mes }
type ComprasMap = Record<string, Record<string, number>>;

function isoMes(anio: number, mes: number) {
  const f = new Date(anio, mes, 1);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`;
}

function cap(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function money(v: number) {
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function ActivosPage() {
  const router = useRouter();
  const { puedeVer, puedeEditar } = useAuth();
  const puedeVerModulo = puedeVer(MODULO);
  const puedeEditarModulo = puedeEditar(MODULO);

  const hoy = new Date();

  const [puntos, setPuntos] = useState<PuntoTroya[]>([]);
  const [compras, setCompras] = useState<ComprasMap>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [minimoEdit, setMinimoEdit] = useState('');
  const [exclusividadEdit, setExclusividadEdit] = useState(false);

  // Carga de compras (se puede ir y volver entre meses)
  const [cargandoCompraId, setCargandoCompraId] = useState<string | null>(null);
  const [mesCompra, setMesCompra] = useState<{ a: number; m: number }>({ a: new Date().getFullYear(), m: new Date().getMonth() });
  const [montoCompra, setMontoCompra] = useState('');
  const [montoExistente, setMontoExistente] = useState<number | null>(null);
  const [guardandoCompra, setGuardandoCompra] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const esMesActualCompra = mesCompra.a === hoy.getFullYear() && mesCompra.m === hoy.getMonth();

  async function cargarActivos() {
    setCargando(true);

    const { data: puntosData, error: errorPuntos } = await supabase
      .from('puntos_troya')
      .select('id, minimo_trimestral, exclusividad_zona, clientes(nombre, localidad, provincia)')
      .eq('estado', 'confirmado');

    if (errorPuntos) {
      setCargando(false);
      return;
    }

    setPuntos((puntosData as any) ?? []);

    // Se traen los últimos 14 meses: alcanza para el trimestre en curso y para el historial reciente
    const desde = isoMes(hoy.getFullYear(), hoy.getMonth() - 13);
    const { data: comprasData } = await supabase
      .from('compras_mensuales')
      .select('punto_troya_id, mes, monto')
      .gte('mes', desde);

    const mapa: ComprasMap = {};
    (comprasData ?? []).forEach((c: any) => {
      if (!mapa[c.punto_troya_id]) mapa[c.punto_troya_id] = {};
      mapa[c.punto_troya_id][String(c.mes).slice(0, 10)] = Number(c.monto);
    });

    setCompras(mapa);
    setCargando(false);
  }

  useEffect(() => {
    if (puedeVerModulo) cargarActivos();
  }, [puedeVerModulo]);

  function totalTrimestre(puntoId: string) {
    const inicio = isoMes(hoy.getFullYear(), Math.floor(hoy.getMonth() / 3) * 3);
    const meses = compras[puntoId] ?? {};
    return Object.entries(meses)
      .filter(([mes]) => mes >= inicio)
      .reduce((acc, [, monto]) => acc + monto, 0);
  }

  function empezarEdicion(p: PuntoTroya) {
    setCargandoCompraId(null);
    setEditandoId(p.id);
    setMinimoEdit(p.minimo_trimestral ? String(p.minimo_trimestral) : '');
    setExclusividadEdit(p.exclusividad_zona);
  }

  async function guardarEdicion(id: string) {
    const { error } = await supabase
      .from('puntos_troya')
      .update({
        minimo_trimestral: minimoEdit ? Number(minimoEdit) : null,
        exclusividad_zona: exclusividadEdit,
      })
      .eq('id', id);

    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }

    setEditandoId(null);
    cargarActivos();
  }

  async function eliminarPunto(p: PuntoTroya) {
    const confirmado = confirm(
      `¿Eliminar el Punto Troya de "${p.clientes?.nombre}"? Esto también borra su historial de compras mensuales cargado. El cliente en sí no se borra.`
    );
    if (!confirmado) return;

    const { error } = await supabase.from('puntos_troya').delete().eq('id', p.id);
    if (error) {
      alert('No se pudo eliminar: ' + error.message);
      return;
    }
    cargarActivos();
  }

  // ---------- Compras por mes ----------
  async function cargarMontoMes(puntoId: string, anio: number, mes: number) {
    const { data } = await supabase
      .from('compras_mensuales')
      .select('monto')
      .eq('punto_troya_id', puntoId)
      .eq('mes', isoMes(anio, mes))
      .maybeSingle();

    const existente = data ? Number(data.monto) : null;
    setMontoExistente(existente);
    setMontoCompra(existente !== null ? String(Math.round(existente)) : '');
  }

  async function irAMes(puntoId: string, anio: number, mes: number) {
    const f = new Date(anio, mes, 1);
    const limite = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    if (f > limite) return;
    setMesCompra({ a: f.getFullYear(), m: f.getMonth() });
    setGuardadoOk(false);
    await cargarMontoMes(puntoId, f.getFullYear(), f.getMonth());
  }

  function empezarCargaCompra(puntoId: string) {
    setEditandoId(null);
    setCargandoCompraId(puntoId);
    irAMes(puntoId, hoy.getFullYear(), hoy.getMonth());
  }

  async function guardarCompra(puntoId: string) {
    if (montoCompra === '') {
      alert(`Poné el monto comprado en ${MESES[mesCompra.m]}.`);
      return;
    }

    const monto = Number(montoCompra);
    const mes = isoMes(mesCompra.a, mesCompra.m);

    setGuardandoCompra(true);
    const { error } = await supabase.from('compras_mensuales').upsert(
      { punto_troya_id: puntoId, mes, monto },
      { onConflict: 'punto_troya_id,mes' }
    );
    setGuardandoCompra(false);

    if (error) {
      alert('Error al guardar la compra: ' + error.message);
      return;
    }

    setCompras((prev) => ({ ...prev, [puntoId]: { ...(prev[puntoId] ?? {}), [mes]: monto } }));
    setMontoExistente(monto);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2500);
  }

  async function borrarCompraMes(puntoId: string) {
    if (montoExistente === null) return;
    const confirmado = confirm(`¿Borrar la compra de ${MESES[mesCompra.m]} ${mesCompra.a} (${money(montoExistente)})?`);
    if (!confirmado) return;

    const mes = isoMes(mesCompra.a, mesCompra.m);
    const { error } = await supabase.from('compras_mensuales').delete().eq('punto_troya_id', puntoId).eq('mes', mes);
    if (error) {
      alert('No se pudo borrar: ' + error.message);
      return;
    }

    setCompras((prev) => {
      const copia = { ...(prev[puntoId] ?? {}) };
      delete copia[mes];
      return { ...prev, [puntoId]: copia };
    });
    setMontoExistente(null);
    setMontoCompra('');
  }

  if (!puedeVerModulo) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Pedile al administrador que te habilite Activos desde el Panel de Accesos.</p>
      </div>
    );
  }

  const puntosFiltrados = puntos.filter((p) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return [p.clientes?.nombre, p.clientes?.localidad, p.clientes?.provincia]
      .filter(Boolean)
      .some((campo) => campo!.toLowerCase().includes(texto));
  });

  const ultimosMeses = Array.from({ length: 6 }, (_, i) => {
    const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return { a: f.getFullYear(), m: f.getMonth() };
  });

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Puntos Troya Activos</h1>
          <p className="troya-subtitulo">
            {busqueda ? `${puntosFiltrados.length} de ${puntos.length}` : `${puntos.length} confirmados`}
            {!puedeEditarModulo && ' · Solo lectura'}
          </p>
        </div>
      </div>

      <div className="troya-buscador">
        <IconBuscar />
        <input
          type="text"
          placeholder="Buscar por nombre, localidad o provincia..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : puntos.length === 0 ? (
        <div className="troya-vacio">
          <h3>Todavía no hay Puntos Troya confirmados</h3>
          <p>Cuando confirmes un prospecto, va a aparecer acá con su cumplimiento trimestral.</p>
        </div>
      ) : puntosFiltrados.length === 0 ? (
        <div className="troya-vacio">
          <h3>No hay resultados para &ldquo;{busqueda}&rdquo;</h3>
          <p>Probá con otro nombre, localidad o provincia.</p>
        </div>
      ) : (
        <div className="troya-lista">
          {puntosFiltrados.map((p) => {
            const comprado = totalTrimestre(p.id);
            const minimo = p.minimo_trimestral ?? 0;
            const porcentaje = minimo > 0 ? Math.round((comprado / minimo) * 100) : 0;

            if (editandoId === p.id) {
              return (
                <div key={p.id} className="troya-card troya-card-editando">
                  <h3>{p.clientes?.nombre}</h3>
                  <div className="troya-form">
                    <InputMoneda value={minimoEdit} onChange={setMinimoEdit} placeholder="Mínimo trimestral" />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                      <input type="checkbox" checked={exclusividadEdit} onChange={(e) => setExclusividadEdit(e.target.checked)} />
                      Exclusividad de zona
                    </label>
                  </div>
                  <div className="troya-card-acciones">
                    <button className="troya-btn" onClick={() => guardarEdicion(p.id)}>Guardar cambios</button>
                    <button className="troya-btn troya-btn-secundario" onClick={() => setEditandoId(null)}>Cancelar</button>
                  </div>
                </div>
              );
            }

            if (cargandoCompraId === p.id) {
              return (
                <div key={p.id} className="troya-card troya-card-editando">
                  <h3>{p.clientes?.nombre}</h3>
                  <p className="troya-subtitulo" style={{ margin: 0 }}>
                    Cargá o corregí la compra de cualquier mes. Cada monto se suma al trimestre que corresponde.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                    <button
                      className="troya-btn troya-btn-secundario"
                      onClick={() => irAMes(p.id, mesCompra.a, mesCompra.m - 1)}
                      title="Mes anterior"
                    >
                      ←
                    </button>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, minWidth: 170, textAlign: 'center' }}>
                      {cap(MESES[mesCompra.m])} {mesCompra.a}
                    </div>
                    <button
                      className="troya-btn troya-btn-secundario"
                      onClick={() => irAMes(p.id, mesCompra.a, mesCompra.m + 1)}
                      disabled={esMesActualCompra}
                      title="Mes siguiente"
                    >
                      →
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 2px' }}>
                    {ultimosMeses.map(({ a, m }) => {
                      const monto = compras[p.id]?.[isoMes(a, m)];
                      const seleccionado = a === mesCompra.a && m === mesCompra.m;
                      return (
                        <button
                          key={`${a}-${m}`}
                          onClick={() => irAMes(p.id, a, m)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 20,
                            fontSize: 12.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                            border: seleccionado ? '1px solid var(--red)' : '1px solid var(--line)',
                            background: seleccionado ? 'var(--tint-red)' : '#fff',
                            color: seleccionado ? 'var(--red)' : 'var(--ink)',
                          }}
                        >
                          {MESES_CORTOS[m]} {a !== hoy.getFullYear() ? a : ''} · {monto !== undefined ? money(monto) : '—'}
                        </button>
                      );
                    })}
                  </div>

                  <div className="troya-form">
                    <InputMoneda value={montoCompra} onChange={setMontoCompra} placeholder={`Monto comprado en ${MESES[mesCompra.m]}`} />
                  </div>

                  {montoExistente !== null && (
                    <p className="troya-subtitulo" style={{ margin: '6px 0 0' }}>
                      Ya había {money(montoExistente)} cargados en {MESES[mesCompra.m]}. Si guardás un monto nuevo, lo reemplaza.
                    </p>
                  )}
                  {guardadoOk && <p style={{ color: '#2E7D32', fontSize: 13, fontWeight: 600, margin: '6px 0 0' }}>Guardado.</p>}

                  <div className="troya-card-acciones" style={{ marginTop: 12 }}>
                    <button className="troya-btn" onClick={() => guardarCompra(p.id)} disabled={guardandoCompra}>
                      {guardandoCompra ? 'Guardando...' : montoExistente !== null ? 'Actualizar compra' : 'Guardar compra'}
                    </button>
                    {montoExistente !== null && (
                      <button className="troya-btn troya-btn-secundario" onClick={() => borrarCompraMes(p.id)}>
                        Borrar este mes
                      </button>
                    )}
                    <button className="troya-btn troya-btn-secundario" onClick={() => setCargandoCompraId(null)}>Cerrar</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={p.id} className={`troya-card ${porcentaje >= 100 ? 'troya-card--activo' : 'troya-card--alerta'}`}>
                <div className="troya-card-info">
                  <h3>{p.clientes?.nombre}</h3>
                  <p>
                    {[p.clientes?.localidad, p.clientes?.provincia].filter(Boolean).join(', ')}
                    {p.exclusividad_zona ? ' · Exclusividad de zona' : ''}
                  </p>
                  {minimo > 0 && (
                    <p style={{ fontSize: 12 }}>
                      Trimestre: {money(comprado)} de {money(minimo)}
                    </p>
                  )}
                </div>
                <div className="troya-card-derecha">
                  <CumplimientoGauge porcentaje={porcentaje} />
                  <div className="troya-card-acciones">
                    <button className="troya-icon-btn" onClick={() => router.push(`/activos/${p.id}`)} title="Ver ficha completa">
                      <IconOjo />
                    </button>
                    {puedeEditarModulo && (
                      <>
                        <button className="troya-icon-btn" onClick={() => empezarCargaCompra(p.id)} title="Cargar o corregir compras por mes">
                          <IconMoneda />
                        </button>
                        <button className="troya-icon-btn" onClick={() => empezarEdicion(p)} title="Editar mínimo y exclusividad">
                          <IconLapiz />
                        </button>
                        <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarPunto(p)} title="Eliminar">
                          <IconTacho />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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

function IconOjo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconMoneda() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5c0-1.4 1.1-2 2.5-2s2.5.7 2.5 2-1.1 1.7-2.5 2-2.5.6-2.5 2 1.1 2 2.5 2 2.5-.6 2.5-2" />
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