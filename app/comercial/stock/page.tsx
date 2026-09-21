'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const ORDEN_CATEGORIAS = ['Fogoneros', 'Accesorios Fogoneros', 'Hornos', 'Estufas'];

type FilaStock = {
  id: string;
  producto_id: string;
  stock_centro_logistico: number | null;
  stock_rafaela: number | null;
  stock_transito_centro: number | null;
  stock_transito_rafaela: number | null;
  stock_total: number | null;
  actualizado_en: string | null;
  productos: {
    nombre: string;
    codigo: string | null;
    categoria: string | null;
    precio_lista: number | null;
  } | null;
};

type ProductoLite = { id: string; codigo: string | null; nombre: string };

function ordenCategoria(categoria: string | null): number {
  if (!categoria) return 999;
  const idx = ORDEN_CATEGORIAS.indexOf(categoria);
  return idx === -1 ? 998 : idx;
}

function money(v: number | null | undefined) {
  return `$${(v ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function numero(v: number | null | undefined) {
  return (v ?? 0).toLocaleString('es-AR');
}

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export default function StockPage() {
  const { usuario } = useAuth();

  const [filas, setFilas] = useState<FilaStock[]>([]);
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [descuento, setDescuento] = useState(0);
  const [descuentoEdit, setDescuentoEdit] = useState('0');
  const [guardandoDescuento, setGuardandoDescuento] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  const [mostrarCentro, setMostrarCentro] = useState(false);
  const [mostrarRafaela, setMostrarRafaela] = useState(false);
  const [mostrarTransitoCentro, setMostrarTransitoCentro] = useState(false);
  const [mostrarTransitoRafaela, setMostrarTransitoRafaela] = useState(false);

  const [panelConfigAbierto, setPanelConfigAbierto] = useState(false);
  const [panelImportarAbierto, setPanelImportarAbierto] = useState(false);
  const [importando, setImportando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function cargarTodo() {
    setCargando(true);

    const { data: productosData } = await supabase.from('productos').select('id, codigo, nombre');
    setProductos(productosData ?? []);

    const { data: stockData } = await supabase
      .from('stock')
      .select('*, productos(nombre, codigo, categoria, precio_lista)');
    setFilas((stockData as any) ?? []);

    const { data: configData } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'descuento_valorizacion_stock')
      .maybeSingle();
    const valor = configData ? Number(configData.valor) : 0;
    setDescuento(valor);
    setDescuentoEdit(String(valor));

    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  if (!usuario?.es_dueno) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Stock es exclusivo del dueño.</p>
      </div>
    );
  }

  const filasFiltradas = filas.filter((f) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return (
      (f.productos?.nombre ?? '').toLowerCase().includes(texto) ||
      (f.productos?.codigo ?? '').toLowerCase().includes(texto)
    );
  });

  const filasOrdenadas = [...filasFiltradas].sort((a, b) => {
    const oc = ordenCategoria(a.productos?.categoria ?? null) - ordenCategoria(b.productos?.categoria ?? null);
    if (oc !== 0) return oc;
    return (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? '');
  });

  const grupos: { categoria: string; items: FilaStock[] }[] = [];
  filasOrdenadas.forEach((f) => {
    const nombreCat = f.productos?.categoria || 'Sin categoría';
    let grupo = grupos.find((g) => g.categoria === nombreCat);
    if (!grupo) {
      grupo = { categoria: nombreCat, items: [] };
      grupos.push(grupo);
    }
    grupo.items.push(f);
  });

  const valorTotalGeneral = filas.reduce((acc, f) => {
    const precioLista = f.productos?.precio_lista ?? 0;
    const precioUnit = precioLista * (1 - descuento / 100);
    return acc + precioUnit * (f.stock_total ?? 0);
  }, 0);

  const columnasExtra = (mostrarCentro ? 1 : 0) + (mostrarRafaela ? 1 : 0) + (mostrarTransitoCentro ? 1 : 0) + (mostrarTransitoRafaela ? 1 : 0);

  async function guardarDescuento() {
    setGuardandoDescuento(true);
    const { error } = await supabase
      .from('configuracion')
      .upsert(
        { clave: 'descuento_valorizacion_stock', valor: descuentoEdit || '0', descripcion: 'Descuento aplicado sobre el precio de lista para valorizar el stock' },
        { onConflict: 'clave' }
      );
    setGuardandoDescuento(false);
    if (error) { alert('Error al guardar: ' + error.message); return; }
    cargarTodo();
  }

  async function procesarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportando(true);
    const noEncontrados: string[] = [];
    let actualizados = 0;

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const hoja = workbook.Sheets[workbook.SheetNames[0]];
      const filasCrudas: any[][] = XLSX.utils.sheet_to_json(hoja, { header: 1 });

      let indiceHeader = -1;
      let mapaColumnas: Record<string, number> = {};

      for (let i = 0; i < filasCrudas.length; i++) {
        const fila = filasCrudas[i];
        if (!fila) continue;
        const normalizada = fila.map((c) => (c != null ? normalizar(String(c)) : ''));
        const tieneCodigo = normalizada.some((c) => c.includes('cod'));
        const tieneDescripcion = normalizada.some((c) => c.includes('descrip'));
        if (tieneCodigo && tieneDescripcion) {
          indiceHeader = i;
          normalizada.forEach((c, idx) => {
            if (!c) return;
            if (c.includes('total')) mapaColumnas.total = idx;
            else if (c.includes('transito') && c.includes('rafaela')) mapaColumnas.transitoRafaela = idx;
            else if (c.includes('transito')) mapaColumnas.transitoCentro = idx;
            else if (c.includes('rafaela')) mapaColumnas.rafaela = idx;
            else if (c.includes('centro') || c.includes('logistic')) mapaColumnas.centro = idx;
            else if (c.includes('cod')) mapaColumnas.codigo = idx;
            else if (c.includes('descrip')) mapaColumnas.descripcion = idx;
          });
          break;
        }
      }

      if (indiceHeader === -1 || mapaColumnas.codigo === undefined) {
        throw new Error('No se encontró una fila de encabezados con columna de Código. Verificá el archivo.');
      }

      for (let i = indiceHeader + 1; i < filasCrudas.length; i++) {
        const fila = filasCrudas[i];
        if (!fila) continue;

        const codigoCrudo = fila[mapaColumnas.codigo];
        if (codigoCrudo === undefined || codigoCrudo === null || String(codigoCrudo).trim() === '') continue;

        const codigo = String(codigoCrudo).trim();
        const producto = productos.find((p) => (p.codigo ?? '').trim() === codigo);

        if (!producto) {
          noEncontrados.push(codigo);
          continue;
        }

        const leerNum = (idx: number | undefined) => {
          if (idx === undefined) return 0;
          const v = fila[idx];
          return v === undefined || v === null || v === '' ? 0 : Number(v) || 0;
        };

        const { error } = await supabase.from('stock').upsert(
          {
            producto_id: producto.id,
            stock_centro_logistico: leerNum(mapaColumnas.centro),
            stock_rafaela: leerNum(mapaColumnas.rafaela),
            stock_transito_centro: leerNum(mapaColumnas.transitoCentro),
            stock_transito_rafaela: leerNum(mapaColumnas.transitoRafaela),
            stock_total: leerNum(mapaColumnas.total),
            actualizado_en: new Date().toISOString(),
          },
          { onConflict: 'producto_id' }
        );

        if (!error) actualizados++;
      }

      let resumen = `Stock actualizado: ${actualizados} productos.`;
      if (noEncontrados.length > 0) {
        resumen += `\n\n${noEncontrados.length} código(s) del Excel no están en tu catálogo comercial (se ignoraron, no se crearon):\n` + noEncontrados.slice(0, 15).join(', ');
        if (noEncontrados.length > 15) resumen += `... y ${noEncontrados.length - 15} más.`;
      }
      alert(resumen);

      setPanelImportarAbierto(false);
      cargarTodo();
    } catch (err: any) {
      alert('Error al leer el archivo: ' + err.message);
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Stock</h1>
          <p className="troya-subtitulo">{filas.length} productos con stock cargado · Valor total: {money(valorTotalGeneral)}</p>
        </div>
      </div>

      <div className="troya-panel" style={{ marginBottom: 14 }}>
        <button className={`troya-panel-toggle ${panelConfigAbierto ? 'abierto' : ''}`} onClick={() => setPanelConfigAbierto(!panelConfigAbierto)}>
          Configuración (descuento y columnas por depósito)
          <IconMas />
        </button>
        {panelConfigAbierto && (
          <div className="troya-panel-body">
            <div className="troya-form" style={{ marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                Descuento sobre precio de lista:
                <input
                  className="troya-input"
                  style={{ flex: '0 0 100px' }}
                  type="number"
                  value={descuentoEdit}
                  onChange={(e) => setDescuentoEdit(e.target.value)}
                />
                %
              </label>
              <button className="troya-btn" onClick={guardarDescuento} disabled={guardandoDescuento}>
                {guardandoDescuento ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            <p className="troya-subtitulo" style={{ marginTop: 0, marginBottom: 16 }}>
              Descuento actual guardado: {descuento}%. El precio unitario se calcula solo (precio de lista − este descuento).
            </p>

            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Columnas por depósito a mostrar</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                <input type="checkbox" checked={mostrarCentro} onChange={(e) => setMostrarCentro(e.target.checked)} />
                Centro Logístico
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                <input type="checkbox" checked={mostrarRafaela} onChange={(e) => setMostrarRafaela(e.target.checked)} />
                Rafaela
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                <input type="checkbox" checked={mostrarTransitoCentro} onChange={(e) => setMostrarTransitoCentro(e.target.checked)} />
                Tránsito Centro Logístico
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                <input type="checkbox" checked={mostrarTransitoRafaela} onChange={(e) => setMostrarTransitoRafaela(e.target.checked)} />
                Tránsito Rafaela
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="troya-panel" style={{ marginBottom: 20 }}>
        <button className={`troya-panel-toggle ${panelImportarAbierto ? 'abierto' : ''}`} onClick={() => setPanelImportarAbierto(!panelImportarAbierto)}>
          Importar stock desde Excel
          <IconMas />
        </button>
        {panelImportarAbierto && (
          <div className="troya-panel-body">
            <p className="troya-subtitulo" style={{ marginTop: 0, marginBottom: 10 }}>
              Reconoce columnas de Código, Descripción, Centro Logístico, Rafaela, tránsitos y Total general. Solo actualiza productos que ya existen en tu catálogo comercial (por código) — no crea productos nuevos.
            </p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={procesarArchivo} disabled={importando} />
            {importando && <p className="troya-subtitulo">Importando...</p>}
          </div>
        )}
      </div>

      <div className="troya-buscador">
        <IconBuscar />
        <input type="text" placeholder="Buscar por nombre o código..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {cargando ? (
        <p className="troya-subtitulo">Cargando...</p>
      ) : filasOrdenadas.length === 0 ? (
        <div className="troya-vacio">
          <h3>Todavía no hay stock cargado</h3>
          <p>Importá tu Excel desde el panel de arriba.</p>
        </div>
      ) : (
        <div className="troya-matriz-wrapper">
          <table className="troya-matriz-tabla troya-matriz-tabla--compacta">
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '9%' }} />
              {mostrarCentro && <col style={{ width: '9%' }} />}
              {mostrarRafaela && <col style={{ width: '9%' }} />}
              {mostrarTransitoCentro && <col style={{ width: '9%' }} />}
              {mostrarTransitoRafaela && <col style={{ width: '9%' }} />}
              <col style={{ width: '11%' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Stock total</th>
                {mostrarCentro && <th>Centro Log.</th>}
                {mostrarRafaela && <th>Rafaela</th>}
                {mostrarTransitoCentro && <th>Tráns. Centro</th>}
                {mostrarTransitoRafaela && <th>Tráns. Rafaela</th>}
                <th>Precio unit.</th>
                <th>Valor total</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <>
                  <tr key={grupo.categoria}>
                    <td
                      colSpan={5 + columnasExtra}
                      style={{ background: 'var(--tint-orange)', color: 'var(--orange)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}
                    >
                      {grupo.categoria}
                    </td>
                  </tr>
                  {grupo.items.map((f) => {
                    const precioLista = f.productos?.precio_lista ?? 0;
                    const precioUnit = precioLista * (1 - descuento / 100);
                    const valorTotal = precioUnit * (f.stock_total ?? 0);
                    return (
                      <tr key={f.id}>
                        <td>{f.productos?.codigo ?? '—'}</td>
                        <td className="troya-celda-producto" style={{ fontWeight: 600 }} title={f.productos?.nombre}>
                          {f.productos?.nombre}
                        </td>
                        <td style={{ fontWeight: 700 }}>{numero(f.stock_total)}</td>
                        {mostrarCentro && <td>{numero(f.stock_centro_logistico)}</td>}
                        {mostrarRafaela && <td>{numero(f.stock_rafaela)}</td>}
                        {mostrarTransitoCentro && <td>{numero(f.stock_transito_centro)}</td>}
                        {mostrarTransitoRafaela && <td>{numero(f.stock_transito_rafaela)}</td>}
                        <td>{money(precioUnit)}</td>
                        <td style={{ fontWeight: 700 }}>{money(valorTotal)}</td>
                      </tr>
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