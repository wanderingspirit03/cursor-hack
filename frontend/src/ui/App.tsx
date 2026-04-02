import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { DetailPanel } from './DetailPanel';
import { eventBus } from '../services/EventBus';
import './App.css';

export function App() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  useEffect(() => {
    const handleSelected = ({ agentId }: { agentId: string }) => {
      setSelectedAgentId(agentId);
    };

    const handleDeselected = () => {
      setSelectedAgentId(null);
    };

    eventBus.on('agent:selected', handleSelected);
    eventBus.on('agent:deselected', handleDeselected);

    return () => {
      eventBus.off('agent:selected', handleSelected);
      eventBus.off('agent:deselected', handleDeselected);
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

  return (
    <div className="app">
      <Sidebar
        selectedAgentId={selectedAgentId}
        onSelectAgent={handleSelectAgent}
      />
      <div className="game-container" id="game-container" />
      {selectedAgentId && (
        <DetailPanel
          agentId={selectedAgentId}
          onClose={handleCloseDetail}
          onAssign={handleAssign}
        />
      )}
    </div>
  );
}
