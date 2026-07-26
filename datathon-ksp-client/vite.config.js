import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/server/datathon-ksp-app": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
