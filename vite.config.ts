import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // If you deploy under a subpath, set base accordingly.
  // For normal root hosting (freelanceos.org), this is fine:
  base: "/",

  server: {
    port: 5173,
    strictPort: false,
  },

  preview: {
    port: 4173,
    strictPort: false,
  },
});
