/**
 * Marco Extension — Unified Options Entry Point
 *
 * Mounts the shared options UI used in both preview and Chrome extension.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import OptionsPage from "../pages/Options";
import { ThemeProvider } from "../components/theme/ThemeProvider";
import { ErrorBoundary } from "../components/ErrorBoundary";
import "../index.css";

const root = document.getElementById("root");

if (root) {
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <ThemeProvider>
                <ErrorBoundary section="Options Root">
                    <OptionsPage />
                </ErrorBoundary>
            </ThemeProvider>
        </React.StrictMode>,
    );
}
