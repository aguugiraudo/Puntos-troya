import './globals.css';
import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'Puntos Troya',
  description: 'Gestión del programa comercial Puntos Troya',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <nav className="troya-nav">
          <Image
            src="/logo/logo_troya_blanco_transparente.png"
            alt="Troya"
            width={110}
            height={36}
            className="troya-nav-logo"
            style={{ width: 'auto', height: '28px' }}
          />
          <Link href="/">Inicio</Link>
          <Link href="/clientes">Clientes</Link>
          <Link href="/activos">Puntos Troya Activos</Link>
          <Link href="/prospectos">Prospectos</Link>
        </nav>
        <main className="troya-main">{children}</main>
      </body>
    </html>
  );
}
