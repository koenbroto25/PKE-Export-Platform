import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const apiTarget = env.PKE_API_ORIGIN || 'http://127.0.0.1:3000';
    return {
        plugins: [react()],
        server: {
            host: '0.0.0.0',
            port: 3001,
            strictPort: true,
            proxy: {
                '/api/v1': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
        build: {
            outDir: 'dist',
            sourcemap: false,
            emptyOutDir: true,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes('/node_modules/@neondatabase/')) return 'vendor-neon-auth';
                        if (id.includes('/node_modules/lucide-react/')) return 'vendor-icons';
                        if (id.includes('/node_modules/zod/')) return 'vendor-validation';
                        if (/\/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id)) return 'vendor-react';
                    },
                },
            },
        },
    };
});
