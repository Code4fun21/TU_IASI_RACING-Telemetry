import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL, // e.g. http://localhost:8080 or Fly.io URL
});