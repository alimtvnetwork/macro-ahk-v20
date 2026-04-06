import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {},
});

const STORAGE_KEY = "marco_theme";

/** Reads theme from chrome.storage.local or falls back to localStorage. */
async function readStoredTheme(): Promise<Theme | null> {
  const win = globalThis as any;
  const isChromeAvailable =
    win.chrome !== undefined && win.chrome.storage !== undefined;

  if (isChromeAvailable) {
    const result = await win.chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? null;
  }

  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? null;
}

/** Writes theme to chrome.storage.local or falls back to localStorage. */
async function writeStoredTheme(theme: Theme): Promise<void> {
  const win = globalThis as any;
  const isChromeAvailable =
    win.chrome !== undefined && win.chrome.storage !== undefined;

  if (isChromeAvailable) {
    await win.chrome.storage.local.set({ [STORAGE_KEY]: theme });
    return;
  }

  localStorage.setItem(STORAGE_KEY, theme);
}

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    void readStoredTheme().then((stored) => {
      const resolved = stored ?? "dark";
      setTheme(resolved);
      applyThemeClass(resolved);
    });
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      applyThemeClass(next);
      void writeStoredTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
