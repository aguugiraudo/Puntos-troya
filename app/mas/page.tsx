'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const MODULO = 'puntos_canje';
const BUCKET = 'archivos-puntos-troya';
const MAX_PREMIOS_PLACA = 6;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const PASOS_CANJE = [
  'Elegí la recompensa de tu preferencia y contactá a tu asesor comercial.',
  'El canje del premio se hará efectivo al realizar tu próxima compra de Troya (mínimo 1 unidad).',
  'El premio será despachado junto a tu pedido, simplificando la logística y garantizando la entrega.',
];

const CHISPAS = [
  { l: '8%', t: '62%', s: 4, o: 0.9 }, { l: '18%', t: '78%', s: 3, o: 0.8 }, { l: '27%', t: '70%', s: 5, o: 0.7 },
  { l: '42%', t: '85%', s: 3, o: 0.9 }, { l: '55%', t: '74%', s: 4, o: 0.6 }, { l: '68%', t: '88%', s: 5, o: 0.8 },
  { l: '78%', t: '66%', s: 3, o: 0.7 }, { l: '88%', t: '80%', s: 4, o: 0.9 }, { l: '93%', t: '58%', s: 3, o: 0.6 },
  { l: '12%', t: '92%', s: 4, o: 0.7 }, { l: '35%', t: '95%', s: 3, o: 0.8 }, { l: '62%', t: '96%', s: 4, o: 0.7 },
];

type ItemCatalogo = {
  id: string;
  nombre: string;
  puntos_requeridos: number;
  activo: boolean;
  producto_id: string | null;
  codigo: string | null;
  costo_manual: number | null;
  foto_url: string | null;
};

type ProductoBase = {
  id: string;
  nombre: string;
  codigo: string | null;
  costo_completo: number | null;
  costo_materia_prima: number | null;
};

type StockFila = {
  producto_id: string;
  stock_rafaela: number | null;
  stock_centro_logistico: number | null;
};

type SaldoCliente = {
  punto_troya_id: string;
  nombre: string;
  localidad: string | null;
  provincia: string | null;
  puntosGanados: number;
  puntosCanjeados: number;
  saldo: number;
};

type PremioPlaca = {
  id: string;
  codigo: string | null;
  nombre: string;
  puntos: number;
  foto_url: string | null;
};

function money(v: number) {
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function numero(v: number | null | undefined) {
  return (v ?? 0).toLocaleString('es-AR');
}

function mesISO(fecha: Date) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`;
}

function badgeRent(v: number) {
  const color = v < 0 ? 'var(--red)' : v < 15 ? '#8A6D00' : '#2E7D32';
  const bg = v < 0 ? 'var(--tint-red)' : v < 15 ? '#FFF3CD' : '#E3F3E4';
  return (
    <span style={{ background: bg, color, padding: '2px 7px', borderRadius: 7, fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>
      {v.toFixed(1)}%
    </span>
  );
}

async function reducirImagen(archivo: File, maxLado: number): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen'));
      el.src = url;
    });
    const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
    const w = Math.round(img.width * escala);
    const h = Math.round(img.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function subirFoto(archivo: File): Promise<string> {
  const blob = await reducirImagen(archivo, 500);
  const ruta = `canje/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}

