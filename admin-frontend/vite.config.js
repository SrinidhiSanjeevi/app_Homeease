import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      // Admin management endpoints — the admin microservice.
      "/api/admin": {
        target: "http://localhost:5001",
        changeOrigin: true,
        secure: false
      },
      // Login + MFA verification live on the shared auth backend, not
      // admin-backend — this is the only customer-backend route this
      // app needs.
      "/api/auth": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false
      }
    }
  }
});
