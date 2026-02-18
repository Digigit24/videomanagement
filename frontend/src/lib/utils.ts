import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { API_BASE_URL } from "./api"; // Ensure this path is correct based on your file structure

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getApiUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;

  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // API_BASE_URL usually includes /api (e.g. http://localhost:5000/api)
  // If cleanPath starts with /api (e.g. /api/logo/...), we should strip /api from base

  if (cleanPath.startsWith("/api")) {
    const baseUrl = API_BASE_URL.replace(/\/api\/?$/, "");
    return `${baseUrl}${cleanPath}`;
  }

  // If cleanPath does NOT start with /api, we append it to API_BASE_URL
  // API_BASE_URL is expected to have /api at the end, so we just concatenate
  // But if API_BASE_URL doesn't have /api (e.g. user config), we might need to handle.
  // Ideally API_BASE_URL should be consistent.
  // Let's assume API_BASE_URL *points to the API root*.

  return `${API_BASE_URL}${cleanPath}`;
}