export default function PuntosCanjePage() {
  const { puedeVer, puedeEditar } = useAuth();
  const puedeVerModulo = puedeVer(MODULO);
  const puedeEditarModulo = puedeEditar(MODULO);
  const puedeVerCostos = puedeVer('costos_precios');
  const puedeVerStock = puedeVer('stock');

  const hoy = new Date();
  const mesActualNombre = MESES[hoy.getMonth()];
  const mesAnteriorNombre = MESES[(hoy.getMonth() + 11) % 12];

  // Configuración
  const [montoPorPunto, setMontoPorPunto] = useState(100000);
  const [montoEdit, setMontoEdit] = useState('100000');
  const [rentBase, setRentBase] = useState(50);
  const [rentBaseEdit, setRentBaseEdit] = useState('50');
  const [tope, setTope] = useState(2.5);
  const [topeEdit, setTopeEdit] = useState('2.5');
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [panelConfigAbierto, setPanelConfigAbierto] = useState(false);
  const [baseCosto, setBaseCosto] = useState<'completo' | 'materia_prima'>('completo');

  // Catálogo
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [productos, setProductos] = useState<ProductoBase[]>([]);
  const [stockPorProducto, setStockPorProducto] = useState<Record<string, StockFila>>({});
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');

  // Formulario de premio (alta y edición)
  const [panelItemAbierto, setPanelItemAbierto] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);
  const [formProductoId, setFormProductoId] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formCodigo, setFormCodigo] = useState('');
  const [formPuntos, setFormPuntos] = useState('');
  const [formCostoManual, setFormCostoManual] = useState('');
  const [formFotoUrl, setFormFotoUrl] = useState('');
  const [formFoto, setFormFoto] = useState<File | null>(null);
  const [formFotoPreview, setFormFotoPreview] = useState('');
  const [guardandoItem, setGuardandoItem] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const panelItemRef = useRef<HTMLDivElement>(null);

  // Placa del mes
  const [panelPlacaAbierto, setPanelPlacaAbierto] = useState(false);
  const [tituloPlaca, setTituloPlaca] = useState('BENEFICIOS PUNTO TROYA');
  const [mensajePlaca, setMensajePlaca] = useState('¡Felicitaciones por tus Puntos Troya! Canjealos por uno de estos premios.');
  const [aclaracionPlaca, setAclaracionPlaca] = useState('El premio se añade sin costo a tu próxima orden dentro del mes corriente.');
  const [mesPlaca, setMesPlaca] = useState(() => MESES[new Date().getMonth()].toUpperCase());
  const [generando, setGenerando] = useState(false);
  const placaRef = useRef<HTMLDivElement>(null);

  // Saldos
  const [saldos, setSaldos] = useState<SaldoCliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [canjeandoId, setCanjeandoId] = useState<string | null>(null);
  const [itemSeleccionado, setItemSeleccionado] = useState('');

  const [cargando, setCargando] = useState(true);

  async function cargarTodo() {
    setCargando(true);

    const { data: configData } = await supabase
      .from('configuracion')
      .select('clave, valor')
      .in('clave', ['monto_por_punto', 'rentabilidad_base_ventas', 'tope_costo_programa']);
    const cfg: Record<string, string> = {};
    (configData ?? []).forEach((c: any) => { cfg[c.clave] = c.valor; });

    const monto = cfg.monto_por_punto ? Number(cfg.monto_por_punto) : 100000;
    setMontoPorPunto(monto);
    setMontoEdit(String(monto));
    const rb = cfg.rentabilidad_base_ventas ? Number(cfg.rentabilidad_base_ventas) : 50;
    setRentBase(rb);
    setRentBaseEdit(String(rb));
    const tp = cfg.tope_costo_programa ? Number(cfg.tope_costo_programa) : 2.5;
    setTope(tp);
    setTopeEdit(String(tp));

    const { data: catalogoData } = await supabase.from('catalogo_canje').select('*').order('puntos_requeridos');
    setCatalogo(catalogoData ?? []);

    const { data: productosData } = await supabase
      .from('productos')
      .select('id, nombre, codigo, costo_completo, costo_materia_prima')
      .order('nombre');
    setProductos(productosData ?? []);

    if (puedeVer('stock')) {
      const { data: stockData } = await supabase.from('stock').select('producto_id, stock_rafaela, stock_centro_logistico');
      const mapaStock: Record<string, StockFila> = {};
      (stockData ?? []).forEach((s: any) => { mapaStock[s.producto_id] = s; });
      setStockPorProducto(mapaStock);
    }

    // Saldos: los puntos son los del mes pasado, se canjean este mes y no se acumulan
    const mesAnteriorISO = mesISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
    const inicioMesActualISO = mesISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));

    const { data: puntosData } = await supabase
      .from('puntos_troya')
      .select('id, clientes(nombre, localidad, provincia)')
      .eq('estado', 'confirmado');

    const { data: comprasData } = await supabase
      .from('compras_mensuales')
      .select('punto_troya_id, monto, mes')
      .eq('mes', mesAnteriorISO);
    const compradoMesAnterior: Record<string, number> = {};
    (comprasData ?? []).forEach((c: any) => {
      compradoMesAnterior[c.punto_troya_id] = (compradoMesAnterior[c.punto_troya_id] ?? 0) + Number(c.monto);
    });

    const { data: canjesData } = await supabase
      .from('canjes')
      .select('punto_troya_id, puntos_utilizados, fecha')
      .gte('fecha', inicioMesActualISO);
    const canjeadoEsteMes: Record<string, number> = {};
    (canjesData ?? []).forEach((c: any) => {
      canjeadoEsteMes[c.punto_troya_id] = (canjeadoEsteMes[c.punto_troya_id] ?? 0) + c.puntos_utilizados;
    });

    const saldosCalculados: SaldoCliente[] = ((puntosData as any) ?? []).map((p: any) => {
      const comprado = compradoMesAnterior[p.id] ?? 0;
      const puntosGanados = monto > 0 ? Math.floor(comprado / monto) : 0;
      const puntosCanjeados = canjeadoEsteMes[p.id] ?? 0;
      return {
        punto_troya_id: p.id,
        nombre: p.clientes?.nombre ?? '',
        localidad: p.clientes?.localidad ?? null,
        provincia: p.clientes?.provincia ?? null,
        puntosGanados,
        puntosCanjeados,
        saldo: Math.max(0, puntosGanados - puntosCanjeados),
      };
    });

    setSaldos(saldosCalculados);
    setCargando(false);
  }

  useEffect(() => {
    if (puedeVerModulo) cargarTodo();
  }, [puedeVerModulo]);

  async function guardarConfig() {
    setGuardandoConfig(true);
    const filas = [
      { clave: 'monto_por_punto', valor: montoEdit || '100000', descripcion: 'Pesos de compra sin IVA necesarios para sumar 1 punto' },
    ];
    if (puedeVerCostos) {
      filas.push({ clave: 'rentabilidad_base_ventas', valor: rentBaseEdit || '0', descripcion: 'Rentabilidad promedio de las ventas, para calcular la rentabilidad final de cada premio de canje' });
      filas.push({ clave: 'tope_costo_programa', valor: topeEdit || '0', descripcion: 'Costo máximo del programa de canje, como porcentaje de la compra que genera los puntos' });
    }
    const { error } = await supabase.from('configuracion').upsert(filas, { onConflict: 'clave' });
    setGuardandoConfig(false);
    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }
    setPanelConfigAbierto(false);
    cargarTodo();
  }

  function seleccionarProducto(id: string) {
    setFormProductoId(id);
    const p = productos.find((x) => x.id === id);
    if (p) {
      setFormNombre(p.nombre);
      setFormCodigo(p.codigo ?? '');
    }
  }

  function limpiarFormulario() {
    setFormId(null);
    setFormProductoId('');
    setFormNombre('');
    setFormCodigo('');
    setFormPuntos('');
    setFormCostoManual('');
    setFormFotoUrl('');
    setFormFoto(null);
    setFormFotoPreview('');
    if (fotoInputRef.current) fotoInputRef.current.value = '';
  }

  function abrirNuevoItem() {
    limpiarFormulario();
    setPanelItemAbierto(true);
  }

  function cerrarItem() {
    limpiarFormulario();
    setPanelItemAbierto(false);
  }

  function abrirEdicionItem(item: ItemCatalogo) {
    setFormId(item.id);
    setFormProductoId(item.producto_id ?? '');
    setFormNombre(item.nombre);
    setFormCodigo(item.codigo ?? '');
    setFormPuntos(String(item.puntos_requeridos));
    setFormCostoManual(item.costo_manual != null ? String(item.costo_manual) : '');
    setFormFotoUrl(item.foto_url ?? '');
    setFormFoto(null);
    setFormFotoPreview('');
    setPanelItemAbierto(true);
    setTimeout(() => panelItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0] ?? null;
    setFormFoto(archivo);
    setFormFotoPreview(archivo ? URL.createObjectURL(archivo) : '');
  }

  async function guardarItem(e: React.FormEvent) {
    e.preventDefault();
    if (!formNombre.trim() || !formPuntos) return;

    setGuardandoItem(true);
    try {
      let fotoUrl = formFotoUrl;
      if (formFoto) fotoUrl = await subirFoto(formFoto);

      const datos = {
        nombre: formNombre.trim(),
        puntos_requeridos: Number(formPuntos),
        producto_id: formProductoId || null,
        codigo: formCodigo.trim() || null,
        costo_manual: formProductoId ? null : formCostoManual ? Number(formCostoManual) : null,
        foto_url: fotoUrl || null,
      };

      if (formId) {
        const { error } = await supabase.from('catalogo_canje').update(datos).eq('id', formId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('catalogo_canje').insert(datos);
        if (error) throw new Error(error.message);
      }

      cerrarItem();
      cargarTodo();
    } catch (err: any) {
      alert('Error al guardar el premio: ' + err.message);
    } finally {
      setGuardandoItem(false);
    }
  }

  async function toggleActivo(item: ItemCatalogo) {
    const { error } = await supabase.from('catalogo_canje').update({ activo: !item.activo }).eq('id', item.id);
    if (error) {
      alert('Error al actualizar: ' + error.message);
      return;
    }
    setCatalogo((prev) => prev.map((i) => (i.id === item.id ? { ...i, activo: !i.activo } : i)));
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

  async function descargarPlaca() {
    if (!placaRef.current) return;
    setGenerando(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(placaRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.download = `placa-puntos-troya-${(mesPlaca || 'mes').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      alert('Error al generar la imagen. Probá de nuevo; si las fotos no se ven, recargá la página.');
    } finally {
      setGenerando(false);
    }
  }

  if (!puedeVerModulo) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Pedile al administrador que te habilite Puntos y Canje desde el Panel de Accesos.</p>
      </div>
    );
  }

  if (cargando) return <p className="troya-subtitulo">Cargando...</p>;

  // ---------- Cálculos del catálogo ----------
  function costoDeItem(item: ItemCatalogo): number {
    if (item.producto_id) {
      const p = productos.find((x) => x.id === item.producto_id);
      if (!p) return 0;
      return (baseCosto === 'completo' ? p.costo_completo : p.costo_materia_prima) ?? 0;
    }
    return item.costo_manual ?? 0;
  }

  function colorCostoPct(v: number) {
    if (v <= tope) return '#2E7D32';
    if (v <= tope * 2) return '#8A6D00';
    return 'var(--red)';
  }

  const catalogoFiltrado = catalogo.filter((i) => {
    const texto = busquedaCatalogo.trim().toLowerCase();
    if (!texto) return true;
    return i.nombre.toLowerCase().includes(texto) || (i.codigo ?? '').toLowerCase().includes(texto);
  });

  const activos = catalogo.filter((i) => i.activo).sort((a, b) => b.puntos_requeridos - a.puntos_requeridos);
  const premiosPlaca: PremioPlaca[] = activos.slice(0, MAX_PREMIOS_PLACA).map((i) => ({
    id: i.id,
    codigo: i.codigo,
    nombre: i.nombre,
    puntos: i.puntos_requeridos,
    foto_url: i.foto_url,
  }));

  const columnas: { key: string; w: number }[] = [
    { key: 'sel', w: 6 },
    { key: 'cod', w: 8 },
    { key: 'premio', w: 28 },
    { key: 'pts', w: 9 },
    ...(puedeVerCostos ? [{ key: 'costo', w: 10 }, { key: 'costopct', w: 9 }, { key: 'rent', w: 10 }] : []),
    ...(puedeVerStock ? [{ key: 'sraf', w: 8 }, { key: 'scl', w: 8 }] : []),
    ...(puedeEditarModulo ? [{ key: 'acc', w: 11 }] : []),
  ];
  const totalAncho = columnas.reduce((acc, c) => acc + c.w, 0);
  const anchoCol = (key: string) => `${(((columnas.find((c) => c.key === key)?.w ?? 0) / totalAncho) * 100).toFixed(2)}%`;

  const saldosFiltrados = saldos.filter((s) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return [s.nombre, s.localidad, s.provincia].filter(Boolean).some((c) => c!.toLowerCase().includes(texto));
  });

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Puntos y Canje</h1>
          <p className="troya-subtitulo">
            1 punto cada {money(montoPorPunto)} de compra sin IVA · se canjea el mes siguiente y no se acumula
            {!puedeEditarModulo && ' · Solo lectura'}
          </p>
        </div>
      </div>

      {/* CONFIGURACIÓN */}
      {puedeEditarModulo && (
        <div className="troya-panel" style={{ marginBottom: 20 }}>
          <button className={`troya-panel-toggle ${panelConfigAbierto ? 'abierto' : ''}`} onClick={() => setPanelConfigAbierto(!panelConfigAbierto)}>
            Configuración del programa
            <IconMas />
          </button>
          {panelConfigAbierto && (
            <div className="troya-panel-body">
              <div className="troya-form">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, flexWrap: 'wrap' }}>
                  Pesos de compra por 1 punto:
                  <input className="troya-input" style={{ flex: '0 0 150px' }} type="number" value={montoEdit} onChange={(e) => setMontoEdit(e.target.value)} />
                </label>
                {puedeVerCostos && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, flexWrap: 'wrap' }}>
                      Rentabilidad base de las ventas (%):
                      <input className="troya-input" style={{ flex: '0 0 100px' }} type="number" value={rentBaseEdit} onChange={(e) => setRentBaseEdit(e.target.value)} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, flexWrap: 'wrap' }}>
                      Costo máximo del programa (% de la compra):
                      <input className="troya-input" style={{ flex: '0 0 100px' }} type="number" step="0.1" value={topeEdit} onChange={(e) => setTopeEdit(e.target.value)} />
                    </label>
                  </>
                )}
                <button className="troya-btn" onClick={guardarConfig} disabled={guardandoConfig}>
                  {guardandoConfig ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              {puedeVerCostos && (
                <p className="troya-subtitulo" style={{ marginTop: 10, marginBottom: 0 }}>
                  Rentabilidad final de un premio = rentabilidad base menos lo que te cuesta el premio como porcentaje de la compra que lo genera.
                  El costo máximo se usa para sugerirte los puntos mínimos de cada premio.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* CATÁLOGO DE CANJE */}
      <div className="troya-seccion">
        <div className="troya-seccion-titulo">Catálogo de canje</div>
        <p className="troya-subtitulo" style={{ marginTop: -6, marginBottom: 12 }}>
          Tildá los premios de este mes: esos son los que salen en la placa y los únicos que se ofrecen al registrar un canje.
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="troya-buscador" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
            <IconBuscar />
            <input type="text" placeholder="Buscar premio por nombre o código..." value={busquedaCatalogo} onChange={(e) => setBusquedaCatalogo(e.target.value)} />
          </div>
          {puedeVerCostos && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="troya-btn"
                style={baseCosto === 'completo' ? {} : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}
                onClick={() => setBaseCosto('completo')}
              >
                Costo completo
              </button>
              <button
                className="troya-btn"
                style={baseCosto === 'materia_prima' ? {} : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}
                onClick={() => setBaseCosto('materia_prima')}
              >
                Solo materia prima
              </button>
            </div>
          )}
          {puedeEditarModulo && (
            <button className="troya-btn" onClick={() => setPanelPlacaAbierto(true)}>
              Generar placa del mes ({activos.length})
            </button>
          )}
        </div>

        {puedeEditarModulo && (
          <div className="troya-panel" ref={panelItemRef}>
            <button className={`troya-panel-toggle ${panelItemAbierto ? 'abierto' : ''}`} onClick={() => (panelItemAbierto ? cerrarItem() : abrirNuevoItem())}>
              {formId ? 'Editando premio' : 'Nuevo premio canjeable'}
              <IconMas />
            </button>
            {panelItemAbierto && (
              <div className="troya-panel-body">
                <form onSubmit={guardarItem}>
                  <div className="troya-form">
                    <select className="troya-input" value={formProductoId} onChange={(e) => seleccionarProducto(e.target.value)}>
                      <option value="">Premio libre (no está en Costos y Precios)</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} - ` : ''}{p.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="troya-form">
                    <input className="troya-input" placeholder="Nombre del premio" value={formNombre} onChange={(e) => setFormNombre(e.target.value)} required />
                    <input className="troya-input" style={{ flex: '0 0 130px' }} placeholder="Código" value={formCodigo} onChange={(e) => setFormCodigo(e.target.value)} />
                    <input className="troya-input" style={{ flex: '0 0 130px' }} type="number" placeholder="Puntos" value={formPuntos} onChange={(e) => setFormPuntos(e.target.value)} required />
                    {!formProductoId && (
                      <input className="troya-input" style={{ flex: '0 0 170px' }} type="number" placeholder="Costo para vos ($)" value={formCostoManual} onChange={(e) => setFormCostoManual(e.target.value)} />
                    )}
                  </div>
                  <div className="troya-form" style={{ alignItems: 'center' }}>
                    <label style={{ fontSize: 13, color: 'var(--muted)' }}>Foto del premio:</label>
                    <input ref={fotoInputRef} type="file" accept="image/*" onChange={elegirFoto} />
                    {(formFotoPreview || formFotoUrl) && (
                      <img
                        src={formFotoPreview || formFotoUrl}
                        alt=""
                        style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }}
                      />
                    )}
                  </div>
                  <div className="troya-card-acciones" style={{ marginTop: 14 }}>
                    <button type="submit" className="troya-btn" disabled={guardandoItem}>{guardandoItem ? 'Guardando...' : 'Guardar premio'}</button>
                    <button type="button" className="troya-btn troya-btn-secundario" onClick={cerrarItem}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {catalogo.length === 0 ? (
          <div className="troya-vacio">
            <h3>Todavía no hay premios cargados</h3>
            <p>{puedeEditarModulo ? 'Agregá el primero desde Nuevo premio canjeable.' : 'Todavía no hay premios en el catálogo.'}</p>
          </div>
        ) : catalogoFiltrado.length === 0 ? (
          <div className="troya-vacio">
            <h3>No hay resultados para &ldquo;{busquedaCatalogo}&rdquo;</h3>
          </div>
        ) : (
          <div className="troya-matriz-wrapper">
            <table className="troya-matriz-tabla troya-matriz-tabla--compacta">
              <colgroup>
                {columnas.map((c) => (
                  <col key={c.key} style={{ width: anchoCol(c.key) }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>Del mes</th>
                  <th>Cód.</th>
                  <th>Premio</th>
                  <th>Puntos</th>
                  {puedeVerCostos && (
                    <>
                      <th>Costo</th>
                      <th>Costo % compra</th>
                      <th>Rent. final</th>
                    </>
                  )}
                  {puedeVerStock && (
                    <>
                      <th>Stock Rafaela</th>
                      <th>Stock C. Log.</th>
                    </>
                  )}
                  {puedeEditarModulo && <th></th>}
                </tr>
              </thead>
              <tbody>
                {catalogoFiltrado.map((it) => {
                  const costo = costoDeItem(it);
                  const sinCosto = costo <= 0;
                  const compraNecesaria = it.puntos_requeridos * montoPorPunto;
                  const costoPct = compraNecesaria > 0 ? (costo / compraNecesaria) * 100 : 0;
                  const rentFinal = rentBase - costoPct;
                  const minSanos = tope > 0 && montoPorPunto > 0 ? Math.ceil(costo / ((tope / 100) * montoPorPunto)) : 0;
                  const stock = it.producto_id ? stockPorProducto[it.producto_id] : undefined;

                  return (
                    <tr key={it.id} style={it.activo ? { background: '#FFF8F3' } : undefined}>
                      <td>
                        {puedeEditarModulo ? (
                          <input type="checkbox" checked={it.activo} onChange={() => toggleActivo(it)} title="Incluir en la placa del mes" />
                        ) : (
                          it.activo ? '✓' : '—'
                        )}
                      </td>
                      <td>{it.codigo ?? '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {it.foto_url && (
                            <img
                              src={it.foto_url}
                              alt=""
                              style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid var(--line)', flexShrink: 0 }}
                            />
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={it.nombre}>
                            {it.nombre}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {it.puntos_requeridos}
                        {puedeVerCostos && !sinCosto && minSanos > it.puntos_requeridos && (
                          <div style={{ fontSize: 10.5, color: 'var(--red)', fontWeight: 600 }}>mín. {minSanos}</div>
                        )}
                      </td>
                      {puedeVerCostos && (
                        <>
                          <td>{sinCosto ? '—' : money(costo)}</td>
                          <td style={{ fontWeight: 700, color: sinCosto ? 'var(--muted)' : colorCostoPct(costoPct) }}>
                            {sinCosto ? '—' : `${costoPct.toFixed(1)}%`}
                          </td>
                          <td>{sinCosto ? '—' : badgeRent(rentFinal)}</td>
                        </>
                      )}
                      {puedeVerStock && (
                        <>
                          <td>{stock ? numero(stock.stock_rafaela) : '—'}</td>
                          <td>{stock ? numero(stock.stock_centro_logistico) : '—'}</td>
                        </>
                      )}
                      {puedeEditarModulo && (
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="troya-icon-btn" onClick={() => abrirEdicionItem(it)} title="Editar" style={{ width: 26, height: 26 }}>
                              <IconLapiz />
                            </button>
                            <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarItemCatalogo(it)} title="Eliminar" style={{ width: 26, height: 26 }}>
                              <IconTacho />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PLACA DEL MES */}
      {puedeEditarModulo && (
        <div className="troya-panel" style={{ marginBottom: 28 }}>
          <button className={`troya-panel-toggle ${panelPlacaAbierto ? 'abierto' : ''}`} onClick={() => setPanelPlacaAbierto(!panelPlacaAbierto)}>
            Placa de premios del mes
            <IconMas />
          </button>
          {panelPlacaAbierto && (
            <div className="troya-panel-body">
              <div className="troya-form">
                <input className="troya-input" style={{ flex: '1 1 100%' }} placeholder="Título" value={tituloPlaca} onChange={(e) => setTituloPlaca(e.target.value)} />
                <input className="troya-input" style={{ flex: '1 1 100%' }} placeholder="Mensaje de felicitación" value={mensajePlaca} onChange={(e) => setMensajePlaca(e.target.value)} />
                <input className="troya-input" style={{ flex: '1 1 100%' }} placeholder="Aclaración" value={aclaracionPlaca} onChange={(e) => setAclaracionPlaca(e.target.value)} />
                <input className="troya-input" style={{ flex: '0 0 200px' }} placeholder="Mes (ej: OCTUBRE)" value={mesPlaca} onChange={(e) => setMesPlaca(e.target.value.toUpperCase())} />
              </div>

              {premiosPlaca.length === 0 && (
                <p className="troya-subtitulo" style={{ marginTop: 12 }}>
                  Todavía no hay premios del mes. Tildá la casilla Del mes de los premios que querés incluir y la placa se arma sola.
                </p>
              )}
              {activos.length > MAX_PREMIOS_PLACA && (
                <p style={{ color: '#8A6D00', fontSize: 13, marginTop: 12 }}>
                  Tenés {activos.length} premios tildados y en la placa entran {MAX_PREMIOS_PLACA}: salen los de más puntos. Destildá alguno para elegir cuáles incluir.
                </p>
              )}

              <button className="troya-btn" onClick={descargarPlaca} disabled={generando || premiosPlaca.length === 0} style={{ margin: '16px 0' }}>
                {generando ? 'Generando...' : 'Descargar placa (PNG)'}
              </button>

              <div style={{ overflowX: 'auto' }}>
                <PlacaPremios
                  innerRef={placaRef}
                  titulo={tituloPlaca}
                  mensaje={mensajePlaca}
                  aclaracion={aclaracionPlaca}
                  mes={mesPlaca}
                  premios={premiosPlaca}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* SALDO POR CLIENTE */}
      <div className="troya-seccion">
        <div className="troya-seccion-titulo">Saldo de puntos por cliente</div>
        <p className="troya-subtitulo" style={{ marginTop: -6, marginBottom: 12 }}>
          Puntos ganados con las compras de {mesAnteriorNombre}, canjeables durante {mesActualNombre}.
        </p>

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
                      <option value="">Elegir premio del mes...</option>
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
                      <div className="troya-saldo-detalle">{s.puntosGanados} ganados en {mesAnteriorNombre} · {s.puntosCanjeados} canjeados este mes</div>
                    </div>
                    {puedeEditarModulo && (
                      <div className="troya-card-acciones">
                        <button className="troya-btn troya-btn-secundario" onClick={() => empezarCanje(s.punto_troya_id)} disabled={s.saldo <= 0}>
                          Canjear
                        </button>
                      </div>
                    )}
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

function PlacaPremios({
  innerRef, titulo, mensaje, aclaracion, mes, premios,
}: {
  innerRef: React.RefObject<HTMLDivElement>;
  titulo: string;
  mensaje: string;
  aclaracion: string;
  mes: string;
  premios: PremioPlaca[];
}) {
  const n = premios.length;
  const altoFila = n <= 4 ? 92 : n === 5 ? 78 : 66;

  return (
    <div
      ref={innerRef}
      style={{
        width: 540,
        height: 960,
        position: 'relative',
        overflow: 'hidden',
        background: '#0B0807',
        fontFamily: 'var(--font-body)',
        color: '#fff',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 80% 38% at 15% 100%, rgba(235,103,38,0.55), transparent 70%), radial-gradient(ellipse 70% 34% at 95% 100%, rgba(218,35,31,0.5), transparent 70%), linear-gradient(180deg, #0B0807 0%, #140B08 100%)',
        }}
      />
      {CHISPAS.map((c, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: c.l,
            top: c.t,
            width: c.s,
            height: c.s,
            borderRadius: '50%',
            background: '#F08723',
            opacity: c.o,
            boxShadow: '0 0 6px 2px rgba(240,135,35,0.7)',
          }}
        />
      ))}

      <div style={{ position: 'relative', height: '100%', padding: '28px 30px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', background: '#DA231F', padding: '7px 30px', fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, letterSpacing: 1.5 }}>
            EXCLUSIVO
            <img
              src="/logo/isotipo_llama_naranja.png"
              alt=""
              crossOrigin="anonymous"
              style={{ position: 'absolute', right: -22, top: -20, width: 44 }}
            />
          </div>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, textAlign: 'center', lineHeight: 1.1, margin: '0 0 10px', textTransform: 'uppercase' }}>
          {titulo}
        </h1>
        <p style={{ textAlign: 'center', fontSize: 16, color: '#FFD9B8', margin: '0 0 16px', lineHeight: 1.35 }}>{mensaje}</p>

        <div style={{ background: '#fff', color: '#1C1512', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'flex', background: '#2A1E1A', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textAlign: 'center' }}>
            <div style={{ width: '15%', padding: '9px 4px' }}>CÓDIGO</div>
            <div style={{ width: '34%', padding: '9px 4px' }}>PRODUCTO</div>
            <div style={{ width: '27%', padding: '9px 4px' }}>FOTO</div>
            <div style={{ width: '24%', padding: '9px 4px' }}>PUNTOS</div>
          </div>
          {premios.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', height: altoFila, borderTop: '1px solid #E8E0D8' }}>
              <div style={{ width: '15%', textAlign: 'center', fontSize: 13, color: '#6B5E55' }}>{p.codigo ?? ''}</div>
              <div style={{ width: '34%', padding: '0 8px', fontSize: 16, lineHeight: 1.2, fontWeight: 500 }}>{p.nombre}</div>
              <div style={{ width: '27%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {p.foto_url ? (
                  <img
                    src={p.foto_url}
                    alt=""
                    crossOrigin="anonymous"
                    style={{ maxWidth: '88%', maxHeight: altoFila - 14, objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ fontSize: 11, color: '#B5AAA0' }}>sin foto</span>
                )}
              </div>
              <div style={{ width: '24%', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 800 }}>{p.puntos}</div>
            </div>
          ))}
          {n === 0 && (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B5AAA0', fontSize: 14 }}>
              Sin premios seleccionados
            </div>
          )}
        </div>

        <p style={{ fontSize: 12.5, textAlign: 'center', margin: '12px 0 0', color: '#EDE5DE', lineHeight: 1.4 }}>
          {aclaracion}
          <br />
          VÁLIDO HASTA AGOTAR STOCK
        </p>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <div style={{ background: '#DA231F', padding: '6px 22px', fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700 }}>
            ¿Cómo canjeo mi premio?
          </div>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.4, color: '#F0EAE4', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {PASOS_CANJE.map((paso, i) => (
            <li key={i}>{paso}</li>
          ))}
        </ol>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px -30px 0 -30px', height: 64, padding: '0 30px 0 0' }}>
          <div style={{ background: '#DA231F', padding: '8px 30px 8px 30px', borderRadius: '0 26px 26px 0', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
            {mes}
          </div>
          <img src="/logo/logo_troya_blanco_transparente.png" alt="Troya" crossOrigin="anonymous" style={{ height: 34 }} />
        </div>
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