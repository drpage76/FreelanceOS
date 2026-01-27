
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Matches your GitHub repo name exactly
  base: '/FreelanceOS/', 
  server: {
    port: 3000,
    open: true
  },
  define: {
    // Inject the API key safely
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
