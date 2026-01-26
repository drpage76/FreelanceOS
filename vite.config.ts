
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Updated base to match your repo name for GitHub Pages
  base: '/FreelanceOS/', 
  server: {
    port: 3000,
    open: true
  },
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    'process.env': {} 
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
