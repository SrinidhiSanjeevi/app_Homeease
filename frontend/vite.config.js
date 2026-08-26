import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // More specific path MUST come first — /api/admin needs to hit
      // admin-backend (port 5001), not the customer backend (port 5000).
      "/api/admin": {
        target: "http://localhost:5001",
        changeOrigin: true,
        secure: false
      },
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false
      }
    }
  }
});