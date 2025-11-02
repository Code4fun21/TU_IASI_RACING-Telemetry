import axios from "axios";

const apiClient = axios.create({
  baseURL: "http://localhost:8080/",
  // baseURL: "http://127.0.0.1:8000/",
});

// apiClient.interceptors.request.use((config) => {
//   if (!config.skipAuth) {
//     const token = JSON.parse(localStorage.getItem("token")).token;
//     if (token) {
//       config.headers.Authorization = token;
//     }
//     return config;
//   }
//   return config;
// });

export default apiClient;
