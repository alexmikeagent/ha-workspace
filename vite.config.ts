import { defineConfig } from "vite-plus"

export default defineConfig({
  defaultPackage: "./apps/web",
  lint: {
    plugins: ["typescript", "react", "jsx-a11y"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    options: { typeAware: true, typeCheck: true },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-floating-promises": "error",
    },
    ignorePatterns: [
      "**/dist/**",
      "**/routeTree.gen.ts",
      "**/confect/_generated/**",
      "**/convex/_generated/**",
      "**/convex/_generated*.ts",
      "docs/architecture/*.mts",
      "docs/architecture/*.tsx",
    ],
    overrides: [
      {
        files: ["packages/domain/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                "@ha/*",
                "@workspace/*",
                "@confect/*",
                "@effect/platform-*",
                "node:*",
                "react",
                "convex/*",
              ],
            },
          ],
        },
      },
      {
        files: ["packages/application/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                "@ha/backend*",
                "@ha/documents*",
                "@workspace/*",
                "@confect/*",
                "@effect/platform-*",
                "node:*",
                "react",
                "convex/*",
              ],
            },
          ],
        },
      },
      {
        files: ["apps/web/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                "@ha/documents*",
                "@ha/backend/local-auth",
                "@confect/server",
                "@confect/cli",
                "@effect/platform-bun",
                "node:*",
              ],
            },
          ],
        },
      },
    ],
  },
  fmt: {
    semi: false,
    singleQuote: false,
    printWidth: 100,
    ignorePatterns: [
      "**/dist/**",
      "**/node_modules/**",
      "**/routeTree.gen.ts",
      "**/confect/_generated/**",
      "**/convex/_generated/**",
      "packages/backend/convex/**/*.ts",
      "bun.lock",
    ],
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
})
