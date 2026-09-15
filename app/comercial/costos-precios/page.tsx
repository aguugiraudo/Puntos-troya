'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const ORDEN_CATEGORIAS = ['Fogonero', 'Accesorios Fogoneros', 'Horno', 'Estufas'];

type Producto = {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  costo_materia_prima: number | null;
  horas_produccion: number | null;
  valor_hora_hombre: number | null;
  costo_mano_obra: number | null;
  costo_completo: number | null;
  precio_lista: number | null;
  actualizado_en: string | null;
};

type ListaPrecio = { id: string; codigo: string; nombre: string; descuento_porcentaje: number; orden: number };

type HistorialItem = {
  id: string;
  fecha: string;
  costo_materia_prima: number | null;
  costo_completo: number | null;
  precio_lista: number | null;
};

function ordenCategoria(categoria: string | null): number {
  if (!categoria) return 999;
  const idx = ORDEN_CATEGORIAS.indexOf(categoria);
  return idx === -1 ? 998 : idx;
}

export default function CostosPreciosPage() {
  const { usuario } = useAuth();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [valorHoraGlobal, setValorHoraGlobal] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [baseRentabilidad, setBaseRentabilidad] = useState<'completo' | 'materia_prima'>('completo');

  const [panelNuevoAbierto, setPanelNuevoAbierto] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [codigoNuevo, setCodigoNuevo] = useState('');
  const [categoriaNueva, setCategoriaNueva] = useState('');

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Partial<Producto>>({});

  const [historialAbiertoId, setHistorialAbiertoId] = useState<string | null>(null);
  const [historialPorProducto, setHistorialPorProducto] = useState<Record<string, HistorialItem[]>>({});

  const [panelListasAbierto, setPanelListasAbierto] = useState(false);
  const [descuentosEdit, setDescuentosEdit] = useState<Record<string, string>>({});

  const [panelImportarAbierto, setPanelImportarAbierto] = useState(false);
  const [fechaImportacion, setFechaImportacion] = useState(() => new Date().toISOString().slice(0, 10));
  const [importando, setImportando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function cargarTodo() {
    setCargando(true);

    const { data: productosData } = await supabase.from('productos').select('*').order('nombre');
    setProductos(productosData ?? []);

    const { data: listasData } = await supabase.from('listas_precio').select('*').order('orden');
    setListas(listasData ?? []);
    const mapaDescuentos: Record<string, string> = {};
    (listasData ?? []).forEach((l) => { mapaDescuentos[l.id] = String(l.descuento_porcentaje); });
    setDescuentosEdit(mapaDescuentos);

    const { data: configData } = await supabase.from('configuracion').select('valor').eq('clave', 'valor_hora_hombre_global').single();
    setValorHoraGlobal(configData ? Number(configData.valor) : 0);

    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  if (!usuario?.es_dueno) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Costos y Precios es exclusivo del dueño.</p>
      </div>
    );
  }

  const productosFiltrados = productos.filter((p) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return p.nombre.toLowerCase().includes(texto) || (p.codigo ?? '').toLowerCase().includes(texto);
  });

  const productosOrdenados = [...productosFiltrados].sort((a, b) => {
    const oc = ordenCategoria(a.categoria) - ordenCategoria(b.categoria);
    if (oc !== 0) return oc;
    return a.nombre.localeCompare(b.nombre);
  });

  const grupos: { categoria: string; items: Producto[] }[] = [];
  productosOrdenados.forEach((p) => {
    const nombreCat = p.categoria && ORDEN_CATEGORIAS.includes(p.categoria) ? p.categoria : (p.categoria || 'Sin categoría');
    let grupo = grupos.find((g) => g.categoria === nombreCat);
    if (!grupo) {
      grupo = { categoria: nombreCat, items: [] };
      grupos.push(grupo);
    }
    grupo.items.push(p);
  });

  function calcular(costoMP: number | null, horas: number | null, valorHora: number | null, precioLista: number | null) {
    const mp = costoMP ?? 0;
    const h = horas ?? 0;
    const vh = valorHora ?? valorHoraGlobal;
    const manoObra = h * vh;
    const completo = mp + manoObra;
    return { manoObra, completo, precioLista: precioLista ?? 0 };
  }

  async function guardarValorHoraGlobal(valor: string) {
    const { error } = await supabase.from('configuracion').update({ valor }).eq('clave', 'valor_hora_hombre_global');
    if (error) { alert('Error al guardar: ' + error.message); return; }
    cargarTodo();
  }

  async function guardarDescuentoLista(id: string, valor: string) {
    const { error } = await supabase.from('listas_precio').update({ descuento_porcentaje: Number(valor) }).eq('id', id);
    if (error) { alert('Error al guardar: ' + error.message); return; }
    cargarTodo();
  }

  async function crearProducto(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreNuevo.trim()) return;
    const { error } = await supabase.from('productos').insert({
      nombre: nombreNuevo,
      codigo: codigoNuevo || null,
      categoria: categoriaNueva || null,
    });
    if (error) { alert('Error al crear: ' + error.message); return; }
    setNombreNuevo('');
    setCodigoNuevo('');
    setCategoriaNueva('');
    setPanelNuevoAbierto(false);
    cargarTodo();
  }

  function empezarEdicion(p: Producto) {
    setEditandoId(p.id);
    setBorrador(p);
  }

  async function guardarEdicion(id: string) {
    const costoMP = borrador.costo_materia_prima ?? null;
    const horas = borrador.horas_produccion ?? null;
    const valorHora = borrador.valor_hora_hombre ?? null;
    const precioLista = borrador.precio_lista ?? null;
    const { manoObra, completo } = calcular(costoMP, horas, valorHora, precioLista);

    const { error } = await supabase
      .from('productos')
      .update({
        nombre: borrador.nombre,
        codigo: borrador.codigo ?? null,
        categoria: borrador.categoria ?? null,
        costo_materia_prima: costoMP,
        horas_produccion: horas,
        valor_hora_hombre: valorHora,
        costo_mano_obra: manoObra,
        costo_completo: completo,
        precio_lista: precioLista,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) { alert('Error al guardar: ' + error.message); return; }

    await supabase.from('historial_costos').insert({
      producto_id: id,
      fecha: new Date().toISOString().slice(0, 10),
      costo_materia_prima: costoMP,
      horas_produccion: horas,
      valor_hora_hombre: valorHora ?? valorHoraGlobal,
      costo_mano_obra: manoObra,
      costo_completo: completo,
      precio_lista: precioLista,
    });

    setEditandoId(null);
    setBorrador({});
    cargarTodo();
  }

  async function eliminarProducto(p: Producto) {
    const confirmado = confirm(`¿Eliminar "${p.nombre}"? Se borra también su historial de costos.`);
    if (!confirmado) return;
    const { error } = await supabase.from('productos').delete().eq('id', p.id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    cargarTodo();
  }

  async function verHistorial(productoId: string) {
    if (historialAbiertoId === productoId) {
      setHistorialAbiertoId(null);
      return;
    }
    setHistorialAbiertoId(productoId);
    if (!historialPorProducto[productoId]) {
      const { data } = await supabase
        .from('historial_costos')
        .select('id, fecha, costo_materia_prima, costo_completo, precio_lista')
        .eq('producto_id', productoId)
        .order('fecha', { ascending: false });
      setHistorialPorProducto((prev) => ({ ...prev, [productoId]: data ?? [] }));
    }
  }

  async function procesarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportando(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const hoja = workbook.Sheets[workbook.SheetNames[0]];
      const filas: any[] = XLSX.utils.sheet_to_json(hoja);

      const buscarColumna = (fila: any, posibles: string[]) => {
        const claves = Object.keys(fila);
        for (const posible of posibles) {
          const encontrada = claves.find((k) => k.toLowerCase().trim() === posible);
          if (encontrada) return fila[encontrada];
        }
        return undefined;
      };

      let creados = 0;
      let actualizados = 0;

      for (const fila of filas) {
        const nombre = buscarColumna(fila, ['producto', 'nombre']);
        if (!nombre) continue;

        const codigo = buscarColumna(fila, ['codigo', 'código', 'cod']);
        const categoria = buscarColumna(fila, ['categoria', 'categoría']);
        const costoMP = Number(buscarColumna(fila, ['costo materia prima', 'materia prima', 'costo mp']) ?? 0) || null;
        const horas = Number(buscarColumna(fila, ['horas produccion', 'horas producción', 'horas', 'tiempo de produccion', 'tiempo de producción']) ?? 0) || null;
        const valorHoraFila = buscarColumna(fila, ['valor hora hombre', 'valor hora', 'costo hora']);
        const valorHora = valorHoraFila ? Number(valorHoraFila) : null;
        const precioLista = Number(buscarColumna(fila, ['precio lista', 'precio']) ?? 0) || null;

        const { manoObra, completo } = calcular(costoMP, horas, valorHora, precioLista);

        const existente = productos.find((p) => p.nombre.toLowerCase().trim() === String(nombre).toLowerCase().trim());

        let productoId: string;

        if (existente) {
          await supabase.from('productos').update({
            codigo: codigo ? String(codigo) : existente.codigo,
            categoria: categoria ? String(categoria) : existente.categoria,
            costo_materia_prima: costoMP,
            horas_produccion: horas,
            valor_hora_hombre: valorHora,
            costo_mano_obra: manoObra,
            costo_completo: completo,
            precio_lista: precioLista,
            actualizado_en: new Date().toISOString(),
          }).eq('id', existente.id);
          productoId = existente.id;
          actualizados++;
        } else {
          const { data: nuevo } = await supabase.from('productos').insert({
            nombre: String(nombre),
            codigo: codigo ? String(codigo) : null,
            categoria: categoria ? String(categoria) : null,
            costo_materia_prima: costoMP,
            horas_produccion: horas,
            valor_hora_hombre: valorHora,
            costo_mano_obra: manoObra,
            costo_completo: completo,
            precio_lista: precioLista,
            actualizado_en: new Date().toISOString(),
          }).select('id').single();
          productoId = nuevo!.id;
          creados++;
        }

        await supabase.from('historial_costos').insert({
          producto_id: productoId,
          fecha: fechaImportacion,
          costo_materia_prima: costoMP,
          horas_produccion: horas,
          valor_hora_hombre: valorHora ?? valorHoraGlobal,
          costo_mano_obra: manoObra,
          costo_completo: completo,
          precio_lista: precioLista,
        });
      }

      alert(`Importación completa: ${actualizados} productos actualizados, ${creados} nuevos.`);
      setPanelImportarAbierto(false);
      cargarTodo();
    } catch (err: any) {
      alert('Error al leer el archivo: ' + err.message);
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function filaProducto(p: Producto) {
    if (editandoId === p.id) {
      return (
        <div key={p.id} className="troya-card troya-card-editando">
          <div className="troya-form">
            <input className="troya-input" value={borrador.nombre ?? ''} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} placeholder="Nombre" />
            <input className="troya-input" value={borrador.codigo ?? ''} onChange={(e) => setBorrador({ ...borrador, codigo: e.target.value })} placeholder="Código" />
            <select className="troya-input" value={borrador.categoria ?? ''} onChange={(e) => setBorrador({ ...borrador, categoria: e.target.value })}>
              <option value="">Sin categoría</option>
              {ORDEN_CATEGORIAS.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="troya-form">
            <input className="troya-input" type="number" value={borrador.costo_materia_prima ?? ''} onChange={(e) => setBorrador({ ...borrador, costo_materia_prima: e.target.value ? Number(e.target.value) : null })} placeholder="Costo materia prima" />
            <input className="troya-input" type="number" value={borrador.horas_produccion ?? ''} onChange={(e) => setBorrador({ ...borrador, horas_produccion: e.target.value ? Number(e.target.value) : null })} placeholder="Tiempo de producción (hs)" />
            <input className="troya-input" type="number" value={borrador.valor_hora_hombre ?? ''} onChange={(e) => setBorrador({ ...borrador, valor_hora_hombre: e.target.value ? Number(e.target.value) : null })} placeholder={`Costo hora (vacío = general: ${valorHoraGlobal})`} />
            <input className="troya-input" type="number" value={borrador.precio_lista ?? ''} onChange={(e) => setBorrador({ ...borrador, precio_lista: e.target.value ? Number(e.target.value) : null })} placeholder="Precio de lista" />
          </div>
          <div className="troya-card-acciones">
            <button className="troya-btn" onClick={() => guardarEdicion(p.id)}>Guardar cambios</button>
            <button className="troya-btn troya-btn-secundario" onClick={() => { setEditandoId(null); setBorrador({}); }}>Cancelar</button>
          </div>
        </div>
      );
    }

    const costoBase = baseRentabilidad === 'completo' ? (p.costo_completo ?? 0) : (p.costo_materia_prima ?? 0);

    return (
      <div key={p.id} className="troya-card troya-card-editando">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', flexWrap: 'wrap', gap: 10 }}>
          <div className="troya-card-info">
            <h3>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</h3>
            <p>
              MP: ${(p.costo_materia_prima ?? 0).toLocaleString('es-AR')} · {p.horas_produccion ?? 0} hs · Costo hora: ${(p.valor_hora_hombre ?? valorHoraGlobal).toLocaleString('es-AR')} · M.O.: ${(p.costo_mano_obra ?? 0).toLocaleString('es-AR')} · Completo: ${(p.costo_completo ?? 0).toLocaleString('es-AR')} · Precio lista: ${(p.precio_lista ?? 0).toLocaleString('es-AR')}
            </p>
          </div>
          <div className="troya-card-acciones">
            <button className="troya-icon-btn" onClick={() => verHistorial(p.id)} title="Ver historial">
              <IconHistorial />
            </button>
            <button className="troya-icon-btn" onClick={() => empezarEdicion(p)} title="Editar">
              <IconLapiz />
            </button>
            <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarProducto(p)} title="Eliminar">
              <IconTacho />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          {listas.map((l) => {
            const precioVenta = (p.precio_lista ?? 0) * (1 - l.descuento_porcentaje / 100);
            const rentabilidad = precioVenta > 0 ? ((precioVenta - costoBase) / precioVenta) * 100 : 0;
            const color = rentabilidad < 0 ? 'var(--red)' : rentabilidad < 15 ? 'var(--amber)' : 'var(--orange)';
            return (
              <div key={l.id} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 14px', minWidth: 120 }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textTransform: 'uppercase' }}>{l.nombre} (-{l.descuento_porcentaje}%)</p>
                <p style={{ fontSize: 13, margin: '2px 0 0', fontWeight: 600 }}>${precioVenta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color, margin: 0, fontFamily: 'var(--font-display)' }}>{rentabilidad.toFixed(1)}%</p>
              </div>
            );
          })}
        </div>

        {historialAbiertoId === p.id && (
          <div style={{ marginTop: 10, width: '100%' }}>
            {!historialPorProducto[p.id] || historialPorProducto[p.id].length === 0 ? (
              <p className="troya-subtitulo">Sin actualizaciones registradas todavía.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {historialPorProducto[p.id].map((h) => (
                  <div key={h.id} style={{ display: 'flex', gap: 14, fontSize: 12.5, color: 'var(--muted)', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: 'var(--ink)', minWidth: 80 }}>{new Date(h.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</span>
                    <span>MP: ${(h.costo_materia_prima ?? 0).toLocaleString('es-AR')}</span>
                    <span>Completo: ${(h.costo_completo ?? 0).toLocaleString('es-AR')}</span>
                    <span>Precio: ${(h.precio_lista ?? 0).toLocaleString('es-AR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Costos y Precios</h1>
          <p className="troya-subtitulo">{productos.length} productos</p>
        </div>
      </div>

      <div className="troya-panel" style={{ marginBottom: 14 }}>
        <div className="troya-panel-body" style={{ borderTop: 'none', paddingTop: 16 }}>
          <div className="troya-form">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              Valor hora-hombre general:
              <input className="troya-input" style={{ flex: '0 0 140px' }} type="number" defaultValue={valorHoraGlobal} onBlur={(e) => guardarValorHoraGlobal(e.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className="troya-panel" style={{ marginBottom: 14 }}>
        <button className={`troya-panel-toggle ${panelListasAbierto ? 'abierto' : ''}`} onClick={() => setPanelListasAbierto(!panelListasAbierto)}>
          Descuentos por lista de precio
          <IconMas />
        </button>
        {panelListasAbierto && (
          <div className="troya-panel-body">
            <div className="troya-form">
              {listas.map((l) => (
                <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  {l.nombre}:
                  <input
                    className="troya-input"
                    style={{ flex: '0 0 90px' }}
                    type="number"
                    value={descuentosEdit[l.id] ?? ''}
                    onChange={(e) => setDescuentosEdit({ ...descuentosEdit, [l.id]: e.target.value })}
                    onBlur={(e) => guardarDescuentoLista(l.id, e.target.value)}
                  />
                  %
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="troya-panel" style={{ marginBottom: 20 }}>
        <button className={`troya-panel-toggle ${panelImportarAbierto ? 'abierto' : ''}`} onClick={() => setPanelImportarAbierto(!panelImportarAbierto)}>
          Importar actualización desde Excel
          <IconMas />
        </button>
        {panelImportarAbierto && (
          <div className="troya-panel-body">
            <p className="troya-subtitulo" style={{ marginTop: 0, marginBottom: 10 }}>
              Columnas esperadas: Producto, Código, Categoría, Costo Materia Prima, Tiempo de Producción (hs), Costo Hora (opcional), Precio Lista.
              Si el producto ya existe (por nombre), se actualiza; si no, se crea.
            </p>
            <div className="troya-form">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                Fecha de esta actualización:
                <input className="troya-input" style={{ flex: '0 0 160px' }} type="date" value={fechaImportacion} onChange={(e) => setFechaImportacion(e.target.value)} />
              </label>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={procesarArchivo} disabled={importando} style={{ marginTop: 10 }} />
            {importando && <p className="troya-subtitulo">Importando...</p>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="troya-buscador" style={{ marginBottom: 0, flex: 1 }}>
          <IconBuscar />
          <input type="text" placeholder="Buscar por nombre o código..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="troya-btn" style={baseRentabilidad === 'completo' ? {} : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }} onClick={() => setBaseRentabilidad('completo')}>
            Sobre costo completo
          </button>
          <button className="troya-btn" style={baseRentabilidad === 'materia_prima' ? {} : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }} onClick={() => setBaseRentabilidad('materia_prima')}>
            Solo materia prima
          </button>
        </div>
      </div>

      <div className="troya-panel">
        <button className={`troya-panel-toggle ${panelNuevoAbierto ? 'abierto' : ''}`} onClick={() => setPanelNuevoAbierto(!panelNuevoAbierto)}>
          Nuevo producto
          <IconMas />
        </button>
        {panelNuevoAbierto && (
          <div className="troya-panel-body">
            <form onSubmit={crearProducto} className="troya-form">
              <input className="troya-input" placeholder="Nombre" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} required />
              <input className="troya-input" placeholder="Código" value={codigoNuevo} onChange={(e) => setCodigoNuevo(e.target.value)} />
              <select className="troya-input" value={categoriaNueva} onChange={(e) => setCategoriaNueva(e.target.value)}>
                <option value="">Sin categoría</option>
                {ORDEN_CATEGORIAS.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
              <button type="submit" className="troya-btn">Crear</button>
            </form>
          </div>
        )}
      </div>

      {cargando ? (
        <p className="troya-subtitulo" style={{ marginTop: 16 }}>Cargando...</p>
      ) : productosOrdenados.length === 0 ? (
        <div className="troya-vacio" style={{ marginTop: 16 }}>
          <h3>No hay productos</h3>
          <p>Cargá uno manual o importá un Excel.</p>
        </div>
      ) : (
        grupos.map((grupo) => (
          <div key={grupo.categoria} className="troya-seccion">
            <div className="troya-seccion-titulo">{grupo.categoria}</div>
            <div className="troya-lista">
              {grupo.items.map((p) => filaProducto(p))}
            </div>
          </div>
        ))
      )}
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
function IconBuscar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
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
function IconHistorial() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 109-9" />
      <path d="M3 3v6h6" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}