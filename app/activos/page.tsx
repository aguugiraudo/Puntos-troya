'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import CumplimientoGauge from '@/components/CumplimientoGauge';

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

export default function ActivosPage() {
  const [puntos, setPuntos] = useState<PuntoTroya[]>([]);
  const [comprasPorPunto, setComprasPorPunto] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);

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

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Puntos Troya Activos</h1>
          <p className="troya-subtitulo">{puntos.length} confirmados</p>
        </div>
      </div>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : puntos.length === 0 ? (
        <div className="troya-vacio">
          <h3>Todavía no hay Puntos Troya confirmados</h3>
          <p>Cuando confirmes un prospecto, va a aparecer acá con su cumplimiento trimestral.</p>
        </div>
      ) : (
        <div className="troya-lista">
          {puntos.map((p) => {
            const comprado = comprasPorPunto[p.id] ?? 0;
            const minimo = p.minimo_trimestral ?? 0;
            const porcentaje = minimo > 0 ? Math.round((comprado / minimo) * 100) : 0;

            return (
              <Link key={p.id} href={`/activos/${p.id}`} className={`troya-card ${porcentaje >= 100 ? 'troya-card--activo' : 'troya-card--alerta'}`}>
                <div className="troya-card-info">
                  <h3>{p.clientes?.nombre}</h3>
                  <p>
                    {[p.clientes?.localidad, p.clientes?.provincia].filter(Boolean).join(', ')}
                    {p.exclusividad_zona ? ' · Exclusividad de zona' : ''}
                  </p>
                </div>
                <CumplimientoGauge porcentaje={porcentaje} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}