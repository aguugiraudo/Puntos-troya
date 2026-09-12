'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import CumplimientoGauge from '@/components/CumplimientoGauge';

type ActivoResumen = {
  id: string;
  minimo_trimestral: number | null;
  clientes: { nombre: string; localidad: string | null; provincia: string | null } | null;
};

type ProspectoResumen = {
  id: string;
  creado_en: string;
  clientes: { nombre: string } | null;
};

function inicioTrimestreActual(): Date {
  const hoy = new Date();
  const inicioTrimestre = Math.floor(hoy.getMonth() / 3) * 3;
  return new Date(hoy.getFullYear(), inicioTrimestre, 1);
}

export default function InicioPage() {
  const [totalActivos, setTotalActivos] = useState(0);
  const [totalEnRiesgo, setTotalEnRiesgo] = useState(0);
  const [totalProspectos, setTotalProspectos] = useState(0);
  const [totalCerrados, setTotalCerrados] = useState(0);
  const [peorCumplimiento, setPeorCumplimiento] = useState<(ActivoResumen & { porcentaje: number })[]>([]);
  const [prospectosViejos, setProspectosViejos] = useState<ProspectoResumen[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      setCargando(true);

      const { count: countProspectos } = await supabase
        .from('puntos_troya')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['a_prospectar', 'propuesta_enviada']);
      setTotalProspectos(countProspectos ?? 0);

      const { count: countCerrados } = await supabase
        .from('puntos_troya')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'baja');
      setTotalCerrados(countCerrados ?? 0);

      const { data: activosData } = await supabase
        .from('puntos_troya')
        .select('id, minimo_trimestral, clientes(nombre, localidad, provincia)')
        .eq('estado', 'confirmado');

      const activos = (activosData as any as ActivoResumen[]) ?? [];
      setTotalActivos(activos.length);

      const inicioISO = inicioTrimestreActual().toISOString().slice(0, 10);
      const { data: comprasData } = await supabase
        .from('compras_mensuales')
        .select('punto_troya_id, monto')
        .gte('mes', inicioISO);

      const totales: Record<string, number> = {};
      (comprasData ?? []).forEach((c) => {
        totales[c.punto_troya_id] = (totales[c.punto_troya_id] ?? 0) + Number(c.monto);
      });

      const conPorcentaje = activos.map((a) => {
        const comprado = totales[a.id] ?? 0;
        const minimo = a.minimo_trimestral ?? 0;
        const porcentaje = minimo > 0 ? Math.round((comprado / minimo) * 100) : 0;
        return { ...a, porcentaje };
      });

      setTotalEnRiesgo(conPorcentaje.filter((a) => a.porcentaje < 100).length);
      setPeorCumplimiento(
        conPorcentaje
          .filter((a) => a.minimo_trimestral)
          .sort((a, b) => a.porcentaje - b.porcentaje)
          .slice(0, 5)
      );

      const { data: prospectosData } = await supabase
        .from('puntos_troya')
        .select('id, creado_en, clientes(nombre)')
        .in('estado', ['a_prospectar', 'propuesta_enviada'])
        .order('creado_en', { ascending: true })
        .limit(5);
      setProspectosViejos((prospectosData as any) ?? []);

      setCargando(false);
    }

    cargar();
  }, []);

  if (cargando) {
    return <p className="troya-subtitulo">Cargando...</p>;
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Inicio</h1>
          <p className="troya-subtitulo">Un vistazo rápido a cómo viene el programa</p>
        </div>
      </div>

      <div className="troya-stats">
        <Link href="/activos" className="troya-stat-card">
          <div className="troya-stat-numero">{totalActivos}</div>
          <div className="troya-stat-etiqueta">Puntos Troya activos</div>
        </Link>
        <Link href="/activos" className="troya-stat-card troya-stat-card--alerta">
          <div className="troya-stat-numero">{totalEnRiesgo}</div>
          <div className="troya-stat-etiqueta">No cumplen el mínimo este trimestre</div>
        </Link>
        <Link href="/prospectos" className="troya-stat-card">
          <div className="troya-stat-numero">{totalProspectos}</div>
          <div className="troya-stat-etiqueta">Propuestos (en seguimiento)</div>
        </Link>
        <Link href="/prospectos" className="troya-stat-card">
          <div className="troya-stat-numero">{totalCerrados}</div>
          <div className="troya-stat-etiqueta">Cerrados / Inactivos</div>
        </Link>
      </div>

      <div className="troya-seccion">
        <div className="troya-seccion-titulo">
          Peor cumplimiento este trimestre
          <Link href="/activos">Ver todos</Link>
        </div>

        {peorCumplimiento.length === 0 ? (
          <div className="troya-vacio">
            <h3>Nada para mostrar todavía</h3>
            <p>Cuando haya Puntos Troya con mínimo cargado, van a aparecer acá ordenados por cumplimiento.</p>
          </div>
        ) : (
          <div className="troya-lista">
            {peorCumplimiento.map((a) => (
              <Link key={a.id} href={`/activos/${a.id}`} className={`troya-card ${a.porcentaje >= 100 ? 'troya-card--activo' : 'troya-card--alerta'}`}>
                <div className="troya-card-info">
                  <h3>{a.clientes?.nombre}</h3>
                  <p>{[a.clientes?.localidad, a.clientes?.provincia].filter(Boolean).join(', ')}</p>
                </div>
                <CumplimientoGauge porcentaje={a.porcentaje} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="troya-seccion">
        <div className="troya-seccion-titulo">
          Propuestos más antiguos sin resolver
          <Link href="/prospectos">Ver todos</Link>
        </div>

        {prospectosViejos.length === 0 ? (
          <div className="troya-vacio">
            <h3>No hay propuestas pendientes</h3>
            <p>Todo lo que cargaste ya se confirmó o se dio de baja.</p>
          </div>
        ) : (
          <div className="troya-lista">
            {prospectosViejos.map((p) => (
              <div key={p.id} className="troya-card">
                <div className="troya-card-info">
                  <h3>{p.clientes?.nombre}</h3>
                  <p>Cargado el {new Date(p.creado_en).toLocaleDateString('es-AR')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}