"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (offline app shell for the Field tab and homeowner portal) and asks it to
 * cache this page plus the JS/CSS it already loaded, so the page opens with no signal next time.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (cancelled) return;
        const assets = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin + "/_next/static/"));
        reg.active?.postMessage({ type: "warm", urls: [location.pathname + location.search, ...assets] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
