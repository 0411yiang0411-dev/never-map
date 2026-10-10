import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/fonts', { recursive: true });
await cp('node_modules/@excalidraw/excalidraw/dist/prod/fonts', 'dist/fonts', { recursive: true });
await cp('THIRD-PARTY-NOTICES.md', 'dist/THIRD-PARTY-NOTICES.txt');
