import './browser-compat';
import React,{useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import './style.css';
import './cloud.css';
import Workspace from './workspace';
import {registerOfflineShell} from './offline-shell';
(window as any).EXCALIDRAW_ASSET_PATH='/';
function Ready(){useEffect(()=>{(window as any).neverMapBootComplete=true;},[]);return <Workspace/>;}
class LoadBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<div style={{padding:24}}><h2>画布未能完成加载</h2><p>本机画布数据仍保留。请点击重试，或打开加载检测页面。</p><button onClick={()=>location.reload()}>重新加载</button><a href="/connection-check.html">加载检测</a></div>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<LoadBoundary><Ready/></LoadBoundary>);
registerOfflineShell();
