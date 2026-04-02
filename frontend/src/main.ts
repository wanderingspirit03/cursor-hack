import Phaser from 'phaser';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { App } from './ui/App';
import { createGameConfig } from './game/config';
import { WebSocketBackendService } from './services/WebSocketBackend';

export const backend = new WebSocketBackendService();

const appRoot = document.getElementById('app')!;
const root = createRoot(appRoot);
root.render(createElement(App, { backend }));

function bootPhaser() {
  const gameContainer = document.getElementById('game-container');
  if (!gameContainer) {
    setTimeout(bootPhaser, 50);
    return;
  }

  const config = createGameConfig('game-container');
  new Phaser.Game(config);
}

bootPhaser();
backend.connect().catch(() => {});
