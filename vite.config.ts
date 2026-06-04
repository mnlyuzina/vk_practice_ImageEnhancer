import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib';

  if (isLib) {
    return {
      plugins: [dts({ rollupTypes: true })],
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'ImageEnhancer',
          formats: ['es', 'umd'],
          fileName: (format) =>
            format === 'es' ? 'image-enhancer.js' : 'image-enhancer.umd.cjs',
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: false,
          },
        },
        sourcemap: true,
        target: 'es2022',
      },
    };
  }

  return {
    base: '/vk_practice_ImageEnhancer/',
    root: 'demo',
    publicDir: '../public',
    build: {
      outDir: '../dist-demo',
      emptyOutDir: true,
      target: 'es2022',
    },
    worker: {
      format: 'es',
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  };
});
