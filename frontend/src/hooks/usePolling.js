import { useEffect, useRef } from "react";

// Calls `callback` every `intervalMs` while the tab is visible, and right
// away when the tab regains focus — so lists stay live without a manual
// refresh, and background tabs don't hammer the API.
export default function usePolling(callback, intervalMs, enabled = true) {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const run = () => {
      if (document.visibilityState === "visible") saved.current();
    };
    const id = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [intervalMs, enabled]);
}
