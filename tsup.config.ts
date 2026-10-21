import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  target: "node18",
  splitting: false,
  sourcemap: false,
  shims: true,
  external: ["vite", "figlet"],
  outDir: "dist",
});
