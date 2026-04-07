/**
 * Theme Provider — Dark-only mode with CSS injection validation.
 *
 * The extension always uses the dark theme. No toggle, no persistence needed.
 * The `dark` class is set in HTML files and reinforced here on mount.
 *
 * A hidden sentinel element (`#marco-css-sentinel`) is injected into the DOM.
 * If CSS loaded correctly, the sentinel gets `display: none` via the CSS rule
 * in index.css. If not, it remains visible (display: block) and we show a
 * diagnostic toast so the user knows CSS failed to inject.
 */
import { createContext, useContext, useEffect } from "react";
import { toast } from "sonner";

type Theme = "dark";

interface ThemeContextValue {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark" });

const SENTINEL_ID = "marco-css-sentinel";

/** Ensures the `dark` class is on <html> at all times. */
function enforceDarkClass() {
  const root = document.documentElement;
  if (!root.classList.contains("dark")) {
    root.classList.add("dark");
  }
  root.classList.remove("light");
}

/**
 * Injects a hidden sentinel element and checks if CSS applied `display: none`.
 * If not, CSS failed to load — applies emergency inline dark styles and warns.
 */
function validateCssInjection() {
  let sentinel = document.getElementById(SENTINEL_ID);

  if (!sentinel) {
    sentinel = document.createElement("div");
    sentinel.id = SENTINEL_ID;
    sentinel.style.position = "fixed";
    sentinel.style.pointerEvents = "none";
    sentinel.style.width = "0";
    sentinel.style.height = "0";
    document.body.appendChild(sentinel);
  }

  // Give the browser a frame to apply styles
  requestAnimationFrame(() => {
    const computed = window.getComputedStyle(sentinel!);
    const isCssLoaded = computed.display === "none";

    if (!isCssLoaded) {
      console.error(
        "[ThemeProvider] CSS injection FAILED — sentinel #" + SENTINEL_ID +
        " has display:" + computed.display + " instead of none. " +
        "index.css may not be bundled or linked correctly."
      );

      // Apply emergency dark background so the page isn't white
      applyEmergencyDarkStyles();

      toast.error(
        "⚠️ CSS failed to load — dark theme may not display correctly. " +
        "Try hard-refreshing (Ctrl+Shift+R).",
        { duration: 15000 }
      );
    }
  });
}

/** Emergency inline fallback when CSS fails to inject. */
function applyEmergencyDarkStyles() {
  const root = document.documentElement;
  root.style.setProperty("--background", "224 28% 8%");
  root.style.setProperty("--foreground", "220 14% 92%");
  root.style.setProperty("--card", "224 24% 12%");
  root.style.setProperty("--card-foreground", "220 14% 92%");
  root.style.setProperty("--primary", "268 70% 60%");
  root.style.setProperty("--primary-foreground", "0 0% 100%");
  root.style.setProperty("--border", "224 18% 18%");
  root.style.setProperty("--muted", "224 18% 16%");
  root.style.setProperty("--muted-foreground", "220 10% 58%");
  root.style.setProperty("--secondary", "224 18% 18%");
  root.style.setProperty("--secondary-foreground", "220 14% 92%");

  document.body.style.backgroundColor = "hsl(224, 28%, 8%)";
  document.body.style.color = "hsl(220, 14%, 92%)";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    enforceDarkClass();
    validateCssInjection();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
