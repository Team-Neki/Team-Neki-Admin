import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".openai/**",
    ".product-design/**",
    ".lazyweb/**",
    "dist/**",
    "vite.config.ts",
    "worker/**",
    "worker-configuration.d.ts",
    "next-env.d.ts",
  ]),
  {
    files: ["app/admin/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/AdminApp", "@/app/admin/features/**"],
            message: "Feature 내부에서는 app shell 또는 다른 feature의 내부 경로를 import하지 마세요.",
          },
        ],
      }],
    },
  },
  {
    files: ["app/admin/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/AdminApp", "**/features/**"],
            message: "Shared 모듈은 app shell이나 feature에 의존할 수 없습니다.",
          },
        ],
      }],
    },
  },
]);

export default eslintConfig;
