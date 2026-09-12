'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CumplimientoGauge from '@/components/CumplimientoGauge';
import InputMoneda from '@/components/InputMoneda';

type PuntoTroya = {
  id: string;
  minimo_trimestral: number | null;
  exclusividad_zona: boolean;
  clientes: { nombre: string; localidad: string | null; provincia: string | null } | null;
};

function inicioTrimestreActual(): Date {
  const hoy = new Date();
  const inicioTrimestre = Math.floor(hoy.getMonth() / 3) * 3;
  return new Date(hoy.getFullYear(), inicioTrimestre, 1);
}

function primerDiaMesActual(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}

export default function ActivosPage() {
  const router = useRouter();
  const [puntos, setPuntos] = useState<PuntoTroya[]>([]);
  const [comprasPorPunto, setComprasPorPunto] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [minimoEdit, setMinimoEdit] = useState('');
  const [exclusividadEdit, setExclusividadEdit] = useState(false);

  const [cargandoCompraId, setCargandoCompraId] = useState<string | null>(null);
  const [montoCompra, setMontoCompra] = useState('');

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

    const inicioISO = inicioTrimestreActual().toISOString().slice(0, 10);
    const { data: comprasData } = await supabase
      .from('compras_mensuales')
      .select('punto_troya_id, monto')
      .gte('mes', inicioISO);

    const totales: Record<string, number> = {};
    (comprasData ?? []).forEach((c) => {
      totales[c.punto_troya_id] = (totales[c.punto_troya_id] ?? 0) + Number(c.monto);
    });

    setComprasPorPunto(totales);
    setCargando(false);
  }

  useEffect(() => {
    cargarActivos();
  }, []);

  const puntosFiltrados = puntos.filter((p) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return [p.clientes?.nombre, p.clientes?.localidad, p.clientes?.provincia]
      .filter(Boolean)
      .some((campo) => campo!.toLowerCase().includes(texto));
  });

  function empezarEdicion(p: PuntoTroya) {
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

  function empezarCargaCompra(id: string) {
    setCargandoCompraId(id);
    setMontoCompra('');
  }

  async function guardarCompra(puntoId: string) {
    if (!montoCompra) return;

    const { error } = await supabase.from('compras_mensuales').upsert(
      {
        punto_troya_id: puntoId,
        mes: primerDiaMesActual(),
        monto: Number(montoCompra),
      },
      { onConflict: 'punto_troya_id,mes' }
    );

    if (error) {
      alert('Error al cargar la compra: ' + error.message);
      return;
    }

    setCargandoCompraId(null);
    cargarActivos();
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Puntos Troya Activos</h1>
          <p className="troya-subtitulo">
            {busqueda ? `${puntosFiltrados.length} de ${puntos.length}` : `${puntos.length} confirmados`}
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
            const comprado = comprasPorPunto[p.id] ?? 0;
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
                  <p className="troya-subtitulo" style={{ margin: 0 }}>Compra de este mes (se suma al trimestre en curso)</p>
                  <div className="troya-form">
                    <InputMoneda value={montoCompra} onChange={setMontoCompra} placeholder="Monto comprado este mes" />
                  </div>
                  <div className="troya-card-acciones">
                    <button className="troya-btn" onClick={() => guardarCompra(p.id)}>Guardar compra</button>
                    <button className="troya-btn troya-btn-secundario" onClick={() => setCargandoCompraId(null)}>Cancelar</button>
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
                </div>
                <CumplimientoGauge porcentaje={porcentaje} />
                <div className="troya-card-acciones">
                  <button className="troya-icon-btn" onClick={() => router.push(`/activos/${p.id}`)} title="Ver ficha completa">
                    <IconOjo />
                  </button>
                  <button className="troya-icon-btn" onClick={() => empezarCargaCompra(p.id)} title="Cargar compra del mes">
                    <IconMoneda />
                  </button>
                  <button className="troya-icon-btn" onClick={() => empezarEdicion(p)} title="Editar">
                    <IconLapiz />
                  </button>
                  <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarPunto(p)} title="Eliminar">
                    <IconTacho />
                  </button>
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