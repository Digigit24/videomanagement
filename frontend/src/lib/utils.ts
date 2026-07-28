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

/**
 * Origin context captured when a video is opened from a workspace view, so the
 * video detail page can send the user back exactly where they came from.
 */
export interface VideoOrigin {
  bucket?: string;
  folderId?: string | null;
  view?: string;
}

/** URL param value for a view ("kanban" is shown to users as "Board"). */
export function viewToParam(view: string | null | undefined): string | null {
  if (!view) return null;
  return view === "kanban" ? "board" : view;
}

/** Parse a view URL param back into the internal view name. */
export function paramToView(
  value: string | null | undefined,
): "list" | "kanban" | "calendar" | null {
  if (value === "board" || value === "kanban") return "kanban";
  if (value === "list" || value === "calendar") return value;
  return null;
}

/**
 * Path to a video detail page, carrying the origin (folder + view) as query
 * params. Query params are used alongside React Router navigation state so the
 * back button still works after a full page reload or a shared/bookmarked URL.
 */
export function buildVideoDetailPath(
  bucket: string,
  videoId: string,
  origin?: VideoOrigin,
): string {
  const params = new URLSearchParams();
  if (origin?.folderId) params.set("folderId", origin.folderId);
  const view = viewToParam(origin?.view);
  if (view) params.set("view", view);
  const qs = params.toString();
  return `/workspace/${bucket}/video/${videoId}${qs ? `?${qs}` : ""}`;
}

/** Path back to a workspace, restoring the folder and view the user was in. */
export function buildWorkspacePath(bucket: string, origin?: VideoOrigin): string {
  const params = new URLSearchParams();
  if (origin?.folderId) params.set("folder", origin.folderId);
  const view = viewToParam(origin?.view);
  if (view) params.set("view", view);
  const qs = params.toString();
  return `/workspace/${bucket}${qs ? `?${qs}` : ""}`;
}

/** URL param value for a status filter ("Under Review" -> "under-review"). */
export function statusToParam(status: string | null | undefined): string | null {
  if (!status || status === "all") return null;
  return status.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Parse a status URL param back into an exact status value, matched against the
 * canonical status list so an unknown/stale param falls back to "all".
 */
export function paramToStatus(
  value: string | null | undefined,
  statuses: readonly string[],
): string {
  if (!value) return "all";
  const match = statuses.find(s => statusToParam(s) === value.toLowerCase());
  return match || "all";
}
