import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "skipped", "v1.72.3-working-code"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      sonarjs,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "no-var": "error",
      "@typescript-eslint/no-restricted-types": ["warn", {
        types: {
          unknown: {
            message: "Use a specific type instead of `unknown`. Define an interface or use a concrete type.",
          },
        },
      }],

      // --- SonarJS: Code smells & complexity ---
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/no-duplicate-string": ["warn", { threshold: 4 }],
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/no-redundant-boolean": "warn",
      "sonarjs/no-unused-collection": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/no-unused-function-argument": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/prefer-immediate-return": "warn",
      "sonarjs/no-small-switch": "warn",
      "sonarjs/no-gratuitous-expressions": "warn",
      "sonarjs/no-nested-template-literals": "warn",

      // --- Function size (matches 25-line standard) ---
      "max-lines-per-function": ["warn", {
        max: 25,
        skipBlankLines: true,
        skipComments: true,
      }],
    },
  },
  // --- Overrides: suppress known-safe patterns ---
  {
    files: ["standalone-scripts/**/*.{ts,tsx}"],
    rules: {
      // no-explicit-any enforced here too — no exceptions
    },
  },
  {
    files: ["standalone-scripts/macro-controller/src/**/*.ts"],
    rules: {
      "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}", "standalone-scripts/**/src/__tests__/**/*.{ts,tsx}", "chrome-extension/tests/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "max-lines-per-function": "off",
      "sonarjs/no-duplicate-string": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-restricted-types": "off",
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}", "src/components/theme/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // --- Build configs & generated files — disable function size ---
  {
    files: ["vite.config*.ts", "chrome-extension/vite.config.ts", "src/test/snapshots/**/*.{ts,tsx}"],
    rules: {
      "max-lines-per-function": "off",
    },
  },
  // --- React components with JSX — raise to 50 ---
  {
    files: ["src/components/**/*.tsx", "src/pages/**/*.tsx", "src/options/**/*.tsx", "src/popup/**/*.tsx"],
    rules: {
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
    },
  },
  // --- Background handlers & content scripts — raise to 40 ---
  {
    files: ["src/background/**/*.ts", "src/content-scripts/**/*.ts", "src/hooks/**/*.ts", "src/lib/**/*.ts", "src/platform/**/*.ts"],
    ignores: ["**/__tests__/**"],
    rules: {
      "max-lines-per-function": ["warn", { max: 40, skipBlankLines: true, skipComments: true }],
    },
  },
  // --- Platform files — unknown ban enforced as error (fully cleaned) ---
  {
    files: ["src/platform/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-types": ["error", {
        types: {
          unknown: {
            message: "Use a specific type instead of `unknown`. Define an interface or use a concrete type.",
          },
        },
      }],
    },
  },
  // --- Standalone scripts (non-controller) — raise to 50 ---
  {
    files: ["standalone-scripts/**/src/**/*.ts"],
    ignores: ["standalone-scripts/**/src/__tests__/**"],
    rules: {
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["skipped/**/*.{js,ts}"],
    rules: {
      // Archived / inactive scripts — skip all linting
    },
  },
);
