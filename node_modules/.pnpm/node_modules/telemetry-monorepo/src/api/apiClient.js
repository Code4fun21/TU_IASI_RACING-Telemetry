// frontend/src/api/apiClient.js
import axios from "axios";

const apiClient = axios.create({
  // In prod (Cloudflare Pages), this is same-origin and hits the Functions proxy.
  // In dev, Vite proxies "/_api" to your FastAPI (we'll set this in vite.config).
  baseURL: "/_api",
  // Optional: add a timeout if you want
  // timeout: 20000,
});

// If you need auth headers later, re-enable your interceptor here.

export default apiClient;
