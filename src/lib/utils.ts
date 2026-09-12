import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relativeTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const mins = Math.round(seconds / 60);
  const hours = Math.round(mins / 60);
  const days = Math.round(hours / 24);
  if (seconds < 60) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
