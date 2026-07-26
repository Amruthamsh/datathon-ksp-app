import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/server": {
        target:
          "https://project-rainfall-60073558955.development.catalystserverless.in",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  // For `vite preview` / production preview
  preview: {
    proxy: {
      "/server": {
        target:
          "https://project-rainfall-60073558955.development.catalystserverless.in",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
