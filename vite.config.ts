import { defineConfig } from 'vite';

// GitHub Pages serves a project site from /<repo-name>/, so production builds
// need that base path; dev stays at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bot-league/' : '/',
  build: {
    target: 'es2022',
  },
}));
