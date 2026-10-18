// The radar's own ESLint config (KJC-TSK-1095). It replaces the eslint.config.js
// kj harden seeded, which had no TypeScript parser and broke every .ts/.tsx file once
// next 15 brought ESLint 9 (KJC-BUG-0376). Next's own rules (what next lint applied
// before) plus the method's, over TypeScript too; kj harden leaves an existing
// eslint.config.mjs alone.
import { FlatCompat } from "@eslint/eslintrc";
import tsParser from "@typescript-eslint/parser";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2025,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-var": "error",
      "no-eval": "error",
      "no-new-func": "error",
      "no-restricted-globals": [
        "error",
        { name: "alert", message: "Use the app modal, not alert()." },
        { name: "confirm", message: "Use the app modal, not confirm()." },
        { name: "prompt", message: "Use the app modal, not prompt()." },
        { name: "escape", message: "Use encodeURIComponent()." },
        { name: "unescape", message: "Use decodeURIComponent()." },
        { name: "event", message: "Use the handler parameter, not window.event." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "document", property: "write", message: "Use DOM nodes / Blob URLs, not document.write." },
        { object: "document", property: "writeln", message: "Use DOM nodes, not document.writeln." },
        { property: "substr", message: "Use slice() or substring(), not substr()." },
      ],
    },
  },
];
