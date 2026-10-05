'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

type Pestana = { href: string; label: string; modulo: string };

type Seccion = {
  id: string;
  label: string;
  corto: string;
  icon: () => JSX.Element;
  pestanas: Pestana[];
  soloAdmin?: boolean;
};

const SECCIONES: Seccion[] = [
  { id: 'inicio', label: 'Inicio', corto: 'Inicio', icon: IconInicio, pestanas: [] },
  {
    id: 'puntos',
    label: 'Puntos Troya',
    corto: 'Puntos Troya',
    icon: IconPuntos,
    pestanas: [
      { href: '/prospectos', label: 'Prospectos', modulo: 'prospectos' },
      { href: '/activos', label: 'Activos', modulo: 'activos' },
      { href: '/mas/puntos-canje', label: 'Puntos y canje', modulo: 'puntos_canje' },
      { href: '/clientes', label: 'Clientes', modulo: 'clientes' },
      { href: '/mapa', label: 'Mapa', modulo: 'mapa' },
      { href: '/mas/placas', label: 'Placas', modulo: 'placas' },
    ],
  },
  {
    id: 'comercial',
    label: 'Gestión comercial',
    corto: 'Comercial',
    icon: IconComercial,
    pestanas: [
      { href: '/comercial/cotizador', label: 'Cotizador', modulo: 'cotizador' },
      { href: '/comercial/costos-precios', label: 'Costos y precios', modulo: 'costos_precios' },
      { href: '/comercial/promos', label: 'Promos', modulo: 'promos' },
      { href: '/comercial/stock', label: 'Stock', modulo: 'stock' },
      { href: '/mas/minimos-distribuidor', label: 'Mínimos 44%', modulo: 'minimos_distribuidor' },
    ],
  },
  {
    id: 'admin',
    label: 'Administración',
    corto: 'Admin',
    icon: IconAdmin,
    soloAdmin: true,
    pestanas: [{ href: '/mas/accesos', label: 'Accesos', modulo: 'accesos' }],
  },
];

const CSS = `
.tn-wrap { position: sticky; top: 0; z-index: 20; }
.tn-wrap .troya-topbar { position: relative; }
.tn-tabs {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding: 0 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  scrollbar-width: none;
}
.tn-tabs::-webkit-scrollbar { display: none; }
.tn-tab {
  flex: 0 0 auto;
  padding: 13px 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  text-decoration: none;
  white-space: nowrap;
  border-bottom: 3px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.tn-tab:hover { color: var(--ink); }
.tn-tab.activo { color: var(--red); border-bottom-color: var(--red); }
.tn-salir-mobile {
  background: none;
  border: none;
  color: #EFE8E1;
  font-size: 12.5px;
  opacity: 0.75;
  cursor: pointer;
}
@media (min-width: 768px) {
  .tn-tabs { padding: 0 24px; }
  .tn-tab { padding: 14px 18px; font-size: 14.5px; }
  .tn-salir-mobile { display: none; }
}
@media (min-width: 1024px) {
  .tn-tabs { padding: 0 40px; }
}
`;

function esRuta(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function TroyaNav() {
  const pathname = usePathname();
  const { puedeVer, usuario, cerrarSesion } = useAuth();
  const esAdmin = !!usuario?.es_dueno;

  // Cada sección muestra solo las pestañas que el usuario tiene habilitadas
  const secciones = SECCIONES.map((s) => {
    const visibles = s.soloAdmin ? (esAdmin ? s.pestanas : []) : s.pestanas.filter((p) => puedeVer(p.modulo));
    const href = s.id === 'inicio' ? '/' : visibles[0]?.href ?? '';
    return { ...s, visibles, href };
  }).filter((s) => s.id === 'inicio' || s.visibles.length > 0);

  const idActiva =
    pathname === '/' ? 'inicio' : SECCIONES.find((s) => s.pestanas.some((p) => esRuta(pathname, p.href)))?.id ?? '';
  const activa = secciones.find((s) => s.id === idActiva);

  return (
    <>
      <style>{CSS}</style>

      <div className="tn-wrap">
        <header className="troya-topbar">
          <Image
            src="/logo/logo_troya_blanco_transparente.png"
            alt="Troya"
            width={110}
            height={36}
            className="troya-topbar-logo"
            style={{ width: 'auto', height: '24px' }}
          />
          <nav className="troya-topbar-links" style={{ alignItems: 'center' }}>
            {secciones.map((s) => (
              <Link key={s.id} href={s.href} className={s.id === idActiva ? 'activo' : ''}>
                {s.label}
              </Link>
            ))}
            <button
              onClick={cerrarSesion}
              style={{ background: 'none', border: 'none', color: '#EFE8E1', fontSize: 13, cursor: 'pointer', opacity: 0.75 }}
            >
              {usuario?.nombre} · Salir
            </button>
          </nav>
          <button className="tn-salir-mobile" onClick={cerrarSesion}>
            Salir
          </button>
        </header>

        {activa && activa.id !== 'inicio' && activa.visibles.length > 0 && (
          <nav className="tn-tabs" aria-label={activa.label}>
            {activa.visibles.map((p) => (
              <Link key={p.href} href={p.href} className={`tn-tab ${esRuta(pathname, p.href) ? 'activo' : ''}`}>
                {p.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <nav className="troya-bottomnav">
        {secciones.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.id} href={s.href} className={s.id === idActiva ? 'activo' : ''}>
              <Icon />
              <span>{s.corto}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function IconInicio() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function IconPuntos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c1 3-1.5 3.5-1.5 6 0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" />
      <path d="M12 2c3 3.5-2 5-2 9a5 5 0 1010 0c0-2.5-1.5-3.5-2.5-5" />
    </svg>
  );
}

function IconComercial() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}