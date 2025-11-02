import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/_api": {
        target: "http://localhost:8080", // your FastAPI dev server
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_api/, ""),
        ws: true, // proxy websockets too
      },
    },
  },
});
