// src/index.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("Critical Failure: Root element not found.");
} else {
  /**
   * ✅ GH Pages + HashRouter hardening
   * If anything lands on https://freelanceos.org/ (no hash),
   * force it to https://freelanceos.org/#/
   *
   * This prevents “throttling navigation” loops caused by hard redirects
   * that accidentally drop the hash.
   */
  try {
    const isProd = import.meta.env.PROD;

    if (isProd) {
      const { hash, pathname, search } = window.location;

      // If there is no hash at all, force "#/" without changing origin.
      if (!hash || hash === "#") {
        const base = `${pathname}${search}`;
        // replace() avoids adding history entries
        window.location.replace(`${base}#/`);
      }
    }
  } catch (e) {
    // Don't block boot if env parsing fails for any reason
    console.warn("[Boot hash guard] skipped:", e);
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}