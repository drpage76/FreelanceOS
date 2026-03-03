// index.tsx (project root)
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("Critical Failure: Root element not found.");
} else {
  ReactDOM.createRoot(rootElement).render(
    // TEMP: removing StrictMode helps when an effect loop is being triggered twice
    <App />
  );
}