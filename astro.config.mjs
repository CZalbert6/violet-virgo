// astro.config.mjs - VERSIÓN CORRECTA para GitHub Pages
import { defineConfig } from 'astro/config';

export default defineConfig({
  // ¡IMPORTANTE! Tu URL de GitHub Pages
  site: 'https://czalbert6.github.io',
  
  // ¡IMPORTANTE! Nombre de tu repositorio
  base: '/violet-virgo',
  
  // Static output para GitHub Pages
  output: 'static',
  
  // Configuración adicional
  build: {
    format: 'directory'
  }
});