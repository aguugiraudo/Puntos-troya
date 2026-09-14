'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ItemCatalogo = { id: string; nombre: string; puntos_requeridos: number; activo: boolean };

type SaldoCliente = {
  punto_troya_id: string;
  nombre: string;
  localidad: string | null;
  provincia: string | null;
  puntosGanados: number;
  puntosCanjeados: number;
  saldo: number;
};

export default function PuntosCanjePage() {
  const [montoPorPunto, setMontoPorPunto] = useState(100000);
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [montoEdit, setMontoEdit] = useState('');

  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [panelCatalogoAbierto, setPanelCatalogoAbierto] = useState(false);
  const [nombreItem, setNombreItem] = useState('');
  const [puntosItem, setPuntosItem] = useState('');
  const [editandoItemId, setEditandoItemId] = useState<string | null>(null);
  const [nombreItemEdit, setNombreItemEdit] = useState('');
  const [puntosItemEdit, setPuntosItemEdit] = useState('');

  const [saldos, setSaldos] = useState<SaldoCliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [canjeandoId, setCanjeandoId] = useState<string | null>(null);
  const [itemSeleccionado, setItemSeleccionado] = useState('');

  const [cargando, setCargando] = useState(true);

  async function cargarTodo() {
    setCargando(true);

    const { data: configData } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'monto_por_punto')
      .single();
    const monto = configData ? Number(configData.valor) : 100000;
    setMontoPorPunto(monto);

    const { data: catalogoData } = await supabase.from('catalogo_canje').select('*').order('puntos_requeridos');
    setCatalogo(catalogoData ?? []);

    const { data: puntosData } = await supabase
      .from('puntos_troya')
      .select('id, clientes(nombre, localidad, provincia)')
      .eq('estado', 'confirmado');

    const { data: comprasData } = await supabase.from('compras_mensuales').select('punto_troya_id, monto');
    const totalCompradoPorPunto: Record<string, number> = {};
    (comprasData ?? []).forEach((c) => {
      totalCompradoPorPunto[c.punto_troya_id] = (totalCompradoPorPunto[c.punto_troya_id] ?? 0) + Number(c.monto);
    });

    const { data: canjesData } = await supabase.from('canjes').select('punto_troya_id, puntos_utilizados');
    const canjeadoPorPunto: Record<string, number> = {};
    (canjesData ?? []).forEach((c) => {
      canjeadoPorPunto[c.punto_troya_id] = (canjeadoPorPunto[c.punto_troya_id] ?? 0) + c.puntos_utilizados;
    });

    const saldosCalculados: SaldoCliente[] = ((puntosData as any) ?? []).map((p: any) => {
      const totalComprado = totalCompradoPorPunto[p.id] ?? 0;
      const puntosGanados = monto > 0 ? Math.floor(totalComprado / monto) : 0;
      const puntosCanjeados = canjeadoPorPunto[p.id] ?? 0;
      return {
        punto_troya_id: p.id,
        nombre: p.clientes?.nombre ?? '',
        localidad: p.clientes?.localidad ?? null,
        provincia: p.clientes?.provincia ?? null,
        puntosGanados,
        puntosCanjeados,
        saldo: puntosGanados - puntosCanjeados,
      };
    });

    setSaldos(saldosCalculados);
    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  const saldosFiltrados = saldos.filter((s) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return [s.nombre, s.localidad, s.provincia].filter(Boolean).some((c) => c!.toLowerCase().includes(texto));
  });

  async function guardarConfig() {
    if (!montoEdit) return;
    const { error } = await supabase
      .from('configuracion')
      .update({ valor: montoEdit })
      .eq('clave', 'monto_por_punto');

    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }
    setEditandoConfig(false);
    cargarTodo();
  }

  async function agregarItemCatalogo(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreItem.trim() || !puntosItem) return;

    const { error } = await supabase.from('catalogo_canje').insert({
      nombre: nombreItem,
      puntos_requeridos: Number(puntosItem),
    });

    if (error) {
      alert('Error al crear: ' + error.message);
      return;
    }

    setNombreItem('');
    setPuntosItem('');
    setPanelCatalogoAbierto(false);
    cargarTodo();
  }

  function empezarEdicionItem(item: ItemCatalogo) {
    setEditandoItemId(item.id);
    setNombreItemEdit(item.nombre);
    setPuntosItemEdit(String(item.puntos_requeridos));
  }

  async function guardarItemEdit(id: string) {
    const { error } = await supabase
      .from('catalogo_canje')
      .update({ nombre: nombreItemEdit, puntos_requeridos: Number(puntosItemEdit) })
      .eq('id', id);

    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }
    setEditandoItemId(null);
    cargarTodo();
  }

  async function eliminarItemCatalogo(item: ItemCatalogo) {
    const confirmado = confirm(`¿Eliminar "${item.nombre}" del catálogo?`);
    if (!confirmado) return;

    const { error } = await supabase.from('catalogo_canje').delete().eq('id', item.id);
    if (error) {
      alert('No se pudo eliminar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  function empezarCanje(puntoTroyaId: string) {
    setCanjeandoId(puntoTroyaId);
    setItemSeleccionado('');
  }

  async function confirmarCanje(puntoTroyaId: string) {
    const item = catalogo.find((i) => i.id === itemSeleccionado);
    if (!item) return;

    const { error } = await supabase.from('canjes').insert({
      punto_troya_id: puntoTroyaId,
      catalogo_canje_id: item.id,
      nombre_producto: item.nombre,
      puntos_utilizados: item.puntos_requeridos,
    });

    if (error) {
      alert('Error al registrar el canje: ' + error.message);
      return;
    }

    setCanjeandoId(null);
    cargarTodo();
  }

  if (cargando) return <p className="troya-subtitulo">Cargando...</p>;

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Puntos y Canje</h1>
          <p className="troya-subtitulo">1 punto cada ${montoPorPunto.toLocaleString('es-AR')} comprados</p>
        </div>
      </div>

      {/* CONFIGURACIÓN */}
      <div className="troya-panel" style={{ marginBottom: 20 }}>
        <button
          className={`troya-panel-toggle ${editandoConfig ? 'abierto' : ''}`}
          onClick={() => {
            setEditandoConfig(!editandoConfig);
            setMontoEdit(String(montoPorPunto));
          }}
        >
          Editar relación de puntos
          <IconMas />
        </button>
        {editandoConfig && (
          <div className="troya-panel-body">
            <div className="troya-form">
              <input
                className="troya-input"
                type="number"
                value={montoEdit}
                onChange={(e) => setMontoEdit(e.target.value)}
                placeholder="Monto en pesos por 1 punto"
              />
              <button className="troya-btn" onClick={guardarConfig}>Guardar</button>
            </div>
          </div>
        )}
      </div>

      {/* CATÁLOGO DE CANJE */}
      <div className="troya-seccion">
        <div className="troya-seccion-titulo">Catálogo de canje</div>

        <div className="troya-panel">
          <button className={`troya-panel-toggle ${panelCatalogoAbierto ? 'abierto' : ''}`} onClick={() => setPanelCatalogoAbierto(!panelCatalogoAbierto)}>
            Nuevo producto canjeable
            <IconMas />
          </button>
          {panelCatalogoAbierto && (
            <div className="troya-panel-body">
              <form onSubmit={agregarItemCatalogo} className="troya-form">
                <input className="troya-input" placeholder="Nombre del producto" value={nombreItem} onChange={(e) => setNombreItem(e.target.value)} required />
                <input className="troya-input" type="number" placeholder="Puntos que vale" value={puntosItem} onChange={(e) => setPuntosItem(e.target.value)} required />
                <button type="submit" className="troya-btn">Agregar</button>
              </form>
            </div>
          )}
        </div>

        {catalogo.length === 0 ? (
          <div className="troya-vacio">
            <h3>Todavía no hay productos cargados</h3>
            <p>Agregá el primero desde &ldquo;Nuevo producto canjeable&rdquo;.</p>
          </div>
        ) : (
          <div className="troya-lista">
            {catalogo.map((item) =>
              editandoItemId === item.id ? (
                <div key={item.id} className="troya-card troya-card-editando">
                  <div className="troya-form">
                    <input className="troya-input" value={nombreItemEdit} onChange={(e) => setNombreItemEdit(e.target.value)} placeholder="Nombre" />
                    <input className="troya-input" type="number" value={puntosItemEdit} onChange={(e) => setPuntosItemEdit(e.target.value)} placeholder="Puntos" />
                  </div>
                  <div className="troya-card-acciones">
                    <button className="troya-btn" onClick={() => guardarItemEdit(item.id)}>Guardar</button>
                    <button className="troya-btn troya-btn-secundario" onClick={() => setEditandoItemId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="troya-card">
                  <div className="troya-card-info">
                    <h3>{item.nombre}</h3>
                    <p>{item.puntos_requeridos} puntos</p>
                  </div>
                  <div className="troya-card-acciones">
                    <button className="troya-icon-btn" onClick={() => empezarEdicionItem(item)} title="Editar">
                      <IconLapiz />
                    </button>
                    <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarItemCatalogo(item)} title="Eliminar">
                      <IconTacho />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* SALDO POR CLIENTE */}
      <div className="troya-seccion">
        <div className="troya-seccion-titulo">Saldo de puntos por cliente</div>

        <div className="troya-buscador">
          <IconBuscar />
          <input
            type="text"
            placeholder="Buscar por nombre, localidad o provincia..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {saldos.length === 0 ? (
          <div className="troya-vacio">
            <h3>Todavía no hay Puntos Troya confirmados</h3>
            <p>Cuando haya clientes activos con compras cargadas, su saldo va a aparecer acá.</p>
          </div>
        ) : saldosFiltrados.length === 0 ? (
          <div className="troya-vacio">
            <h3>No hay resultados para &ldquo;{busqueda}&rdquo;</h3>
          </div>
        ) : (
          <div className="troya-lista">
            {saldosFiltrados.map((s) =>
              canjeandoId === s.punto_troya_id ? (
                <div key={s.punto_troya_id} className="troya-card troya-card-editando">
                  <h3>{s.nombre}</h3>
                  <p className="troya-subtitulo" style={{ margin: 0 }}>Saldo disponible: {s.saldo} puntos</p>
                  <div className="troya-form">
                    <select className="troya-input" value={itemSeleccionado} onChange={(e) => setItemSeleccionado(e.target.value)}>
                      <option value="">Elegir producto...</option>
                      {catalogo
                        .filter((i) => i.activo && i.puntos_requeridos <= s.saldo)
                        .map((i) => (
                          <option key={i.id} value={i.id}>{i.nombre} — {i.puntos_requeridos} puntos</option>
                        ))}
                    </select>
                  </div>
                  <div className="troya-card-acciones">
                    <button className="troya-btn" disabled={!itemSeleccionado} onClick={() => confirmarCanje(s.punto_troya_id)}>Confirmar canje</button>
                    <button className="troya-btn troya-btn-secundario" onClick={() => setCanjeandoId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div key={s.punto_troya_id} className="troya-card">
                  <div className="troya-card-info">
                    <h3>{s.nombre}</h3>
                    <p>{[s.localidad, s.provincia].filter(Boolean).join(', ')}</p>
                  </div>
                  <div className="troya-card-derecha">
                    <div style={{ textAlign: 'right' }}>
                      <div className="troya-saldo-puntos">{s.saldo}</div>
                      <div className="troya-saldo-detalle">{s.puntosGanados} ganados · {s.puntosCanjeados} canjeados</div>
                    </div>
                    <div className="troya-card-acciones">
                      <button className="troya-btn troya-btn-secundario" onClick={() => empezarCanje(s.punto_troya_id)} disabled={s.saldo <= 0}>
                        Canjear
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IconMas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
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

function IconBuscar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}