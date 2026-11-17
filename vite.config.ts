import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works from any folder (GitHub Pages serves it from /cats-untitled/).
  base: "./",
  test: { include: ["src/**/*.test.ts"] },
});
