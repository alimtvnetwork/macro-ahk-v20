import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export const ThemeToggle = forwardRef<HTMLButtonElement>(function ThemeToggle(_props, ref) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      ref={ref}
      size="icon"
      variant="ghost"
      onClick={toggle}
      className="h-8 w-8 relative overflow-hidden hover:bg-primary/15 hover:text-primary transition-all duration-200"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <div key="sun" className="absolute inset-0 flex items-center justify-center anim-icon-swap">
          <Sun className="h-4 w-4 text-amber-400" />
        </div>
      ) : (
        <div key="moon" className="absolute inset-0 flex items-center justify-center anim-icon-swap">
          <Moon className="h-4 w-4 text-indigo-400" />
        </div>
      )}
    </Button>
  );
});
