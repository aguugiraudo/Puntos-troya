import './globals.css';
import { Space_Grotesk, Inter } from 'next/font/google';
import TroyaNav from '@/components/TroyaNav';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
});

export const metadata = {
  title: 'Puntos Troya',
  description: 'Gestión del programa comercial Puntos Troya',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <TroyaNav />
        <main className="troya-main">{children}</main>
      </body>
    </html>
  );
}