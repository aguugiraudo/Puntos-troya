'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const MODULO = 'puntos_canje';
const BUCKET = 'archivos-puntos-troya';
const MAX_PREMIOS_PLACA = 6;
const OTRO = '__otro__';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const ACLARACION = 'El premio se añade sin costo a tu próxima orden dentro del mes corriente.';

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

type Pestana = 'premios' | 'placa' | 'saldos';

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
  precio_lista: number | null;
};

type ListaTroya = {
  nombre: string;
  descuento_porcentaje: number;
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

function badgeRent(v: number, color: string) {
  const bg = v < 0 ? 'var(--tint-red)' : color === '#2E7D32' ? '#E3F3E4' : color === '#8A6D00' ? '#FFF3CD' : 'var(--tint-red)';
  return (
    <span style={{ background: bg, color, padding: '2px 7px', borderRadius: 7, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
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

  const [pestana, setPestana] = useState<Pestana>('premios');
  const [cargando, setCargando] = useState(true);

  // Ajustes del programa
  const [montoPorPunto, setMontoPorPunto] = useState(100000);
  const [montoEdit, setMontoEdit] = useState('100000');
  const [tope, setTope] = useState(2.5);
  const [topeEdit, setTopeEdit] = useState('2.5');
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  // Premios
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [productos, setProductos] = useState<ProductoBase[]>([]);
  const [listaTroya, setListaTroya] = useState<ListaTroya | null>(null);
  const [stockPorProducto, setStockPorProducto] = useState<Record<string, StockFila>>({});
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  const [subiendoFotoId, setSubiendoFotoId] = useState<string | null>(null);

  // Sumar premio
  const [nuevoProducto, setNuevoProducto] = useState('');
  const [nuevoPuntos, setNuevoPuntos] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [nuevoCosto, setNuevoCosto] = useState('');
  const [agregando, setAgregando] = useState(false);

  // Placa
  const [tituloPlaca, setTituloPlaca] = useState('BENEFICIOS PUNTO TROYA');
  const [mensajePlaca, setMensajePlaca] = useState('¡Felicitaciones por tus Puntos Troya! Canjealos por uno de estos premios.');
  const [mesPlaca, setMesPlaca] = useState(() => MESES[new Date().getMonth()].toUpperCase());
  const [generando, setGenerando] = useState(false);
  const placaRef = useRef<HTMLDivElement>(null);

  // Saldos
  const [saldos, setSaldos] = useState<SaldoCliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [canjeandoId, setCanjeandoId] = useState<string | null>(null);
  const [itemSeleccionado, setItemSeleccionado] = useState('');

  async function cargarTodo() {
    setCargando(true);

    const { data: configData } = await supabase
      .from('configuracion')
      .select('clave, valor')
      .in('clave', ['monto_por_punto', 'tope_costo_programa']);
    const cfg: Record<string, string> = {};
    (configData ?? []).forEach((c: any) => { cfg[c.clave] = c.valor; });

    const monto = cfg.monto_por_punto ? Number(cfg.monto_por_punto) : 100000;
    setMontoPorPunto(monto);
    setMontoEdit(String(monto));
    const tp = cfg.tope_costo_programa ? Number(cfg.tope_costo_programa) : 2.5;
    setTope(tp);
    setTopeEdit(String(tp));

    const { data: catalogoData } = await supabase.from('catalogo_canje').select('*').order('puntos_requeridos');
    setCatalogo(catalogoData ?? []);

    const { data: productosData } = await supabase
      .from('productos')
      .select('id, nombre, codigo, costo_completo, precio_lista')
      .order('nombre');
    setProductos(productosData ?? []);

    // La rentabilidad base sale de Costos y Precios: se usa la lista Punto Troya
    const { data: listasData } = await supabase.from('listas_precio').select('codigo, nombre, descuento_porcentaje');
    const listas: any[] = listasData ?? [];
    const lt = listas.find((l) => l.codigo === 'punto_troya') ?? listas.find((l) => String(l.nombre).toLowerCase().includes('troya'));
    setListaTroya(lt ? { nombre: lt.nombre, descuento_porcentaje: Number(lt.descuento_porcentaje) } : null);

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
      filas.push({ clave: 'tope_costo_programa', valor: topeEdit || '0', descripcion: 'Costo máximo del programa de canje, como porcentaje de la compra que genera los puntos' });
    }
    const { error } = await supabase.from('configuracion').upsert(filas, { onConflict: 'clave' });
    setGuardandoConfig(false);
    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  async function agregarPremio(e: React.FormEvent) {
    e.preventDefault();
    const puntos = Math.round(Number(nuevoPuntos));
    if (!nuevoProducto) {
      alert('Elegí un producto de la lista.');
      return;
    }
    if (!puntos || puntos <= 0) {
      alert('Poné cuántos puntos cuesta el premio.');
      return;
    }

    let datos: any;
    if (nuevoProducto === OTRO) {
      if (!nuevoNombre.trim()) {
        alert('Escribí el nombre del premio.');
        return;
      }
      datos = {
        nombre: nuevoNombre.trim(),
        puntos_requeridos: puntos,
        producto_id: null,
        codigo: nuevoCodigo.trim() || null,
        costo_manual: nuevoCosto ? Number(nuevoCosto) : null,
        activo: false,
      };
    } else {
      const p = productos.find((x) => x.id === nuevoProducto);
      if (!p) return;
      datos = {
        nombre: p.nombre,
        puntos_requeridos: puntos,
        producto_id: p.id,
        codigo: p.codigo,
        costo_manual: null,
        activo: false,
      };
    }

    setAgregando(true);
    const { error } = await supabase.from('catalogo_canje').insert(datos);
    setAgregando(false);

    if (error) {
      alert('Error al agregar el premio: ' + error.message);
      return;
    }

    setNuevoProducto('');
    setNuevoPuntos('');
    setNuevoNombre('');
    setNuevoCodigo('');
    setNuevoCosto('');
    cargarTodo();
  }

  async function toggleActivo(item: ItemCatalogo) {
    const { error } = await supabase.from('catalogo_canje').update({ activo: !item.activo }).eq('id', item.id);
    if (error) {
      alert('Error al actualizar: ' + error.message);
      return;
    }
    setCatalogo((prev) => prev.map((i) => (i.id === item.id ? { ...i, activo: !i.activo } : i)));
  }

  async function guardarPuntos(item: ItemCatalogo, input: HTMLInputElement) {
    const puntos = Math.round(Number(input.value));
    if (!puntos || puntos <= 0) {
      input.value = String(item.puntos_requeridos);
      return;
    }
    if (puntos === item.puntos_requeridos) return;

    const { error } = await supabase.from('catalogo_canje').update({ puntos_requeridos: puntos }).eq('id', item.id);
    if (error) {
      alert('Error al guardar los puntos: ' + error.message);
      input.value = String(item.puntos_requeridos);
      return;
    }
    setCatalogo((prev) => prev.map((i) => (i.id === item.id ? { ...i, puntos_requeridos: puntos } : i)));
  }

  async function guardarCostoManual(item: ItemCatalogo, input: HTMLInputElement) {
    const valor = input.value.trim() === '' ? null : Number(input.value);
    if (valor !== null && (isNaN(valor) || valor < 0)) {
      input.value = item.costo_manual != null ? String(item.costo_manual) : '';
      return;
    }
    if (valor === item.costo_manual) return;

    const { error } = await supabase.from('catalogo_canje').update({ costo_manual: valor }).eq('id', item.id);
    if (error) {
      alert('Error al guardar el costo: ' + error.message);
      return;
    }
    setCatalogo((prev) => prev.map((i) => (i.id === item.id ? { ...i, costo_manual: valor } : i)));
  }

  async function cambiarFoto(item: ItemCatalogo, archivo: File | undefined) {
    if (!archivo) return;
    setSubiendoFotoId(item.id);
    try {
      const url = await subirFoto(archivo);
      const { error } = await supabase.from('catalogo_canje').update({ foto_url: url }).eq('id', item.id);
      if (error) throw new Error(error.message);
      setCatalogo((prev) => prev.map((i) => (i.id === item.id ? { ...i, foto_url: url } : i)));
    } catch (err: any) {
      alert('No se pudo subir la foto: ' + err.message);
    } finally {
      setSubiendoFotoId(null);
    }
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

  // ---------- Cálculos ----------
  function costoDeItem(item: ItemCatalogo): number {
    if (item.producto_id) {
      const p = productos.find((x) => x.id === item.producto_id);
      return p?.costo_completo ?? 0;
    }
    return item.costo_manual ?? 0;
  }

  function colorCostoPct(v: number) {
    if (v <= tope) return '#2E7D32';
    if (v <= tope * 2) return '#8A6D00';
    return '#DA231F';
  }

  // Rentabilidad base: promedio de la rentabilidad de todos los productos de Costos y Precios,
  // vendidos al precio de la lista Punto Troya y con su costo completo.
  let rentBase: number | null = null;
  let productosParaRent = 0;
  if (listaTroya) {
    const rents = productos
      .filter((p) => (p.precio_lista ?? 0) > 0 && (p.costo_completo ?? 0) > 0)
      .map((p) => {
        const precioVenta = (p.precio_lista as number) * (1 - listaTroya.descuento_porcentaje / 100);
        return precioVenta > 0 ? ((precioVenta - (p.costo_completo as number)) / precioVenta) * 100 : 0;
      });
    productosParaRent = rents.length;
    if (rents.length > 0) rentBase = rents.reduce((a, b) => a + b, 0) / rents.length;
  }

  const configCambio = montoEdit !== String(montoPorPunto) || topeEdit !== String(tope);

  const productosDisponibles = productos.filter((p) => !catalogo.some((c) => c.producto_id === p.id));

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
    { key: 'sel', w: 8 },
    { key: 'foto', w: 9 },
    { key: 'premio', w: 30 },
    { key: 'pts', w: 10 },
    ...(puedeVerCostos ? [{ key: 'costo', w: 11 }, { key: 'rent', w: 12 }] : []),
    ...(puedeVerStock ? [{ key: 'sraf', w: 8 }, { key: 'scl', w: 8 }] : []),
    ...(puedeEditarModulo ? [{ key: 'acc', w: 6 }] : []),
  ];
  const totalAncho = columnas.reduce((acc, c) => acc + c.w, 0);
  const anchoCol = (key: string) => `${(((columnas.find((c) => c.key === key)?.w ?? 0) / totalAncho) * 100).toFixed(2)}%`;

  const saldosFiltrados = saldos.filter((s) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return [s.nombre, s.localidad, s.provincia].filter(Boolean).some((c) => c!.toLowerCase().includes(texto));
  });

  const pestanas: { id: Pestana; label: string }[] = [
    { id: 'premios', label: '1. Premios y puntos' },
    ...(puedeEditarModulo ? [{ id: 'placa' as Pestana, label: '2. Placa del mes' }] : []),
    { id: 'saldos', label: puedeEditarModulo ? '3. Saldos y canjes' : 'Saldos' },
  ];

  const labelAjuste: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, flexWrap: 'wrap' };

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Puntos y Canje</h1>
          <p className="troya-subtitulo">Premios del programa y saldo de cada cliente{!puedeEditarModulo && ' · Solo lectura'}</p>
        </div>
      </div>

      {/* PESTAÑAS */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        {pestanas.map((t) => (
          <button
            key={t.id}
            className="troya-btn"
            style={pestana === t.id ? {} : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}
            onClick={() => setPestana(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ PESTAÑA 1: PREMIOS ============ */}
      {pestana === 'premios' && (
        <div>
          <p style={{ fontSize: 14, margin: '0 0 14px', color: 'var(--ink)' }}>
            <strong>Tildá los premios que salen este mes.</strong> Los tildados van a la placa y son los únicos que se pueden canjear.
          </p>

          {/* AJUSTES DEL PROGRAMA */}
          {puedeEditarModulo ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', background: 'var(--tint-orange)', borderRadius: 12, padding: '12px 16px', marginBottom: 10 }}>
              <label style={labelAjuste}>
                1 punto cada $
                <input className="troya-input" style={{ flex: '0 0 110px', padding: '7px 10px' }} type="number" value={montoEdit} onChange={(e) => setMontoEdit(e.target.value)} />
                de compra sin IVA
              </label>
              {puedeVerCostos && (
                <label style={labelAjuste}>
                  Gastar como máximo
                  <input className="troya-input" style={{ flex: '0 0 70px', padding: '7px 10px' }} type="number" step="0.1" value={topeEdit} onChange={(e) => setTopeEdit(e.target.value)} />
                  % de la compra en premios
                </label>
              )}
              {configCambio && (
                <button className="troya-btn" onClick={guardarConfig} disabled={guardandoConfig}>
                  {guardandoConfig ? 'Guardando...' : 'Guardar ajustes'}
                </button>
              )}
            </div>
          ) : (
            <p className="troya-subtitulo" style={{ marginBottom: 10 }}>1 punto cada {money(montoPorPunto)} de compra sin IVA. Los puntos se canjean el mes siguiente y no se acumulan.</p>
          )}

          {puedeVerCostos && (
            <p style={{ fontSize: 13.5, margin: '0 0 16px' }}>
              Tus ventas a Punto Troya rinden <strong>{rentBase !== null ? `${rentBase.toFixed(1)}%` : '—'}</strong>
              <span style={{ color: 'var(--muted)' }}>
                {rentBase !== null && listaTroya
                  ? ` en promedio (calculado desde Costos y Precios: lista ${listaTroya.nombre} con ${listaTroya.descuento_porcentaje}% de descuento, ${productosParaRent} productos con costo y precio cargados).`
                  : listaTroya
                    ? ' (todavía no hay productos con costo y precio de lista cargados en Costos y Precios).'
                    : ' (no encontré la lista Punto Troya en Costos y Precios).'}
              </span>
            </p>
          )}

          {/* SUMAR PREMIO */}
          {puedeEditarModulo && (
            <form onSubmit={agregarPremio} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 10px' }}>Sumar un premio</p>
              <div className="troya-form" style={{ paddingTop: 0 }}>
                <select className="troya-input" style={{ flex: '2 1 260px' }} value={nuevoProducto} onChange={(e) => setNuevoProducto(e.target.value)}>
                  <option value="">Elegí un producto...</option>
                  {productosDisponibles.map((p) => (
                    <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} - ` : ''}{p.nombre}</option>
                  ))}
                  <option value={OTRO}>Otro premio (no está en la lista)</option>
                </select>
                {nuevoProducto === OTRO && (
                  <>
                    <input className="troya-input" style={{ flex: '2 1 200px' }} placeholder="Nombre del premio" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
                    <input className="troya-input" style={{ flex: '0 0 110px' }} placeholder="Código" value={nuevoCodigo} onChange={(e) => setNuevoCodigo(e.target.value)} />
                    <input className="troya-input" style={{ flex: '0 0 150px' }} type="number" placeholder="Te cuesta ($)" value={nuevoCosto} onChange={(e) => setNuevoCosto(e.target.value)} />
                  </>
                )}
                <input className="troya-input" style={{ flex: '0 0 110px' }} type="number" placeholder="Puntos" value={nuevoPuntos} onChange={(e) => setNuevoPuntos(e.target.value)} />
                <button type="submit" className="troya-btn" disabled={agregando}>{agregando ? 'Agregando...' : 'Agregar'}</button>
              </div>
            </form>
          )}

          {/* BUSCADOR + IR A LA PLACA */}
          {catalogo.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <div className="troya-buscador" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <IconBuscar />
                <input type="text" placeholder="Buscar premio..." value={busquedaCatalogo} onChange={(e) => setBusquedaCatalogo(e.target.value)} />
              </div>
              {puedeEditarModulo && (
                <button className="troya-btn" onClick={() => setPestana('placa')}>
                  Armar placa con {activos.length} premio{activos.length === 1 ? '' : 's'} →
                </button>
              )}
            </div>
          )}

          {/* TABLA */}
          {catalogo.length === 0 ? (
            <div className="troya-vacio">
              <h3>Todavía no sumaste premios</h3>
              <p>{puedeEditarModulo ? 'Elegí un producto arriba, ponele los puntos y tocá Agregar.' : 'Todavía no hay premios en el catálogo.'}</p>
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
                    <th>Este mes</th>
                    <th>Foto</th>
                    <th>Premio</th>
                    <th>Puntos</th>
                    {puedeVerCostos && (
                      <>
                        <th>Te cuesta</th>
                        <th>Rentab. final</th>
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
                    const rentFinal = rentBase !== null ? rentBase - costoPct : null;
                    const minSanos = tope > 0 && montoPorPunto > 0 ? Math.ceil(costo / ((tope / 100) * montoPorPunto)) : 0;
                    const stock = it.producto_id ? stockPorProducto[it.producto_id] : undefined;

                    return (
                      <tr key={it.id} style={it.activo ? { background: '#FFF8F3' } : undefined}>
                        <td>
                          {puedeEditarModulo ? (
                            <input type="checkbox" style={{ width: 18, height: 18 }} checked={it.activo} onChange={() => toggleActivo(it)} title="Incluir este mes" />
                          ) : (
                            it.activo ? '✓' : '—'
                          )}
                        </td>
                        <td>
                          {puedeEditarModulo ? (
                            <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Cambiar foto">
                              {subiendoFotoId === it.id ? (
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Subiendo...</span>
                              ) : it.foto_url ? (
                                <img src={it.foto_url} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid var(--line)' }} />
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>+ Foto</span>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  cambiarFoto(it, e.target.files?.[0]);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          ) : it.foto_url ? (
                            <img src={it.foto_url} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid var(--line)' }} />
                          ) : null}
                        </td>
                        <td>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.nombre}>{it.nombre}</div>
                            {it.codigo && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.codigo}</div>}
                          </div>
                        </td>
                        <td>
                          {puedeEditarModulo ? (
                            <input
                              key={`${it.id}-${it.puntos_requeridos}`}
                              className="troya-input"
                              style={{ width: 70, padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}
                              type="number"
                              defaultValue={it.puntos_requeridos}
                              onBlur={(e) => guardarPuntos(it, e.target)}
                            />
                          ) : (
                            <strong>{it.puntos_requeridos}</strong>
                          )}
                        </td>
                        {puedeVerCostos && (
                          <>
                            <td>
                              {!it.producto_id && puedeEditarModulo ? (
                                <input
                                  key={`${it.id}-${it.costo_manual ?? ''}`}
                                  className="troya-input"
                                  style={{ width: 90, padding: '6px 8px' }}
                                  type="number"
                                  placeholder="$"
                                  defaultValue={it.costo_manual ?? ''}
                                  onBlur={(e) => guardarCostoManual(it, e.target)}
                                />
                              ) : sinCosto ? (
                                '—'
                              ) : (
                                money(costo)
                              )}
                            </td>
                            <td title={sinCosto ? '' : `Puntos mínimos sugeridos para este premio: ${minSanos}`}>
                              {sinCosto ? (
                                '—'
                              ) : (
                                <div>
                                  {rentFinal !== null ? (
                                    badgeRent(rentFinal, colorCostoPct(costoPct))
                                  ) : (
                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>sin dato</span>
                                  )}
                                  <div style={{ fontSize: 10.5, color: colorCostoPct(costoPct), fontWeight: 600, marginTop: 2 }}>
                                    {`−${costoPct.toFixed(1)} pts`}
                                  </div>
                                </div>
                              )}
                            </td>
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
                            <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => eliminarItemCatalogo(it)} title="Eliminar" style={{ width: 26, height: 26 }}>
                              <IconTacho />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {puedeVerCostos && catalogo.length > 0 && (
            <p className="troya-subtitulo" style={{ marginTop: 10 }}>
              Rentab. final = lo que rinden en promedio tus ventas a Punto Troya (se calcula solo desde Costos y Precios) menos lo que te cuesta el premio. Debajo se ve cuántos puntos de rentabilidad te baja: verde si está dentro de tu máximo, amarillo si lo duplica, rojo si lo pasa. Si se pasa, subile los puntos al premio.
            </p>
          )}
        </div>
      )}

      {/* ============ PESTAÑA 2: PLACA ============ */}
      {pestana === 'placa' && puedeEditarModulo && (
        <div>
          <p style={{ fontSize: 14, margin: '0 0 14px' }}>
            <strong>Revisá los textos y descargá la imagen</strong> para subir a historias o mandar por WhatsApp.
          </p>

          <div className="troya-form" style={{ paddingTop: 0 }}>
            <input className="troya-input" style={{ flex: '2 1 240px' }} placeholder="Título" value={tituloPlaca} onChange={(e) => setTituloPlaca(e.target.value)} />
            <input className="troya-input" style={{ flex: '3 1 320px' }} placeholder="Mensaje de felicitación" value={mensajePlaca} onChange={(e) => setMensajePlaca(e.target.value)} />
            <input className="troya-input" style={{ flex: '0 0 170px' }} placeholder="Mes (ej: OCTUBRE)" value={mesPlaca} onChange={(e) => setMesPlaca(e.target.value.toUpperCase())} />
          </div>

          {premiosPlaca.length === 0 ? (
            <div className="troya-vacio" style={{ marginTop: 18 }}>
              <h3>Todavía no elegiste premios para este mes</h3>
              <p>Volvé a Premios y puntos y tildá la casilla Este mes en los que quieras incluir.</p>
              <button className="troya-btn" style={{ marginTop: 14 }} onClick={() => setPestana('premios')}>Ir a elegir premios</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '14px 0 6px', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>En la placa:</span>
                {premiosPlaca.map((p) => (
                  <span key={p.id} style={{ background: 'var(--tint-orange)', color: 'var(--ink)', borderRadius: 20, padding: '4px 12px', fontSize: 12.5, fontWeight: 600 }}>
                    {p.nombre} · {p.puntos} pts
                  </span>
                ))}
                <button className="troya-btn troya-btn-secundario" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => setPestana('premios')}>Cambiar premios</button>
              </div>
              {activos.length > MAX_PREMIOS_PLACA && (
                <p style={{ color: '#8A6D00', fontSize: 13, margin: '6px 0 0' }}>
                  Tenés {activos.length} premios tildados y en la placa entran {MAX_PREMIOS_PLACA}: salen los de más puntos.
                </p>
              )}

              <button className="troya-btn" onClick={descargarPlaca} disabled={generando} style={{ margin: '16px 0' }}>
                {generando ? 'Generando...' : 'Descargar placa (PNG)'}
              </button>

              <div style={{ overflowX: 'auto' }}>
                <PlacaPremios
                  innerRef={placaRef}
                  titulo={tituloPlaca}
                  mensaje={mensajePlaca}
                  aclaracion={ACLARACION}
                  mes={mesPlaca}
                  premios={premiosPlaca}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ PESTAÑA 3: SALDOS ============ */}
      {pestana === 'saldos' && (
        <div>
          <p style={{ fontSize: 14, margin: '0 0 14px' }}>
            <strong>Puntos ganados con las compras de {mesAnteriorNombre}</strong>, canjeables durante {mesActualNombre}. No se acumulan.
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
      )}
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
          <div style={{ background: '#DA231F', padding: '8px 30px', borderRadius: '0 26px 26px 0', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
            {mes}
          </div>
          <img src="/logo/logo_troya_blanco_transparente.png" alt="Troya" crossOrigin="anonymous" style={{ height: 34 }} />
        </div>
      </div>
    </div>
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