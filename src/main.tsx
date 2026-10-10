import React from 'react';
import {createRoot} from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import './style.css';
import './cloud.css';
import Workspace from './workspace';
(window as any).EXCALIDRAW_ASSET_PATH='/';
createRoot(document.getElementById('root')!).render(<Workspace/>);
