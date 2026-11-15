import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    dir: "./src",
    exclude: ["src/integration/**", "src/test-db/**"],
  },
});