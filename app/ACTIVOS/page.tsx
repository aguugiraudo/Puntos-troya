'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type PuntoTroya = {
  id: string;
  minimo_trimestral: number | null;
  exclusividad_zona: boolean;
  fecha_confirmacion: string | null;
  clientes: {
    nombre: string;
    localidad: string | null;
    provincia: string | null;
  } | null;
};

function inicioTrimestreActual(): Date {
  const hoy = new Date();
  const mesActual = hoy.getMonth(); // 0-11
  const inicioTrimestre = Math.floor(mesActual / 3) * 3;
  return new Date(hoy.getFullYear(), inicioTrimestre, 1);
}

export default function ActivosPage() {
  const [puntos, setPuntos] = useState<PuntoTroya[]>([]);
  const [comprasPorPunto, setComprasPorPunto] = useState<
    Record<string, number>
  >({});
  const [cargando, setCargando] = useState(true);

  async function cargarActivos() {
    setCargando(true);

    const { data: puntosData, error: errorPuntos } = await supabase
      .from('puntos_troya')
      .select(
        'id, minimo_trimestral, exclusividad_zona, fecha_confirmacion, clientes(nombre, localidad, provincia)'
      )
      .eq('estado', 'confirmado')
      .order('fecha_confirmacion', { ascending: false });

    if (errorPuntos) {
      console.error('Error cargando activos:', errorPuntos);
      setCargando(false);
      return;
    }

    setPuntos((puntosData as any) ?? []);

    const inicio = inicioTrimestreActual();
    const inicioISO = inicio.toISOString().slice(0, 10);

    const { data: comprasData, error: errorCompras } = await supabase
      .from('compras_mensuales')
      .select('punto_troya_id, monto')
      .gte('mes', inicioISO);

    if (errorCompras) {
      console.error('Error cargando compras:', errorCompras);
      setCargando(false);
      return;
    }

    const totales: Record<string, number> = {};
    (comprasData ?? []).forEach((c) => {
      totales[c.punto_troya_id] =
        (totales[c.punto_troya_id] ?? 0) + Number(c.monto);
    });

    setComprasPorPunto(totales);
    setCargando(false);
  }

  useEffect(() => {
    cargarActivos();
  }, []);

  return (
    <div>
      <h1>Puntos Troya Activos</h1>

      {cargando ? (
        <p>Cargando...</p>
      ) : puntos.length === 0 ? (
        <p>Todavía no hay Puntos Troya confirmados.</p>
      ) : (
        <table className="troya-tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Localidad</th>
              <th>Provincia</th>
              <th>Mínimo trimestral</th>
              <th>Comprado este trimestre</th>
              <th>Cumplimiento</th>
              <th>Exclusividad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => {
              const comprado = comprasPorPunto[p.id] ?? 0;
              const minimo = p.minimo_trimestral ?? 0;
              const cumple = minimo > 0 && comprado >= minimo;
              const porcentaje =
                minimo > 0
                  ? Math.min(100, Math.round((comprado / minimo) * 100))
                  : 0;

              return (
                <tr key={p.id}>
                  <td>{p.clientes?.nombre}</td>
                  <td>{p.clientes?.localidad}</td>
                  <td>{p.clientes?.provincia}</td>
                  <td>${minimo.toLocaleString('es-AR')}</td>
                  <td>${comprado.toLocaleString('es-AR')}</td>
                  <td>
                    <span
                      className={`troya-badge ${
                        cumple ? 'troya-badge-confirmado' : 'troya-badge-alerta'
                      }`}
                    >
                      {porcentaje}% {cumple ? '✓ Cumple' : ''}
                    </span>
                  </td>
                  <td>{p.exclusividad_zona ? 'Sí' : 'No'}</td>
                  <td>
                    <Link href={`/activos/${p.id}`}>Ver ficha</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
