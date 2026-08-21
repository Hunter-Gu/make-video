import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: ".",
  plugins: [react(), tailwindcss()],
  server: {port: 4318, proxy: {"/api": "http://127.0.0.1:4317", "/media": "http://127.0.0.1:4317"}},
  build: {outDir: "dist", emptyOutDir: true},
});
