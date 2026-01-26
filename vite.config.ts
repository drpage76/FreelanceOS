
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Ensures assets load correctly on GitHub Pages
  server: {
    port: 3000,
    open: true
  },
  define: {
    'process.env': {} // Provides a fallback for process.env in the browser
  }
});
