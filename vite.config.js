import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Keep public/sounds/index.json in sync with the files the user drops in.
function soundIndex() {
  const root = process.cwd();
  const soundsDir = path.resolve(root, "public/sounds");
  const script = path.resolve(root, "scripts/index-sounds.mjs");
  const rebuild = () => {
    spawnSync(process.execPath, [script], { cwd: root, stdio: "ignore" });
  };
  return {
    name: "bluechat-sound-index",
    configureServer(server) {
      rebuild();
      server.watcher.add(soundsDir);
      const onChange = (file) => {
        if (file.startsWith(soundsDir) && /\.(mp3|wav|ogg|oga|m4a|aac|webm|flac|aiff|opus)$/i.test(file)) {
          rebuild();
        }
      };
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
    buildStart() {
      rebuild();
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), soundIndex()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
