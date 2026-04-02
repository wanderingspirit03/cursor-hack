import Phaser from 'phaser';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { App } from './ui/App';
import { createGameConfig } from './game/config';
import { MockBackendService } from './services/MockBackend';
import type { FactoryScene } from './game/scenes/FactoryScene';

// Mount React UI
const appRoot = document.getElementById('app')!;
const root = createRoot(appRoot);
root.render(createElement(App));

// Poll for game container (React renders async)
function bootPhaser() {
  const gameContainer = document.getElementById('game-container');
  if (!gameContainer) {
    setTimeout(bootPhaser, 50);
    return;
  }

  const config = createGameConfig('game-container');
  const game = new Phaser.Game(config);

  // Connect mock backend each time FactoryScene becomes active
  const backend = new MockBackendService();
  let backendConnected = false;

  const pollForFactory = () => {
    const scene = game.scene.getScene('FactoryScene') as FactoryScene | null;
    if (scene && scene.scene.isActive()) {
      if (!backendConnected) {
        backend.setScene(scene);
        backend.connect().then(() => {
          console.log('[Factory Agents] Mock backend connected');
          backendConnected = true;
        });
      } else {
        backend.setScene(scene);
      }
    }
    setTimeout(pollForFactory, 500);
  };

  game.events.on('ready', () => {
    pollForFactory();
  });
}

bootPhaser();
