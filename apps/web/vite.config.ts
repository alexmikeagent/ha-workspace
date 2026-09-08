import { Config, Effect } from "effect"
import { defineConfig, lazyPlugins } from "vite-plus"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig(() => {
  // Build/dev composition boundary. Doppler injects values; no dotenv files.
  const config = Effect.runSync(
    Config.all({
      appName: Config.nonEmptyString("VITE_APP_NAME"),
      host: Config.literals(["127.0.0.1", "localhost"], "HOST"),
      port: Config.port("PORT"),
      apiPort: Config.port("API_PORT"),
    }),
  )
  return {
    envDir: false as const,
    resolve: { tsconfigPaths: true },
    server: {
      host: config.host,
      port: config.port,
      strictPort: true,
      proxy: { "/api": { target: `http://127.0.0.1:${config.apiPort}`, changeOrigin: false } },
    },
    plugins: lazyPlugins(() => [tailwindcss(), tanstackStart(), viteReact()]),
  }
})
