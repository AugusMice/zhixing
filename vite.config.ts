import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 截图用的无头浏览器配置目录很大，别让 Vite 监听它，否则会反复触发整页刷新
    watch: { ignored: ['**/.edge-profile/**', '**/shots/**', '**/.tmp-esbuild/**', '**/work/**'] },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 题库会持续增长，把不会随内容变化的依赖单独切出来，
        // 这样更新题库时只失效一个 chunk，其余走缓存。
        manualChunks(id: string) {
          if (id.includes('node_modules/katex')) return 'katex';
          if (id.includes('node_modules/marked')) return 'marked';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
