import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles.css';
import './styles-exam.css';
import './styles-texts.css';
import { App } from './App';
import { AppProvider } from './state/AppState';

const root = document.getElementById('root');
if (!root) throw new Error('找不到 #root 挂载点');

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

// 离线外壳：仅在生产构建中注册，避免开发时缓存干扰热更新
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[知星] Service Worker 注册失败：', err);
    });
  });
}
