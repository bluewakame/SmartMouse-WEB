import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Receiver と同じ PC から `npm run preview` で LAN 配信することを想定している。
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    target: "es2020",
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
