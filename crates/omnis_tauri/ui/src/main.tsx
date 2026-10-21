import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
import "./index.css";

// Prevent default webview context menu globally to eliminate browser inspect / reload menu
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Disable developer shortcuts (F12, Ctrl+Shift+I/J/C, F5, Ctrl+R, Ctrl+U)
document.addEventListener("keydown", (e) => {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) ||
    (e.ctrlKey && (e.key === "r" || e.key === "R" || e.key === "u" || e.key === "U")) ||
    e.key === "F5"
  ) {
    e.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
