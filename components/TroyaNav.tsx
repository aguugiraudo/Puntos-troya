'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

const ITEMS = [
  { href: '/', label: 'Inicio', icon: IconInicio, modulos: null as string[] | null, soloDueno: false },
  { href: '/clientes', label: 'Clientes', icon: IconClientes, modulos: ['clientes'], soloDueno: false },
  { href: '/activos', label: 'Activos', icon: IconActivos, modulos: ['activos'], soloDueno: false },
  { href: '/prospectos', label: 'Prospectos', icon: IconProspectos, modulos: ['prospectos'], soloDueno: false },
  { href: '/comercial', label: 'Comercial', icon: IconComercial, modulos: ['costos_precios', 'promos', 'stock'], soloDueno: false },
  { href: '/mas', label: 'Más', icon: IconMas, modulos: null, soloDueno: false },
];

export default function TroyaNav() {
  const pathname = usePathname();
  const { puedeVer, usuario, cerrarSesion } = useAuth();

  const itemsVisibles = ITEMS.filter((item) => {
    if (item.soloDueno) return usuario?.es_dueno;
    if (item.modulos) return item.modulos.some((m) => puedeVer(m));
    return true;
  });

  function esActivo(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <>
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
          {itemsVisibles.map((item) => (
            <Link key={item.href} href={item.href} className={esActivo(item.href) ? 'activo' : ''}>
              {item.label}
            </Link>
          ))}
          <button onClick={cerrarSesion} style={{ background: 'none', border: 'none', color: '#EFE8E1', fontSize: 13, cursor: 'pointer', opacity: 0.75 }}>
            {usuario?.nombre} · Salir
          </button>
        </nav>
      </header>

      <nav className="troya-bottomnav">
        {itemsVisibles.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={esActivo(item.href) ? 'activo' : ''}>
              <Icon />
              <span>{item.label}</span>
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
function IconClientes() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" />
      <path d="M16.5 6.5a3 3 0 010 6" />
      <path d="M19 20c0-2.9-1.7-5.1-4-5.9" />
    </svg>
  );
}
function IconActivos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c1 3-1.5 3.5-1.5 6 0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" />
      <path d="M12 2c3 3.5-2 5-2 9a5 5 0 1010 0c0-2.5-1.5-3.5-2.5-5" />
    </svg>
  );
}
function IconProspectos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
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
function IconMas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}