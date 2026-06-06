import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { readColorSchemePreference } from "./preferences/colorScheme";
import { applyColorScheme } from "./theme";

applyColorScheme(readColorSchemePreference());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
