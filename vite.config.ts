import { defineConfig } from "vite"
import { vitePluginFasterLoop } from "./ts-plugins.vite/faster-loops.vite"
import { tsClosureHoisterPlugin } from "./ts-plugins.vite/hoist-pure-functions.vite"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vitePluginFasterLoop(), tsClosureHoisterPlugin()],
  build: {
    target: false,
    outDir: "build",
    sourcemap: true,
    emptyOutDir: true,
    lib: {
      entry: "./src/index.ts",
      formats: ["es"],
      fileName: "index"
    }
  }
})
