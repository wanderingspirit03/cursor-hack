import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { DetailPanel } from './DetailPanel';
import { MissionBar } from './MissionBar';
import { eventBus } from '../services/EventBus';
import type { WebSocketBackendService } from '../services/WebSocketBackend';
import './App.css';

interface AppProps {
  backend: WebSocketBackendService;
}

export function App({ backend }: AppProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [currentScene, setCurrentScene] = useState<'world' | 'factory'>('world');

  useEffect(() => {
    const handleSelected = ({ agentId }: { agentId: string }) => {
      setSelectedAgentId(agentId);
    };

    const handleDeselected = () => {
      setSelectedAgentId(null);
    };

    const handleSceneChanged = ({ scene }: { scene: 'world' | 'factory' }) => {
      setCurrentScene(scene);
      if (scene === 'world') {
        setSelectedAgentId(null);
      }
    };

    eventBus.on('agent:selected', handleSelected);
    eventBus.on('agent:deselected', handleDeselected);
    eventBus.on('scene:changed', handleSceneChanged);

    return () => {
      eventBus.off('agent:selected', handleSelected);
      eventBus.off('agent:deselected', handleDeselected);
      eventBus.off('scene:changed', handleSceneChanged);
    };
  }, []);

  const handleSelectAgent = useCallback((id: string) => {
    setSelectedAgentId(id);
    eventBus.emit('agent:selected', { agentId: id });
    eventBus.emit('camera:follow', { agentId: id });
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedAgentId(null);
    eventBus.emit('agent:deselected', {});
    eventBus.emit('camera:unfollow', {});
  }, []);

  const handleAssign = useCallback((agentId: string, stationId: string) => {
    eventBus.emit('command:assign', { agentId, stationId });
  }, []);

  const inFactory = currentScene === 'factory';

  return (
    <div className="app">
      {inFactory && (
        <div className="sidebar">
          <Sidebar
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
          />
        </div>
      )}
      <div className="game-container" id="game-container">
        {inFactory && <MissionBar backend={backend} />}
      </div>
      {inFactory && selectedAgentId && (
        <DetailPanel
          agentId={selectedAgentId}
          onClose={handleCloseDetail}
          onAssign={handleAssign}
        />
      )}
    </div>
  );
}
