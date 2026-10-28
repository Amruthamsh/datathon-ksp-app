import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
// Temporary: proxy straight to standalone uvicorn for a screenshot check.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5199, proxy: { "/api": { target: "http://localhost:8765", rewrite: (p) => p.replace(/^\/api/, "") } } },
});
