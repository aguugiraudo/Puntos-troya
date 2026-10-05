'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const MODULO = 'puntos_canje';
const BUCKET = 'archivos-puntos-troya';
const LS_KEY = 'puntos_troya_firma_mail';
const MAX_PREMIOS_PLACA = 6;
const ORDEN_CATEGORIAS = ['Fogoneros', 'Accesorios Fogoneros', 'Hornos', 'Estufas'];
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
type Filtro = 'todos' | 'con_puntos' | 'sin_avisar' | 'sin_canjear' | 'canjearon';

type ItemCatalogo = {
  id: string;
  nombre: string;
  puntos_requeridos: number;
  producto_id: string | null;
  codigo: string | null;
  costo_manual: number | null;
  foto_url: string | null;
};

type PremioMes = {
  id: string;
  mes: string;
  catalogo_canje_id: string | null;
  nombre: string;
  codigo: string | null;
  puntos: number;
};

type ProductoBase = {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
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
  premiosCanjeados: string[];
  avisadoEn: string | null;
};

type PremioPlaca = {
  id: string;
  codigo: string | null;
  nombre: string;
  puntos: number;
  foto_url: string | null;
  auto: number | null;
};

type FilaPremio = {
  key: string;
  producto: ProductoBase | null;
  item: ItemCatalogo | null;
  seleccion: PremioMes | null;
  nombre: string;
  codigo: string | null;
  categoria: string;
  precioPT: number | null;
  autoPuntos: number | null;
  puntos: number | null;
  costo: number;
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

function cap(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function badgeRent(v: number) {
  const color = v < 0 ? 'var(--red)' : v < 15 ? '#8A6D00' : '#2E7D32';
  const bg = v < 0 ? 'var(--tint-red)' : v < 15 ? '#FFF3CD' : '#E3F3E4';
  return (
    <span style={{ background: bg, color, padding: '2px 7px', borderRadius: 7, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
      {v.toFixed(1)}%
    </span>
  );
}

async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
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
  const { puedeVer, puedeEditar, usuario } = useAuth();
  const puedeVerModulo = puedeVer(MODULO);
  const puedeEditarModulo = puedeEditar(MODULO);
  const puedeVerCostos = puedeVer('costos_precios');
  const puedeVerStock = puedeVer('stock');

  const hoy = new Date();

  const [pestana, setPestana] = useState<Pestana>('premios');
  const [cargando, setCargando] = useState(true);

  // Mes que se está viendo (rige los tres pasos)
  const [mesSel, setMesSel] = useState<{ a: number; m: number }>({ a: new Date().getFullYear(), m: new Date().getMonth() });
  const esMesActual = mesSel.a === hoy.getFullYear() && mesSel.m === hoy.getMonth();
  const mesSelISO = mesISO(new Date(mesSel.a, mesSel.m, 1));
  const mesSigISO = mesISO(new Date(mesSel.a, mesSel.m + 1, 1));
  const mesSelNombre = MESES[mesSel.m];
  const mesPrevNombre = MESES[(mesSel.m + 11) % 12];
  const editable = puedeEditarModulo && esMesActual;

  // Parámetros del programa
  const [montoPorPunto, setMontoPorPunto] = useState(100000);
  const [montoEdit, setMontoEdit] = useState('100000');
  const [porcentaje, setPorcentaje] = useState(5);
  const [porcentajeEdit, setPorcentajeEdit] = useState('5');
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  // Datos
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [premiosMes, setPremiosMes] = useState<PremioMes[]>([]);
  const [productos, setProductos] = useState<ProductoBase[]>([]);
  const [listaTroya, setListaTroya] = useState<ListaTroya | null>(null);
  const [stockPorProducto, setStockPorProducto] = useState<Record<string, StockFila>>({});
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  const [subiendoKey, setSubiendoKey] = useState<string | null>(null);

  // Placa
  const [tituloPlaca, setTituloPlaca] = useState('BENEFICIOS PUNTO TROYA');
  const [mensajePlaca, setMensajePlaca] = useState('¡Felicitaciones por tus Puntos Troya! Canjealos por uno de estos premios.');
  const [mesPlaca, setMesPlaca] = useState(() => MESES[new Date().getMonth()].toUpperCase());
  const [generando, setGenerando] = useState(false);
  const placaRef = useRef<HTMLDivElement>(null);

  // Saldos, avisos y canjes
  const [saldos, setSaldos] = useState<SaldoCliente[]>([]);
  const [cargandoSaldos, setCargandoSaldos] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [canjeandoId, setCanjeandoId] = useState<string | null>(null);
  const [itemSeleccionado, setItemSeleccionado] = useState('');
  const [copiadoClave, setCopiadoClave] = useState('');

  // Firma del mail (la completa quien envía; queda en este navegador)
  const [remitente, setRemitente] = useState('');
  const [cargo, setCargo] = useState('');

  async function cargarTodo() {
    setCargando(true);

    const { data: configData } = await supabase
      .from('configuracion')
      .select('clave, valor')
      .in('clave', ['monto_por_punto', 'porcentaje_premios']);
    const cfg: Record<string, string> = {};
    (configData ?? []).forEach((c: any) => { cfg[c.clave] = c.valor; });

    const monto = cfg.monto_por_punto ? Number(cfg.monto_por_punto) : 100000;
    setMontoPorPunto(monto);
    setMontoEdit(String(monto));
    const pct = cfg.porcentaje_premios ? Number(cfg.porcentaje_premios) : 5;
    setPorcentaje(pct);
    setPorcentajeEdit(String(pct));

    const { data: catalogoData } = await supabase.from('catalogo_canje').select('*').order('puntos_requeridos');
    setCatalogo(catalogoData ?? []);

    const { data: productosData } = await supabase
      .from('productos')
      .select('id, nombre, codigo, categoria, costo_completo, precio_lista')
      .order('nombre');
    setProductos(productosData ?? []);

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

    setCargando(false);
  }

  // Premios elegidos para el mes que se está viendo
  async function cargarPremiosMes() {
    const { data } = await supabase
      .from('premios_mes')
      .select('*')
      .eq('mes', mesSelISO)
      .order('puntos', { ascending: false });
    setPremiosMes(data ?? []);
  }

  // Saldos del mes elegido: los puntos son los de las compras del mes anterior,
  // se canjean durante el mes elegido y no se acumulan.
  async function cargarSaldos() {
    setCargandoSaldos(true);

    const mesPrevISO = mesISO(new Date(mesSel.a, mesSel.m - 1, 1));

    const { data: puntosData } = await supabase
      .from('puntos_troya')
      .select('id, clientes(nombre, localidad, provincia)')
      .eq('estado', 'confirmado');

    const { data: comprasData } = await supabase
      .from('compras_mensuales')
      .select('punto_troya_id, monto, mes')
      .eq('mes', mesPrevISO);
    const compradoPrev: Record<string, number> = {};
    (comprasData ?? []).forEach((c: any) => {
      compradoPrev[c.punto_troya_id] = (compradoPrev[c.punto_troya_id] ?? 0) + Number(c.monto);
    });

    const { data: canjesData } = await supabase
      .from('canjes')
      .select('punto_troya_id, puntos_utilizados, nombre_producto, fecha')
      .gte('fecha', mesSelISO)
      .lt('fecha', mesSigISO);
    const canjeado: Record<string, number> = {};
    const premios: Record<string, string[]> = {};
    (canjesData ?? []).forEach((c: any) => {
      canjeado[c.punto_troya_id] = (canjeado[c.punto_troya_id] ?? 0) + c.puntos_utilizados;
      premios[c.punto_troya_id] = [...(premios[c.punto_troya_id] ?? []), c.nombre_producto];
    });

    const { data: avisosData } = await supabase
      .from('avisos_puntos')
      .select('punto_troya_id, enviado_en')
      .eq('mes', mesSelISO);
    const avisos: Record<string, string> = {};
    (avisosData ?? []).forEach((a: any) => { avisos[a.punto_troya_id] = a.enviado_en; });

    const calculados: SaldoCliente[] = ((puntosData as any) ?? []).map((p: any) => {
      const puntosGanados = montoPorPunto > 0 ? Math.floor((compradoPrev[p.id] ?? 0) / montoPorPunto) : 0;
      const puntosCanjeados = canjeado[p.id] ?? 0;
      return {
        punto_troya_id: p.id,
        nombre: p.clientes?.nombre ?? '',
        localidad: p.clientes?.localidad ?? null,
        provincia: p.clientes?.provincia ?? null,
        puntosGanados,
        puntosCanjeados,
        saldo: Math.max(0, puntosGanados - puntosCanjeados),
        premiosCanjeados: premios[p.id] ?? [],
        avisadoEn: avisos[p.id] ?? null,
      };
    });

    setSaldos(calculados);
    setCargandoSaldos(false);
  }

  useEffect(() => {
    if (puedeVerModulo) cargarTodo();
  }, [puedeVerModulo]);

  useEffect(() => {
    if (puedeVerModulo) {
      cargarPremiosMes();
      cargarSaldos();
    }
  }, [puedeVerModulo, mesSel.a, mesSel.m, montoPorPunto]);

  useEffect(() => {
    setMesPlaca(MESES[mesSel.m].toUpperCase());
  }, [mesSel.m]);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(LS_KEY);
      if (guardado) {
        const o = JSON.parse(guardado);
        setRemitente(o.nombre ?? '');
        setCargo(o.cargo ?? '');
        return;
      }
    } catch {
      // sin acceso al almacenamiento del navegador: se completa a mano
    }
    setRemitente(usuario?.nombre ?? '');
  }, [usuario?.nombre]);

  function cambiarMes(delta: number) {
    const f = new Date(mesSel.a, mesSel.m + delta, 1);
    const limite = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    if (f > limite) return;
    setMesSel({ a: f.getFullYear(), m: f.getMonth() });
    setCanjeandoId(null);
  }

  // ---------- Firma y mail ----------
  function guardarFirma(nombre: string, cargoNuevo: string) {
    setRemitente(nombre);
    setCargo(cargoNuevo);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ nombre, cargo: cargoNuevo }));
    } catch {
      // si no se puede guardar, igual sigue funcionando en esta sesión
    }
  }

  function textoMail(s: SaldoCliente): string {
    const n = s.puntosGanados;
    const plural = n !== 1;
    const mesActual = cap(mesSelNombre);
    return `Estimado/a Socio Estratégico Punto Troya, ${s.nombre}

Le saluda ${remitente.trim()}, ${cargo.trim()} de la Unidad Troya.

¡Felicidades! Quiero informarle personalmente que su fidelidad y volumen de compra durante el mes pasado han sido recompensados.

ACUMULACIÓN DE BENEFICIOS TROYA:
${plural ? 'Estos' : 'Este'} ${n} ${plural ? 'Beneficios' : 'Beneficio'} ${plural ? 'representan' : 'representa'} su recompensa por las compras realizadas en la Unidad Troya el mes pasado, calculados bajo nuestro esquema de fidelidad: "acumula 1 beneficio por cada $${montoPorPunto.toLocaleString('es-AR')} facturados (sin IVA)".
${plural ? 'Estos' : 'Este'} ${n} ${plural ? 'Puntos' : 'Punto'} ${plural ? 'están disponibles' : 'está disponible'} exclusivamente para ser ${plural ? 'canjeados' : 'canjeado'} en su próximo pedido de este mes, sumándose al beneficio de su descuento fijo.

¿Cómo canjear sus Beneficios?

- Revise nuestro Catálogo de Canje Exclusivo de ${mesActual} adjunto.
- Contacte a su viajante/ejecutivo de ventas para realizar su pedido.
- Indique qué premio desea canjear de la tabla al momento de formalizar su compra.

¡IMPORTANTE! 🚨

Para asegurar la gestión de nuestro inventario y la dinámica de la alianza, le recordamos que ${plural ? 'estos puntos caducarán' : 'este punto caducará'} automáticamente al finalizar ${mesActual} si no realiza un canje.
No pierda la oportunidad de llevar mercadería adicional para su local.
¡Esperamos su pedido!

Saludos cordiales,
${remitente.trim()}
${cargo.trim()}`;
  }

  async function copiarMail(s: SaldoCliente) {
    if (!remitente.trim() || !cargo.trim()) {
      alert('Completá tu nombre y tu cargo en la Firma del mail (arriba) antes de copiar el mail.');
      return;
    }
    const ok = await copiarAlPortapapeles(textoMail(s));
    if (!ok) {
      alert('No se pudo copiar automáticamente. Probá de nuevo o recargá la página.');
      return;
    }
    setCopiadoClave(`mail-${s.punto_troya_id}`);
    setTimeout(() => setCopiadoClave(''), 2000);
  }

  async function copiarAsuntoGeneral() {
    const ok = await copiarAlPortapapeles(`¡Felicitaciones! Sus Beneficios Troya de ${cap(mesSelNombre)}`);
    if (!ok) {
      alert('No se pudo copiar automáticamente.');
      return;
    }
    setCopiadoClave('asunto');
    setTimeout(() => setCopiadoClave(''), 2000);
  }

  async function toggleAviso(s: SaldoCliente) {
    if (s.avisadoEn) {
      const { error } = await supabase.from('avisos_puntos').delete().eq('punto_troya_id', s.punto_troya_id).eq('mes', mesSelISO);
      if (error) {
        alert('Error al actualizar el aviso: ' + error.message);
        return;
      }
      setSaldos((prev) => prev.map((x) => (x.punto_troya_id === s.punto_troya_id ? { ...x, avisadoEn: null } : x)));
    } else {
      const { error } = await supabase.from('avisos_puntos').insert({ punto_troya_id: s.punto_troya_id, mes: mesSelISO });
      if (error) {
        alert('Error al registrar el aviso: ' + error.message);
        return;
      }
      const ahora = new Date().toISOString();
      setSaldos((prev) => prev.map((x) => (x.punto_troya_id === s.punto_troya_id ? { ...x, avisadoEn: ahora } : x)));
    }
  }

  // Casilla "Puntos canjeados": al tildar pide qué premio se llevó; al destildar borra el canje de ese mes
  async function toggleCanje(s: SaldoCliente) {
    if (!editable) return;

    if (s.puntosCanjeados > 0) {
      const confirmado = confirm(`¿Desmarcar el canje de ${s.nombre}? Se borra el registro (${s.premiosCanjeados.join(', ')}) de ${mesSelNombre}.`);
      if (!confirmado) return;
      const { error } = await supabase
        .from('canjes')
        .delete()
        .eq('punto_troya_id', s.punto_troya_id)
        .gte('fecha', mesSelISO)
        .lt('fecha', mesSigISO);
      if (error) {
        alert('No se pudo desmarcar el canje: ' + error.message);
        return;
      }
      setCanjeandoId(null);
      cargarSaldos();
      return;
    }

    if (canjeandoId === s.punto_troya_id) {
      setCanjeandoId(null);
      return;
    }

    if (s.saldo <= 0) return;

    if (premiosMes.filter((pm) => pm.puntos <= s.saldo).length === 0) {
      alert('Ningún premio del mes alcanza con los puntos de este cliente. Revisá la selección de premios en el paso 1.');
      return;
    }

    setCanjeandoId(s.punto_troya_id);
    setItemSeleccionado('');
  }

  async function confirmarCanje(puntoTroyaId: string) {
    const pm = premiosMes.find((p) => p.id === itemSeleccionado);
    if (!pm) return;

    const { error } = await supabase.from('canjes').insert({
      punto_troya_id: puntoTroyaId,
      catalogo_canje_id: pm.catalogo_canje_id,
      nombre_producto: pm.nombre,
      puntos_utilizados: pm.puntos,
    });

    if (error) {
      alert('Error al registrar el canje: ' + error.message);
      return;
    }

    setCanjeandoId(null);
    cargarSaldos();
  }

  // ---------- Cálculo automático de puntos ----------
  const valorPunto = montoPorPunto * (porcentaje / 100);

  function precioPuntoTroya(p: ProductoBase): number | null {
    if (!listaTroya || !p.precio_lista || p.precio_lista <= 0) return null;
    return p.precio_lista * (1 - listaTroya.descuento_porcentaje / 100);
  }

  function autoPuntosDe(p: ProductoBase): number | null {
    const precio = precioPuntoTroya(p);
    if (precio === null || valorPunto <= 0) return null;
    return Math.max(1, Math.round(precio / valorPunto));
  }

  // Rentabilidad promedio de las ventas a Punto Troya, calculada desde Costos y Precios
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

  async function guardarConfig() {
    setGuardandoConfig(true);
    const filas = [
      { clave: 'monto_por_punto', valor: montoEdit || '100000', descripcion: 'Pesos de compra sin IVA necesarios para sumar 1 punto' },
      { clave: 'porcentaje_premios', valor: porcentajeEdit || '5', descripcion: 'Porcentaje de la venta destinado a premios; define el valor de cada punto y los puntos automaticos de cada premio' },
    ];
    const { error } = await supabase.from('configuracion').upsert(filas, { onConflict: 'clave' });
    setGuardandoConfig(false);
    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }
    cargarTodo();
  }

  async function togglePremio(fila: FilaPremio) {
    if (!esMesActual) return;

    // Si ya estaba elegido este mes, se quita
    if (fila.seleccion) {
      const sel = fila.seleccion;
      const { error } = await supabase.from('premios_mes').delete().eq('id', sel.id);
      if (error) {
        alert('Error al actualizar: ' + error.message);
        return;
      }
      setPremiosMes((prev) => prev.filter((p) => p.id !== sel.id));
      return;
    }

    // Si no, primero se asegura que exista en la biblioteca de premios
    let itemFinal: ItemCatalogo;
    if (fila.item) {
      itemFinal = fila.item;
    } else {
      if (!fila.producto) return;
      if (fila.autoPuntos === null) {
        alert('Este producto no tiene precio de lista cargado en Costos y Precios, por eso no se pueden calcular sus puntos. Cargalo y volvé a intentar.');
        return;
      }
      const { data, error } = await supabase
        .from('catalogo_canje')
        .insert({
          nombre: fila.producto.nombre,
          producto_id: fila.producto.id,
          codigo: fila.producto.codigo,
          puntos_requeridos: fila.autoPuntos,
          costo_manual: null,
        })
        .select('*')
        .single();
      if (error || !data) {
        alert('Error al agregar el premio: ' + (error?.message ?? 'desconocido'));
        return;
      }
      const nuevoItem = data as ItemCatalogo;
      itemFinal = nuevoItem;
      setCatalogo((prev) => [...prev, nuevoItem]);
    }

    // Y se elige para el mes que se está viendo
    const puntos = fila.autoPuntos ?? itemFinal.puntos_requeridos;
    const { data: pm, error: errorPm } = await supabase
      .from('premios_mes')
      .insert({
        mes: mesSelISO,
        catalogo_canje_id: itemFinal.id,
        nombre: itemFinal.nombre,
        codigo: itemFinal.codigo,
        puntos,
      })
      .select('*')
      .single();
    if (errorPm || !pm) {
      alert('Error al elegir el premio: ' + (errorPm?.message ?? 'desconocido'));
      return;
    }
    const nuevoPm = pm as PremioMes;
    setPremiosMes((prev) => [...prev, nuevoPm].sort((a, b) => b.puntos - a.puntos));
  }

  async function cambiarFoto(fila: FilaPremio, archivo: File | undefined) {
    if (!archivo) return;
    setSubiendoKey(fila.key);
    try {
      const url = await subirFoto(archivo);

      if (fila.item) {
        const item = fila.item;
        const { error } = await supabase.from('catalogo_canje').update({ foto_url: url }).eq('id', item.id);
        if (error) throw new Error(error.message);
        setCatalogo((prev) => prev.map((i) => (i.id === item.id ? { ...i, foto_url: url } : i)));
      } else if (fila.producto) {
        const { data, error } = await supabase
          .from('catalogo_canje')
          .insert({
            nombre: fila.producto.nombre,
            producto_id: fila.producto.id,
            codigo: fila.producto.codigo,
            puntos_requeridos: fila.autoPuntos ?? 1,
            costo_manual: null,
            foto_url: url,
          })
          .select('*')
          .single();
        if (error || !data) throw new Error(error?.message ?? 'desconocido');
        setCatalogo((prev) => [...prev, data as ItemCatalogo]);
      }
    } catch (err: any) {
      alert('No se pudo subir la foto: ' + err.message);
    } finally {
      setSubiendoKey(null);
    }
  }

  async function quitarPremioLibre(item: ItemCatalogo) {
    const confirmado = confirm(`¿Quitar "${item.nombre}" de la lista de premios?`);
    if (!confirmado) return;
    const { error } = await supabase.from('catalogo_canje').delete().eq('id', item.id);
    if (error) {
      alert('No se pudo quitar: ' + error.message);
      return;
    }
    setCatalogo((prev) => prev.filter((i) => i.id !== item.id));
    cargarPremiosMes();
  }

  async function guardarPuntosPlaca(id: string, input: HTMLInputElement) {
    const pm = premiosMes.find((p) => p.id === id);
    if (!pm) return;
    const puntos = Math.round(Number(input.value));
    if (!puntos || puntos <= 0) {
      input.value = String(pm.puntos);
      return;
    }
    if (puntos === pm.puntos) return;

    const { error } = await supabase.from('premios_mes').update({ puntos }).eq('id', id);
    if (error) {
      alert('Error al guardar los puntos: ' + error.message);
      input.value = String(pm.puntos);
      return;
    }
    setPremiosMes((prev) => prev.map((p) => (p.id === id ? { ...p, puntos } : p)).sort((a, b) => b.puntos - a.puntos));
  }

  async function restablecerPuntos() {
    const confirmado = confirm('¿Recalcular los puntos de los premios elegidos con el porcentaje actual? Se pierden los ajustes manuales.');
    if (!confirmado) return;

    for (const pm of premiosMes) {
      const item = pm.catalogo_canje_id ? catalogo.find((c) => c.id === pm.catalogo_canje_id) : undefined;
      const prod = item?.producto_id ? productos.find((x) => x.id === item.producto_id) : undefined;
      const auto = prod ? autoPuntosDe(prod) : null;
      if (auto === null || auto === pm.puntos) continue;
      const { error } = await supabase.from('premios_mes').update({ puntos: auto }).eq('id', pm.id);
      if (error) {
        alert('Error al recalcular: ' + error.message);
        return;
      }
    }
    cargarPremiosMes();
  }

  async function descargarPlaca() {
    if (!placaRef.current) return;
    setGenerando(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(placaRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.download = `placa-puntos-troya-${(mesPlaca || 'mes').toLowerCase()}-${mesSel.a}.png`;
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

  // ---------- Filas del listado de premios ----------
  const itemPorProducto: Record<string, ItemCatalogo> = {};
  catalogo.forEach((c) => {
    if (c.producto_id) itemPorProducto[c.producto_id] = c;
  });

  const seleccionPorItem: Record<string, PremioMes> = {};
  premiosMes.forEach((pm) => {
    if (pm.catalogo_canje_id) seleccionPorItem[pm.catalogo_canje_id] = pm;
  });

  const filasProducto: FilaPremio[] = productos.map((p) => {
    const item = itemPorProducto[p.id] ?? null;
    const seleccion = item ? seleccionPorItem[item.id] ?? null : null;
    const autoPuntos = autoPuntosDe(p);
    return {
      key: p.id,
      producto: p,
      item,
      seleccion,
      nombre: p.nombre,
      codigo: p.codigo,
      categoria: p.categoria || 'Sin categoría',
      precioPT: precioPuntoTroya(p),
      autoPuntos,
      puntos: seleccion ? seleccion.puntos : autoPuntos,
      costo: p.costo_completo ?? 0,
    };
  });

  const filasLibres: FilaPremio[] = catalogo
    .filter((c) => !c.producto_id)
    .map((c) => {
      const seleccion = seleccionPorItem[c.id] ?? null;
      return {
        key: c.id,
        producto: null,
        item: c,
        seleccion,
        nombre: c.nombre,
        codigo: c.codigo,
        categoria: 'Otros premios',
        precioPT: null,
        autoPuntos: null,
        puntos: seleccion ? seleccion.puntos : c.puntos_requeridos,
        costo: c.costo_manual ?? 0,
      };
    });

  const texto = busquedaCatalogo.trim().toLowerCase();
  const filasFiltradas = [...filasProducto, ...filasLibres].filter(
    (f) => !texto || f.nombre.toLowerCase().includes(texto) || (f.codigo ?? '').toLowerCase().includes(texto)
  );

  const ordenCat = (c: string) => {
    if (c === 'Otros premios') return 1000;
    const i = ORDEN_CATEGORIAS.indexOf(c);
    return i === -1 ? 998 : i;
  };

  const grupos: { categoria: string; items: FilaPremio[] }[] = [];
  [...filasFiltradas]
    .sort((a, b) => ordenCat(a.categoria) - ordenCat(b.categoria) || a.nombre.localeCompare(b.nombre))
    .forEach((f) => {
      let g = grupos.find((x) => x.categoria === f.categoria);
      if (!g) {
        g = { categoria: f.categoria, items: [] };
        grupos.push(g);
      }
      g.items.push(f);
    });

  const premiosOrdenados = [...premiosMes].sort((a, b) => b.puntos - a.puntos);
  const premiosPlaca: PremioPlaca[] = premiosOrdenados.slice(0, MAX_PREMIOS_PLACA).map((pm) => {
    const item = pm.catalogo_canje_id ? catalogo.find((c) => c.id === pm.catalogo_canje_id) : undefined;
    const prod = item?.producto_id ? productos.find((x) => x.id === item.producto_id) : undefined;
    return {
      id: pm.id,
      codigo: pm.codigo,
      nombre: pm.nombre,
      puntos: pm.puntos,
      foto_url: item?.foto_url ?? null,
      auto: prod ? autoPuntosDe(prod) : null,
    };
  });

  const columnas: { key: string; w: number }[] = [
    { key: 'sel', w: 9 },
    { key: 'foto', w: 9 },
    { key: 'producto', w: 28 },
    ...(puedeVerCostos ? [{ key: 'precio', w: 11 }] : []),
    { key: 'pts', w: 8 },
    ...(puedeVerCostos ? [{ key: 'costo', w: 10 }, { key: 'rent', w: 12 }] : []),
    ...(puedeVerStock ? [{ key: 'sraf', w: 8 }, { key: 'scl', w: 8 }] : []),
  ];
  const totalAncho = columnas.reduce((acc, c) => acc + c.w, 0);
  const anchoCol = (key: string) => `${(((columnas.find((c) => c.key === key)?.w ?? 0) / totalAncho) * 100).toFixed(2)}%`;

  // ---------- Saldos: filtros y contadores ----------
  const conPuntos = saldos.filter((s) => s.puntosGanados > 0);
  const filtros: { id: Filtro; label: string; n: number }[] = [
    { id: 'todos', label: 'Todos', n: saldos.length },
    { id: 'con_puntos', label: 'Con puntos', n: conPuntos.length },
    { id: 'sin_avisar', label: 'Mail pendiente', n: conPuntos.filter((s) => !s.avisadoEn).length },
    { id: 'sin_canjear', label: 'Sin canjear', n: conPuntos.filter((s) => s.puntosCanjeados === 0).length },
    { id: 'canjearon', label: 'Canjearon', n: saldos.filter((s) => s.puntosCanjeados > 0).length },
  ];

  const saldosFiltrados = saldos
    .filter((s) => {
      if (filtro === 'con_puntos') return s.puntosGanados > 0;
      if (filtro === 'sin_avisar') return s.puntosGanados > 0 && !s.avisadoEn;
      if (filtro === 'sin_canjear') return s.puntosGanados > 0 && s.puntosCanjeados === 0;
      if (filtro === 'canjearon') return s.puntosCanjeados > 0;
      return true;
    })
    .filter((s) => {
      const t = busqueda.trim().toLowerCase();
      if (!t) return true;
      return [s.nombre, s.localidad, s.provincia].filter(Boolean).some((c) => c!.toLowerCase().includes(t));
    })
    .sort((a, b) => b.puntosGanados - a.puntosGanados || a.nombre.localeCompare(b.nombre));

  const pestanas: { id: Pestana; label: string }[] = [
    { id: 'premios', label: '1. Selección de premios' },
    ...(puedeEditarModulo ? [{ id: 'placa' as Pestana, label: '2. Placa del mes' }] : []),
    { id: 'saldos', label: puedeEditarModulo ? '3. Saldos y canjes' : 'Saldos' },
  ];

  const configCambio = montoEdit !== String(montoPorPunto) || porcentajeEdit !== String(porcentaje);
  const labelAjuste: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, flexWrap: 'wrap' };

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Puntos y Canje</h1>
          <p className="troya-subtitulo">Programa de premios por compras y saldo de puntos de cada cliente{!puedeEditarModulo && ' · Solo lectura'}</p>
        </div>
      </div>

      {/* SELECTOR DE MES (rige los tres pasos) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <button className="troya-btn troya-btn-secundario" onClick={() => cambiarMes(-1)} title="Mes anterior">←</button>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, minWidth: 180, textAlign: 'center' }}>
          {cap(mesSelNombre)} {mesSel.a}
        </div>
        <button className="troya-btn troya-btn-secundario" onClick={() => cambiarMes(1)} disabled={esMesActual} title="Mes siguiente">→</button>
        {!esMesActual && (
          <button
            className="troya-btn"
            onClick={() => {
              setMesSel({ a: hoy.getFullYear(), m: hoy.getMonth() });
              setCanjeandoId(null);
            }}
          >
            Volver al mes actual
          </button>
        )}
      </div>
      {!esMesActual && (
        <p style={{ color: '#8A6D00', fontSize: 13, margin: '0 0 12px' }}>
          Estás viendo {cap(mesSelNombre)} {mesSel.a}: es un registro de consulta. Los premios, los puntos, los avisos y los canjes de ese mes no se pueden modificar.
        </p>
      )}

      {/* PESTAÑAS */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 22px' }}>
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

      {/* ============ PESTAÑA 1: SELECCIÓN DE PREMIOS ============ */}
      {pestana === 'premios' && (
        <div>
          <p style={{ fontSize: 14, margin: '0 0 14px' }}>
            {esMesActual ? (
              <>
                <strong>Seleccioná los productos que se entregan como premio este mes.</strong> Los puntos de cada uno se calculan automáticamente según el porcentaje definido.
              </>
            ) : (
              <>
                <strong>Premios elegidos en {mesSelNombre}.</strong> Los productos tildados son los que se ofrecieron ese mes, con los puntos que tenían.
              </>
            )}
          </p>

          {/* PARÁMETROS */}
          {editable ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', background: 'var(--tint-orange)', borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
              <label style={labelAjuste}>
                Monto de compra por punto (sin IVA): $
                <input className="troya-input" style={{ flex: '0 0 110px', padding: '7px 10px' }} type="number" value={montoEdit} onChange={(e) => setMontoEdit(e.target.value)} />
              </label>
              <label style={labelAjuste}>
                Porcentaje de la venta destinado a premios:
                <input className="troya-input" style={{ flex: '0 0 70px', padding: '7px 10px' }} type="number" step="0.1" value={porcentajeEdit} onChange={(e) => setPorcentajeEdit(e.target.value)} />
                %
              </label>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Valor de cada punto: {money(valorPunto)}</span>
              {configCambio && (
                <button className="troya-btn" onClick={guardarConfig} disabled={guardandoConfig}>
                  {guardandoConfig ? 'Guardando...' : 'Guardar parámetros'}
                </button>
              )}
            </div>
          ) : (
            <p className="troya-subtitulo" style={{ marginBottom: 8 }}>
              1 punto cada {money(montoPorPunto)} de compra sin IVA. Los puntos se canjean el mes siguiente y no se acumulan.
            </p>
          )}
          {editable && (
            <p className="troya-subtitulo" style={{ margin: '0 0 12px' }}>
              Los premios ya elegidos conservan sus puntos; para recalcularlos con un nuevo porcentaje usá Restablecer puntos en el paso 2.
            </p>
          )}

          {puedeVerCostos && (
            <p style={{ fontSize: 13.5, margin: '0 0 16px' }}>
              Rentabilidad promedio de las ventas a Punto Troya: <strong>{rentBase !== null ? `${rentBase.toFixed(1)}%` : '—'}</strong>
              <span style={{ color: 'var(--muted)' }}>
                {rentBase !== null && listaTroya
                  ? ` (calculada desde Costos y Precios con la lista ${listaTroya.nombre}, ${listaTroya.descuento_porcentaje}% de descuento, sobre ${productosParaRent} productos con costo y precio cargados).`
                  : listaTroya
                    ? ' (todavía no hay productos con costo y precio de lista cargados en Costos y Precios).'
                    : ' (no se encontró la lista Punto Troya en Costos y Precios, por eso no se pueden calcular los puntos automáticos).'}
              </span>
            </p>
          )}

          {/* BUSCADOR + IR A LA PLACA */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div className="troya-buscador" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
              <IconBuscar />
              <input type="text" placeholder="Buscar producto por nombre o código..." value={busquedaCatalogo} onChange={(e) => setBusquedaCatalogo(e.target.value)} />
            </div>
            {puedeEditarModulo && (
              <button className="troya-btn" onClick={() => setPestana('placa')}>
                {esMesActual ? 'Armar placa' : 'Ver placa'} con {premiosMes.length} premio{premiosMes.length === 1 ? '' : 's'} →
              </button>
            )}
          </div>

          {/* TABLA */}
          {filasFiltradas.length === 0 ? (
            <div className="troya-vacio">
              <h3>{productos.length === 0 && catalogo.length === 0 ? 'Todavía no hay productos cargados' : `No hay resultados para “${busquedaCatalogo}”`}</h3>
              {productos.length === 0 && catalogo.length === 0 && <p>Los productos se cargan en Comercial, Costos y Precios.</p>}
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
                    <th>Premio del mes</th>
                    <th>Foto</th>
                    <th>Producto</th>
                    {puedeVerCostos && <th>Precio Punto Troya</th>}
                    <th>Puntos</th>
                    {puedeVerCostos && (
                      <>
                        <th>Costo</th>
                        <th>Rentabilidad neta</th>
                      </>
                    )}
                    {puedeVerStock && (
                      <>
                        <th>Stock Rafaela</th>
                        <th>Stock Centro Log.</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <Fragment key={`cat-${g.categoria}`}>
                      <tr>
                        <td
                          colSpan={columnas.length}
                          style={{ background: 'var(--tint-orange)', color: 'var(--orange)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 }}
                        >
                          {g.categoria}
                        </td>
                      </tr>
                      {g.items.map((f) => {
                        const activo = !!f.seleccion;
                        const sinCosto = f.costo <= 0;
                        const stock = f.producto ? stockPorProducto[f.producto.id] : undefined;
                        let rentNeta: number | null = null;
                        let impacto = 0;
                        if (!sinCosto && f.puntos !== null && rentBase !== null) {
                          const compraNecesaria = f.puntos * montoPorPunto;
                          impacto = compraNecesaria > 0 ? (f.costo / compraNecesaria) * 100 : 0;
                          rentNeta = rentBase - impacto;
                        }
                        const fotoUrl = f.item?.foto_url ?? null;

                        return (
                          <tr key={f.key} style={activo ? { background: '#FFF8F3' } : undefined}>
                            <td>
                              {puedeEditarModulo ? (
                                <input
                                  type="checkbox"
                                  style={{ width: 18, height: 18 }}
                                  checked={activo}
                                  disabled={!esMesActual}
                                  onChange={() => togglePremio(f)}
                                  title="Incluir como premio este mes"
                                />
                              ) : (
                                activo ? '✓' : '—'
                              )}
                            </td>
                            <td>
                              {editable ? (
                                <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Cambiar foto">
                                  {subiendoKey === f.key ? (
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Subiendo...</span>
                                  ) : fotoUrl ? (
                                    <img src={fotoUrl} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid var(--line)' }} />
                                  ) : (
                                    <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>+ Foto</span>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      cambiarFoto(f, e.target.files?.[0]);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              ) : fotoUrl ? (
                                <img src={fotoUrl} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid var(--line)' }} />
                              ) : null}
                            </td>
                            <td>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nombre}>{f.nombre}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                  {f.codigo}
                                  {!f.producto && f.item && editable && (
                                    <button
                                      onClick={() => quitarPremioLibre(f.item as ItemCatalogo)}
                                      style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 11, cursor: 'pointer', marginLeft: 8, padding: 0 }}
                                    >
                                      Quitar
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            {puedeVerCostos && <td>{f.precioPT !== null ? money(f.precioPT) : '—'}</td>}
                            <td>
                              {f.puntos !== null ? (
                                <strong style={{ fontSize: 15 }}>{f.puntos}</strong>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sin precio</span>
                              )}
                            </td>
                            {puedeVerCostos && (
                              <>
                                <td>{sinCosto ? '—' : money(f.costo)}</td>
                                <td title="Rentabilidad promedio de las ventas menos el costo del premio como porcentaje de la compra que lo genera">
                                  {rentNeta !== null ? (
                                    <div>
                                      {badgeRent(rentNeta)}
                                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
                                        {`−${impacto.toFixed(1)} p.p.`}
                                      </div>
                                    </div>
                                  ) : (
                                    '—'
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
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="troya-subtitulo" style={{ marginTop: 10 }}>
            Puntos = precio Punto Troya ÷ valor del punto, redondeado al entero más cercano.
            {puedeVerCostos && ' Rentabilidad neta = rentabilidad promedio de las ventas menos el costo del premio como porcentaje de la compra que lo genera (el impacto, en puntos porcentuales, figura debajo).'}
            {editable && ' Los puntos se pueden ajustar en el paso 2.'}
            {!esMesActual && ' Costos, precios y stock mostrados son los actuales; los puntos y la selección son los de ese mes.'}
          </p>
        </div>
      )}

      {/* ============ PESTAÑA 2: PLACA ============ */}
      {pestana === 'placa' && puedeEditarModulo && (
        <div>
          <p style={{ fontSize: 14, margin: '0 0 6px' }}>
            <strong>{esMesActual ? 'Revisá los textos y los puntos de cada premio, y descargá la imagen.' : `Placa de ${mesSelNombre}: podés volver a descargarla.`}</strong>
          </p>
          {esMesActual && (
            <p className="troya-subtitulo" style={{ margin: '0 0 14px' }}>
              Podés ajustar los puntos (por ejemplo, de 43 a 45 para que queden redondos). El ajuste se guarda y es el que se usa para validar los canjes.
            </p>
          )}

          <div className="troya-form" style={{ paddingTop: 0 }}>
            <input className="troya-input" style={{ flex: '2 1 240px' }} placeholder="Título" value={tituloPlaca} onChange={(e) => setTituloPlaca(e.target.value)} />
            <input className="troya-input" style={{ flex: '3 1 320px' }} placeholder="Mensaje de felicitación" value={mensajePlaca} onChange={(e) => setMensajePlaca(e.target.value)} />
            <input className="troya-input" style={{ flex: '0 0 170px' }} placeholder="Mes (ej: OCTUBRE)" value={mesPlaca} onChange={(e) => setMesPlaca(e.target.value.toUpperCase())} />
          </div>

          {premiosPlaca.length === 0 ? (
            <div className="troya-vacio" style={{ marginTop: 18 }}>
              <h3>{esMesActual ? 'Todavía no hay premios elegidos para este mes' : `No hay premios registrados en ${mesSelNombre}`}</h3>
              {esMesActual && <p>Volvé a la selección y tildá los productos que querés incluir.</p>}
              {esMesActual && <button className="troya-btn" style={{ marginTop: 14 }} onClick={() => setPestana('premios')}>Ir a la selección</button>}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0 10px' }}>
                {premiosPlaca.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 14px', flexWrap: 'wrap' }}>
                    <span style={{ flex: '1 1 200px', fontSize: 14, fontWeight: 600 }}>{p.nombre}</span>
                    {esMesActual && p.auto !== null && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Cálculo automático: {p.auto}</span>}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                      Puntos
                      <input
                        key={`${p.id}-${p.puntos}`}
                        className="troya-input"
                        style={{ width: 80, padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}
                        type="number"
                        defaultValue={p.puntos}
                        disabled={!esMesActual}
                        onBlur={(e) => guardarPuntosPlaca(p.id, e.target)}
                      />
                    </label>
                  </div>
                ))}
              </div>

              {esMesActual && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <button className="troya-btn troya-btn-secundario" onClick={() => setPestana('premios')}>Cambiar premios</button>
                  <button className="troya-btn troya-btn-secundario" onClick={restablecerPuntos}>Restablecer puntos al cálculo automático</button>
                </div>
              )}
              {premiosMes.length > MAX_PREMIOS_PLACA && (
                <p style={{ color: '#8A6D00', fontSize: 13, margin: '6px 0 0' }}>
                  Hay {premiosMes.length} premios elegidos y en la placa entran {MAX_PREMIOS_PLACA}: salen los de más puntos.
                </p>
              )}

              <button className="troya-btn" onClick={descargarPlaca} disabled={generando} style={{ margin: '14px 0 16px' }}>
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

      {/* ============ PESTAÑA 3: SALDOS Y CANJES ============ */}
      {pestana === 'saldos' && (
        <div>
          <p style={{ fontSize: 14, margin: '0 0 12px' }}>
            <strong>Puntos ganados con las compras de {mesPrevNombre}</strong>, canjeables durante {mesSelNombre}. No se acumulan.
          </p>

          {/* FIRMA Y ASUNTO */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', background: 'var(--tint-orange)', borderRadius: 12, padding: '10px 14px', marginBottom: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Firma del mail</span>
            <input className="troya-input" style={{ flex: '1 1 200px', padding: '8px 12px' }} placeholder="Nombre y apellido" value={remitente} onChange={(e) => guardarFirma(e.target.value, cargo)} />
            <input className="troya-input" style={{ flex: '1 1 200px', padding: '8px 12px' }} placeholder="Cargo (ej: Supervisor Comercial)" value={cargo} onChange={(e) => guardarFirma(remitente, e.target.value)} />
            <button className="troya-btn troya-btn-secundario" style={{ padding: '8px 14px', fontSize: 13 }} onClick={copiarAsuntoGeneral}>
              {copiadoClave === 'asunto' ? '¡Copiado!' : 'Copiar asunto'}
            </button>
          </div>
          <p className="troya-subtitulo" style={{ margin: '0 0 16px' }}>La firma se guarda en este navegador. Adjuntá la placa del mes al mail.</p>

          {/* FILTROS Y BUSCADOR */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              {filtros.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setFiltro(f.id)}
                  style={{
                    padding: '9px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                    borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    background: filtro === f.id ? 'var(--red)' : '#fff',
                    color: filtro === f.id ? '#fff' : 'var(--ink)',
                  }}
                >
                  {f.label}
                  <span style={{ marginLeft: 6, fontWeight: 700, opacity: filtro === f.id ? 0.85 : 0.45 }}>{f.n}</span>
                </button>
              ))}
            </div>
            <div className="troya-buscador" style={{ marginBottom: 0, flex: '1 1 220px', maxWidth: 360 }}>
              <IconBuscar />
              <input
                type="text"
                placeholder="Buscar cliente, localidad o provincia..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          {cargandoSaldos ? (
            <p className="troya-subtitulo">Cargando...</p>
          ) : saldos.length === 0 ? (
            <div className="troya-vacio">
              <h3>Todavía no hay Puntos Troya confirmados</h3>
              <p>Cuando haya clientes activos con compras cargadas, su saldo va a aparecer acá.</p>
            </div>
          ) : saldosFiltrados.length === 0 ? (
            <div className="troya-vacio">
              <h3>No hay clientes para este filtro</h3>
              <p>Probá con otro filtro o con otra búsqueda.</p>
            </div>
          ) : (
            <div className="troya-matriz-wrapper">
              <table className="troya-matriz-tabla troya-matriz-tabla--compacta">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '24%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Puntos ganados</th>
                    <th>Mail</th>
                    <th>Mail enviado</th>
                    <th>Puntos canjeados</th>
                  </tr>
                </thead>
                <tbody>
                  {saldosFiltrados.map((s) => (
                    <Fragment key={s.punto_troya_id}>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.nombre}>{s.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[s.localidad, s.provincia].filter(Boolean).join(', ')}
                          </div>
                        </td>
                        <td>
                          <strong style={{ fontSize: 16, color: s.puntosGanados > 0 ? 'var(--ink)' : 'var(--muted)' }}>{s.puntosGanados}</strong>
                        </td>
                        <td>
                          {s.puntosGanados > 0 ? (
                            <button
                              className="troya-btn troya-btn-secundario"
                              style={{ padding: '7px 14px', fontSize: 13 }}
                              onClick={() => copiarMail(s)}
                              title="Copia el mail completo de este cliente para pegarlo en tu correo"
                            >
                              {copiadoClave === `mail-${s.punto_troya_id}` ? '¡Copiado!' : 'Copiar mail'}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {s.puntosGanados > 0 ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: editable ? 'pointer' : 'default' }}>
                              <input
                                type="checkbox"
                                style={{ width: 18, height: 18 }}
                                checked={!!s.avisadoEn}
                                disabled={!editable}
                                onChange={() => toggleAviso(s)}
                              />
                              <span style={{ fontSize: 12.5, color: s.avisadoEn ? '#2E7D32' : 'var(--muted)', fontWeight: 600 }}>
                                {s.avisadoEn ? fechaCorta(s.avisadoEn) : 'Pendiente'}
                              </span>
                            </label>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {s.puntosGanados > 0 || s.puntosCanjeados > 0 ? (
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: editable && (s.puntosCanjeados > 0 || s.saldo > 0) ? 'pointer' : 'default',
                              }}
                            >
                              <input
                                type="checkbox"
                                style={{ width: 18, height: 18 }}
                                checked={s.puntosCanjeados > 0}
                                disabled={!editable || (s.puntosCanjeados === 0 && s.saldo <= 0)}
                                onChange={() => toggleCanje(s)}
                              />
                              <span style={{ fontSize: 12.5, color: s.puntosCanjeados > 0 ? '#2E7D32' : '#8A6D00', fontWeight: 600 }}>
                                {s.puntosCanjeados > 0 ? s.premiosCanjeados.join(', ') : 'Pendiente'}
                              </span>
                            </label>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                      {canjeandoId === s.punto_troya_id && (
                        <tr>
                          <td colSpan={5} style={{ background: 'var(--bg)' }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '6px 2px' }}>
                              <span style={{ fontSize: 13 }}>
                                ¿Qué premio se llevó {s.nombre}? Saldo: <strong>{s.saldo} puntos</strong>
                              </span>
                              <select className="troya-input" style={{ flex: '1 1 240px', padding: '8px 12px' }} value={itemSeleccionado} onChange={(e) => setItemSeleccionado(e.target.value)}>
                                <option value="">Elegir premio del mes...</option>
                                {premiosMes
                                  .filter((pm) => pm.puntos <= s.saldo)
                                  .map((pm) => (
                                    <option key={pm.id} value={pm.id}>{pm.nombre} — {pm.puntos} puntos</option>
                                  ))}
                              </select>
                              <button className="troya-btn" style={{ padding: '8px 16px', fontSize: 13 }} disabled={!itemSeleccionado} onClick={() => confirmarCanje(s.punto_troya_id)}>
                                Confirmar canje
                              </button>
                              <button className="troya-btn troya-btn-secundario" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => setCanjeandoId(null)}>
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
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

function IconBuscar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}