import axios from "axios";
import { useAuthStore } from "../stores/authStore";

const baseURL = import.meta.env.VITE_API_URL || "/api";

const apiClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

const refreshClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          throw new Error("No refresh token");
        }

        const { data } = await refreshClient.post("/auth/token/refresh/", {
          refresh: refreshToken,
        });

        useAuthStore.getState().setTokens(data.access, data.refresh);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return apiClient(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
