'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const ORDEN_CATEGORIAS = ['Fogoneros', 'Accesorios Fogoneros', 'Hornos', 'Estufas'];

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

type ColumnasLista = { precio: boolean; completa: boolean; mp: boolean };

function ordenCategoria(categoria: string | null): number {
  if (!categoria) return 999;
  const idx = ORDEN_CATEGORIAS.indexOf(categoria);
  return idx === -1 ? 998 : idx;
}

function money(v: number | null | undefined) {
  return `$${(v ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function badgeRentabilidad(rentabilidad: number) {
  const color = rentabilidad < 0 ? 'var(--red)' : rentabilidad < 15 ? '#8A6D00' : '#2E7D32';
  const bg = rentabilidad < 0 ? 'var(--tint-red)' : rentabilidad < 15 ? '#FFF3CD' : '#E3F3E4';
  return (
    <span style={{ background: bg, color, padding: '2px 7px', borderRadius: 7, fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>
      {rentabilidad.toFixed(1)}%
    </span>
  );
}

function slugify(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'lista';
}

export default function CostosPreciosPage() {
  const { usuario } = useAuth();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [valorHoraGlobal, setValorHoraGlobal] = useState(0);
  const [valorHoraGlobalEdit, setValorHoraGlobalEdit] = useState('0');
  const [guardandoValorHora, setGuardandoValorHora] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  const [panelConfigAbierto, setPanelConfigAbierto] = useState(false);

  const [columnasPorLista, setColumnasPorLista] = useState<Record<string, ColumnasLista>>({});
  const [descuentosEdit, setDescuentosEdit] = useState<Record<string, string>>({});
  const [nombresEdit, setNombresEdit] = useState<Record<string, string>>({});
  const [nombreListaNueva, setNombreListaNueva] = useState('');
  const [descuentoListaNueva, setDescuentoListaNueva] = useState('');

  const [panelNuevoAbierto, setPanelNuevoAbierto] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [codigoNuevo, setCodigoNuevo] = useState('');
  const [categoriaNueva, setCategoriaNueva] = useState('');

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Partial<Producto>>({});

  const [historialAbiertoId, setHistorialAbiertoId] = useState<string | null>(null);
  const [historialPorProducto, setHistorialPorProducto] = useState<Record<string, HistorialItem[]>>({});

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
    const mapaNombres: Record<string, string> = {};
    setColumnasPorLista((prevCols) => {
      const nuevo: Record<string, ColumnasLista> = {};
      (listasData ?? []).forEach((l) => {
        mapaDescuentos[l.id] = String(l.descuento_porcentaje);
        mapaNombres[l.id] = l.nombre;
        nuevo[l.id] = prevCols[l.id] ?? { precio: false, completa: false, mp: false };
      });
      return nuevo;
    });
    setDescuentosEdit(mapaDescuentos);
    setNombresEdit(mapaNombres);

    const { data: configData } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'valor_hora_hombre_global')
      .maybeSingle();

    const valor = configData ? Number(configData.valor) : 0;
    setValorHoraGlobal(valor);
    setValorHoraGlobalEdit(String(valor));

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
    const nombreCat = p.categoria || 'Sin categoría';
    let grupo = grupos.find((g) => g.categoria === nombreCat);
    if (!grupo) {
      grupo = { categoria: nombreCat, items: [] };
      grupos.push(grupo);
    }
    grupo.items.push(p);
  });

  type ColActiva = { lista: ListaPrecio; tipo: 'precio' | 'completa' | 'mp' };
  const columnasActivas: ColActiva[] = [];
  listas.forEach((l) => {
    const cols = columnasPorLista[l.id];
    if (!cols) return;
    if (cols.precio) columnasActivas.push({ lista: l, tipo: 'precio' });
    if (cols.completa) columnasActivas.push({ lista: l, tipo: 'completa' });
    if (cols.mp) columnasActivas.push({ lista: l, tipo: 'mp' });
  });

  const totalColumnas = 6 + columnasActivas.length + 1;
  const cantidadListasVisibles = Object.values(columnasPorLista).filter((c) => c.precio || c.completa || c.mp).length;

  function toggleColumna(listaId: string, tipo: 'precio' | 'completa' | 'mp') {
    setColumnasPorLista((prev) => ({
      ...prev,
      [listaId]: { ...prev[listaId], [tipo]: !prev[listaId]?.[tipo] },
    }));
  }

  function calcular(costoMP: number | null, horas: number | null, valorHora: number | null, precioLista: number | null) {
    const mp = costoMP ?? 0;
    const h = horas ?? 0;
    const vh = valorHora ?? valorHoraGlobal;
    const manoObra = h * vh;
    const completo = mp + manoObra;
    return { manoObra, completo, precioLista: precioLista ?? 0 };
  }

  async function guardarValorHoraGlobal() {
    setGuardandoValorHora(true);
    const { error } = await supabase
      .from('configuracion')
      .upsert(
        { clave: 'valor_hora_hombre_global', valor: valorHoraGlobalEdit || '0', descripcion: 'Valor por hora de mano de obra usado por defecto si el producto no tiene uno propio' },
        { onConflict: 'clave' }
      );

    setGuardandoValorHora(false);

    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  async function guardarDescuentoLista(id: string, valor: string) {
    const { error } = await supabase.from('listas_precio').update({ descuento_porcentaje: Number(valor) || 0 }).eq('id', id);
    if (error) { alert('Error al guardar: ' + error.message); return; }
    cargarTodo();
  }

  async function guardarNombreLista(id: string, valor: string) {
    if (!valor.trim()) return;
    const { error } = await supabase.from('listas_precio').update({ nombre: valor.trim() }).eq('id', id);
    if (error) { alert('Error al guardar: ' + error.message); return; }
    cargarTodo();
  }

  async function crearLista(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreListaNueva.trim()) return;

    const codigoBase = slugify(nombreListaNueva);
    const codigoFinal = listas.some((l) => l.codigo === codigoBase) ? `${codigoBase}_${Date.now()}` : codigoBase;

    const { error } = await supabase.from('listas_precio').insert({
      codigo: codigoFinal,
      nombre: nombreListaNueva.trim(),
      descuento_porcentaje: Number(descuentoListaNueva) || 0,
      orden: listas.length + 1,
    });

    if (error) { alert('Error al crear la lista: ' + error.message); return; }

    setNombreListaNueva('');
    setDescuentoListaNueva('');
    cargarTodo();
  }

  async function eliminarLista(l: ListaPrecio) {
    const confirmado = confirm(`¿Eliminar la lista "${l.nombre}"?`);
    if (!confirmado) return;
    const { error } = await supabase.from('listas_precio').delete().eq('id', l.id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
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
    const errores: string[] = [];
    let creados = 0;
    let actualizados = 0;

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

      for (let i = 0; i < filas.length; i++) {
        const fila = filas[i];
        const nombreCrudo = buscarColumna(fila, ['producto', 'nombre', 'descripcion', 'descripción']);
        if (!nombreCrudo) continue;

        const nombre = String(nombreCrudo).trim();

        try {
          const codigoFila = buscarColumna(fila, ['codigo', 'código', 'cod']);
          const categoriaFila = buscarColumna(fila, ['categoria', 'categoría', 'rubro']);
          const costoMPFila = buscarColumna(fila, ['costo materia prima', 'materia prima', 'costo mp', 'reposicion_pesos', 'reposicion', 'reposición']);
          const horasFila = buscarColumna(fila, ['horas produccion', 'horas producción', 'horas', 'tiempo de produccion', 'tiempo de producción', 'm.o. en horas']);
          const valorHoraFila = buscarColumna(fila, ['valor hora hombre', 'valor hora', 'costo hora']);
          const precioListaFila = buscarColumna(fila, ['precio lista', 'precio', 'precio_l1', 'precio l1']);

          const existente = productos.find((p) => p.nombre.toLowerCase().trim() === nombre.toLowerCase());

          // Si la columna vino en el Excel, se usa ese valor. Si NO vino, se conserva
          // lo que el producto ya tenía cargado (en vez de pisarlo con 0/null).
          const costoMP = costoMPFila !== undefined ? Number(costoMPFila) || null : (existente?.costo_materia_prima ?? null);
          const horas = horasFila !== undefined ? Number(horasFila) || null : (existente?.horas_produccion ?? null);
          const valorHora = valorHoraFila !== undefined ? Number(valorHoraFila) || null : (existente?.valor_hora_hombre ?? null);
          const precioLista = precioListaFila !== undefined ? Number(precioListaFila) || null : (existente?.precio_lista ?? null);

          const { manoObra, completo } = calcular(costoMP, horas, valorHora, precioLista);

          let productoId: string;

          if (existente) {
            const { error: errorUpdate } = await supabase.from('productos').update({
              codigo: codigoFila !== undefined ? String(codigoFila) : existente.codigo,
              categoria: categoriaFila !== undefined ? String(categoriaFila) : existente.categoria,
              costo_materia_prima: costoMP,
              horas_produccion: horas,
              valor_hora_hombre: valorHora,
              costo_mano_obra: manoObra,
              costo_completo: completo,
              precio_lista: precioLista,
              actualizado_en: new Date().toISOString(),
            }).eq('id', existente.id);

            if (errorUpdate) throw new Error(errorUpdate.message);
            productoId = existente.id;
            actualizados++;
          } else {
            const { data: nuevo, error: errorInsert } = await supabase.from('productos').insert({
              nombre,
              codigo: codigoFila !== undefined ? String(codigoFila) : null,
              categoria: categoriaFila !== undefined ? String(categoriaFila) : null,
              costo_materia_prima: costoMP,
              horas_produccion: horas,
              valor_hora_hombre: valorHora,
              costo_mano_obra: manoObra,
              costo_completo: completo,
              precio_lista: precioLista,
              actualizado_en: new Date().toISOString(),
            }).select('id').single();

            if (errorInsert || !nuevo) throw new Error(errorInsert?.message ?? 'No se pudo crear el producto');
            productoId = nuevo.id;
            creados++;
          }

          const { error: errorHistorial } = await supabase.from('historial_costos').insert({
            producto_id: productoId,
            fecha: fechaImportacion,
            costo_materia_prima: costoMP,
            horas_produccion: horas,
            valor_hora_hombre: valorHora ?? valorHoraGlobal,
            costo_mano_obra: manoObra,
            costo_completo: completo,
            precio_lista: precioLista,
          });
          if (errorHistorial) throw new Error('Historial no guardado: ' + errorHistorial.message);
        } catch (errFila: any) {
          errores.push(`Fila ${i + 2} ("${nombre}"): ${errFila.message}`);
        }
      }

      let resumen = `Importación terminada: ${actualizados} actualizados, ${creados} nuevos.`;
      if (errores.length > 0) {
        resumen += `\n\n${errores.length} fila(s) con error:\n` + errores.slice(0, 10).join('\n');
        if (errores.length > 10) resumen += `\n...y ${errores.length - 10} más.`;
      }
      alert(resumen);

      setPanelImportarAbierto(false);
      cargarTodo();
    } catch (err: any) {
      alert('Error general al leer el archivo: ' + err.message);
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Costos y Precios</h1>
          <p className="troya-subtitulo">{productos.length} productos · {cantidadListasVisibles} lista(s) visible(s)</p>
        </div>
      </div>

      <div className="troya-panel" style={{ marginBottom: 14 }}>
        <button className={`troya-panel-toggle ${panelConfigAbierto ? 'abierto' : ''}`} onClick={() => setPanelConfigAbierto(!panelConfigAbierto)}>
          Configuración (valor hora, listas y columnas)
          <IconMas />
        </button>
        {panelConfigAbierto && (
          <div className="troya-panel-body">
            <div className="troya-form" style={{ marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                Valor hora-hombre general:
                <input
                  className="troya-input"
                  style={{ flex: '0 0 140px' }}
                  type="number"
                  value={valorHoraGlobalEdit}
                  onChange={(e) => setValorHoraGlobalEdit(e.target.value)}
                />
              </label>
              <button className="troya-btn" onClick={guardarValorHoraGlobal} disabled={guardandoValorHora}>
                {guardandoValorHora ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            <p className="troya-subtitulo" style={{ marginTop: 0, marginBottom: 16 }}>
              Valor actual guardado: ${valorHoraGlobal.toLocaleString('es-AR')}
            </p>

            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Listas de precio</p>
            <p className="troya-subtitulo" style={{ marginTop: 0, marginBottom: 10 }}>
              Tildá qué columnas mostrar por lista: precio, rentabilidad completa y/o rentabilidad sobre materia prima.
            </p>

            {listas.length === 0 ? (
              <p className="troya-subtitulo" style={{ marginBottom: 12 }}>Todavía no hay listas cargadas. Agregá la primera abajo.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {listas.map((l) => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                    <input
                      className="troya-input"
                      style={{ flex: '1 1 140px', padding: '7px 10px', fontSize: 13 }}
                      value={nombresEdit[l.id] ?? ''}
                      onChange={(e) => setNombresEdit({ ...nombresEdit, [l.id]: e.target.value })}
                      onBlur={(e) => guardarNombreLista(l.id, e.target.value)}
                    />
                    <input
                      className="troya-input"
                      style={{ width: 56, padding: '7px 8px', fontSize: 13 }}
                      type="number"
                      value={descuentosEdit[l.id] ?? ''}
                      onChange={(e) => setDescuentosEdit({ ...descuentosEdit, [l.id]: e.target.value })}
                      onBlur={(e) => guardarDescuentoLista(l.id, e.target.value)}
                    />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>%</span>

                    <span style={{ width: 1, height: 20, background: 'var(--line)' }} />

                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                      <input type="checkbox" checked={columnasPorLista[l.id]?.precio ?? false} onChange={() => toggleColumna(l.id, 'precio')} />
                      Precio
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                      <input type="checkbox" checked={columnasPorLista[l.id]?.completa ?? false} onChange={() => toggleColumna(l.id, 'completa')} />
                      Rent. Compl.
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                      <input type="checkbox" checked={columnasPorLista[l.id]?.mp ?? false} onChange={() => toggleColumna(l.id, 'mp')} />
                      Rent. MP
                    </label>

                    <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarLista(l)} title="Eliminar lista" style={{ width: 26, height: 26, marginLeft: 'auto' }}>
                      <IconTacho />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={crearLista} className="troya-form">
              <input className="troya-input" placeholder="Nombre de la nueva lista (ej: Lista B)" value={nombreListaNueva} onChange={(e) => setNombreListaNueva(e.target.value)} />
              <input className="troya-input" style={{ flex: '0 0 140px' }} type="number" placeholder="% descuento" value={descuentoListaNueva} onChange={(e) => setDescuentoListaNueva(e.target.value)} />
              <button type="submit" className="troya-btn">+ Agregar lista</button>
            </form>
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
              Reconoce: CODIGO, DESCRIPCION, Rubro, REPOSICION_PESOS (costo materia prima), PRECIO_L1 (precio de lista).
              Si una columna no viene en el archivo, se conserva el valor que ya tenía cargado ese producto (no se borra).
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

      <div className="troya-buscador">
        <IconBuscar />
        <input type="text" placeholder="Buscar por nombre o código..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      <div className="troya-panel" style={{ marginBottom: 20 }}>
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
        <p className="troya-subtitulo">Cargando...</p>
      ) : productosOrdenados.length === 0 ? (
        <div className="troya-vacio">
          <h3>No hay productos</h3>
          <p>Cargá uno manual o importá un Excel.</p>
        </div>
      ) : (
        <div className="troya-matriz-wrapper">
          <table className="troya-matriz-tabla troya-matriz-tabla--compacta">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>MP</th>
                <th>Hs</th>
                <th>Completo</th>
                <th>Lista</th>
                {columnasActivas.map((c, idx) => (
                  <th key={c.lista.id + c.tipo + idx}>
                    {c.tipo === 'precio' && `${c.lista.descuento_porcentaje}%`}
                    {c.tipo === 'completa' && `Compl. ${c.lista.descuento_porcentaje}%`}
                    {c.tipo === 'mp' && `MP ${c.lista.descuento_porcentaje}%`}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <>
                  <tr key={grupo.categoria}>
                    <td colSpan={totalColumnas} style={{ background: 'var(--tint-orange)', color: 'var(--orange)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {grupo.categoria}
                    </td>
                  </tr>
                  {grupo.items.map((p) => {
                    if (editandoId === p.id) {
                      return (
                        <tr key={p.id}>
                          <td colSpan={totalColumnas} style={{ background: 'var(--bg)' }}>
                            <div className="troya-form" style={{ paddingTop: 10 }}>
                              <input className="troya-input" value={borrador.nombre ?? ''} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} placeholder="Nombre" />
                              <input className="troya-input" value={borrador.codigo ?? ''} onChange={(e) => setBorrador({ ...borrador, codigo: e.target.value })} placeholder="Código" />
                              <select className="troya-input" value={borrador.categoria ?? ''} onChange={(e) => setBorrador({ ...borrador, categoria: e.target.value })}>
                                <option value="">Sin categoría</option>
                                {ORDEN_CATEGORIAS.map((c) => (<option key={c} value={c}>{c}</option>))}
                              </select>
                            </div>
                            <div className="troya-form">
                              <input className="troya-input" type="number" value={borrador.costo_materia_prima ?? ''} onChange={(e) => setBorrador({ ...borrador, costo_materia_prima: e.target.value ? Number(e.target.value) : null })} placeholder="Costo materia prima" />
                              <input className="troya-input" type="number" value={borrador.horas_produccion ?? ''} onChange={(e) => setBorrador({ ...borrador, horas_produccion: e.target.value ? Number(e.target.value) : null })} placeholder="Horas M.O." />
                              <input className="troya-input" type="number" value={borrador.valor_hora_hombre ?? ''} onChange={(e) => setBorrador({ ...borrador, valor_hora_hombre: e.target.value ? Number(e.target.value) : null })} placeholder={`Costo hora (vacío = ${valorHoraGlobal})`} />
                              <input className="troya-input" type="number" value={borrador.precio_lista ?? ''} onChange={(e) => setBorrador({ ...borrador, precio_lista: e.target.value ? Number(e.target.value) : null })} placeholder="Precio de lista" />
                            </div>
                            <div className="troya-card-acciones" style={{ paddingBottom: 10 }}>
                              <button className="troya-btn" onClick={() => guardarEdicion(p.id)}>Guardar cambios</button>
                              <button className="troya-btn troya-btn-secundario" onClick={() => { setEditandoId(null); setBorrador({}); }}>Cancelar</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <>
                        <tr key={p.id}>
                          <td>{p.codigo ?? '—'}</td>
                          <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                          <td>{money(p.costo_materia_prima)}</td>
                          <td>{p.horas_produccion ?? 0}</td>
                          <td>{money(p.costo_completo)}</td>
                          <td style={{ fontWeight: 700 }}>{money(p.precio_lista)}</td>
                          {columnasActivas.map((c, idx) => {
                            const precioVenta = (p.precio_lista ?? 0) * (1 - c.lista.descuento_porcentaje / 100);
                            if (c.tipo === 'precio') return <td key={c.lista.id + c.tipo + idx}>{money(precioVenta)}</td>;
                            if (c.tipo === 'completa') {
                              const rent = precioVenta > 0 ? ((precioVenta - (p.costo_completo ?? 0)) / precioVenta) * 100 : 0;
                              return <td key={c.lista.id + c.tipo + idx}>{badgeRentabilidad(rent)}</td>;
                            }
                            const rentMP = precioVenta > 0 ? ((precioVenta - (p.costo_materia_prima ?? 0)) / precioVenta) * 100 : 0;
                            return <td key={c.lista.id + c.tipo + idx}>{badgeRentabilidad(rentMP)}</td>;
                          })}
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="troya-icon-btn" onClick={() => verHistorial(p.id)} title="Ver historial" style={{ width: 26, height: 26 }}>
                                <IconHistorial />
                              </button>
                              <button className="troya-icon-btn" onClick={() => empezarEdicion(p)} title="Editar" style={{ width: 26, height: 26 }}>
                                <IconLapiz />
                              </button>
                              <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarProducto(p)} title="Eliminar" style={{ width: 26, height: 26 }}>
                                <IconTacho />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {historialAbiertoId === p.id && (
                          <tr key={p.id + '-hist'}>
                            <td colSpan={totalColumnas} style={{ background: 'var(--bg)' }}>
                              {!historialPorProducto[p.id] || historialPorProducto[p.id].length === 0 ? (
                                <p className="troya-subtitulo" style={{ margin: '8px 0' }}>Sin actualizaciones registradas todavía.</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
                                  {historialPorProducto[p.id].map((h) => (
                                    <div key={h.id} style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)' }}>
                                      <span style={{ fontWeight: 700, color: 'var(--ink)', minWidth: 80 }}>{new Date(h.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</span>
                                      <span>MP: {money(h.costo_materia_prima)}</span>
                                      <span>Completo: {money(h.costo_completo)}</span>
                                      <span>Precio: {money(h.precio_lista)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
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