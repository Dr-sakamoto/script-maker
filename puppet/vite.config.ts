import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` は1枚のHTMLに全部を埋め込む（配布・プレビュー用）
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  css: { postcss: {} },
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  test: { environment: 'node' },
}));
