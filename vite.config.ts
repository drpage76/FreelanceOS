import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Use relative base to ensure it works on subfolders (like GitHub Pages) and custom domains
  base: './', 
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ""),
    'process.env': {} 
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
          ui: ['recharts', 'jspdf', 'html2canvas']
        }
      }
    }
  }
});