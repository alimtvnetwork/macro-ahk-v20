/**
 * Marco Extension — Unified Popup Entry Point
 *
 * Mounts the shared popup UI used in both preview and Chrome extension.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import PopupPage from "../pages/Popup";
import { ThemeProvider } from "../components/theme/ThemeProvider";
import "../index.css";

const root = document.getElementById("root");

if (root) {
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <ThemeProvider>
                <PopupPage />
            </ThemeProvider>
        </React.StrictMode>,
    );
}
