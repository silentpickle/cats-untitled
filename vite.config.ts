import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works from any folder (itch.io serves from a subpath).
  base: "./",
  test: { include: ["src/**/*.test.ts"] },
});
