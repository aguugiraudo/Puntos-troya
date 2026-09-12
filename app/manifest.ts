import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Puntos Troya',
    short_name: 'Puntos Troya',
    description: 'Gestión del programa comercial Puntos Troya',
    start_url: '/',
    display: 'standalone',
    background_color: '#FBF9F6',
    theme_color: '#1C1512',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}