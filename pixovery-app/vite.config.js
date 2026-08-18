import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Pixovery — configuration Vite
//
// base: '/'            -> domaine personnalise www.pixovery.com (GitHub Pages).
//                         NE PAS mettre '/pixovery/' : cela casserait tous les
//                         chemins d'images du site.
// publicDir: 'public'  -> tout ce qui est dans public/ est copie tel quel dans
//                         dist/, sans traitement, sans renommage, sans hash.
//                         C'est ce qui garantit que 'assets/img01.webp' reste
//                         exactement 'assets/img01.webp' en production.
// assetsInlineLimit: 0 -> aucun fichier n'est transforme en base64. On garde
//                         des fichiers, comme aujourd'hui.

export default defineConfig({
  plugins: [react()],
  base: '/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    host: true,
  },
})
