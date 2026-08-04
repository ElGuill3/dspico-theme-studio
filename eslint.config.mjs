import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/.vite/**", "dist/**", "out/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
