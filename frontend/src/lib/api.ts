import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "https://video.celiyo.com/api";

export const APP_URL =
  import.meta.env.VITE_APP_URL || "https://videomanagement.celiyo.com";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

/**
 * Extract a user-friendly error message from an API error.
 * Works with Axios errors (server response) and plain Error objects.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (typeof err === "object" && err !== null) {
    const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
    if (axiosErr.response?.data?.error) return axiosErr.response.data.error;
    if (axiosErr.message) return axiosErr.message;
  }
  return fallback;
}

export default api;
