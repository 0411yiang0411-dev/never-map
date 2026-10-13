import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {stablePenRenderer} from './scripts/stable-pen-renderer.mjs';
export default defineConfig({ plugins: [stablePenRenderer() as any,react()], cacheDir: '.cache/vite' });
