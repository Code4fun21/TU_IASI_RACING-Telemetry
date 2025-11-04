// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";   // <-- use SWC plugin you already installed
import tailwind from "@tailwindcss/vite";       // <-- Tailwind v4 plugin

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
  ],
  server: {
    proxy: {
      "/_api": {
        target: "https://tuiasi-telemetry-api.fly.dev",       // FastAPI port
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_api/, ""),
        ws: true,                               // important for Socket.IO / WS
      },
    },
  },
});
