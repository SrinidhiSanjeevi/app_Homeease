import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/authFetch.js", "src/utils/**/*.js"],
      exclude: ["**/*.test.js"]
    }
  },
  server: {
    port: 3001,
    proxy: {
      // Admin management endpoints — the admin microservice.
      "/api/admin": {
        target: "http://localhost:5001",
        changeOrigin: true,
        secure: false
      },
      "/api/auth": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false
      }
    }
  }
});
