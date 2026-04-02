import { useEffect, useState } from 'react';
import { eventBus } from '../services/EventBus';
import type { AgentState } from '../game/entities/AgentTypes';

interface SidebarProps {
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

export function Sidebar({ selectedAgentId, onSelectAgent }: SidebarProps) {
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());

  useEffect(() => {
    const handleSpawned = ({ agent }: { agent: AgentState }) => {
      setAgents((prev) => new Map(prev).set(agent.id, agent));
    };

    const handleUpdated = ({ agent }: { agent: AgentState }) => {
      setAgents((prev) => new Map(prev).set(agent.id, agent));
    };

    const handleRemoved = ({ agentId }: { agentId: string }) => {
      setAgents((prev) => {
        const next = new Map(prev);
        next.delete(agentId);
        return next;
      });
    };

    eventBus.on('agent:spawned', handleSpawned);
    eventBus.on('agent:updated', handleUpdated);
    eventBus.on('agent:removed', handleRemoved);

    return () => {
      eventBus.off('agent:spawned', handleSpawned);
      eventBus.off('agent:updated', handleUpdated);
      eventBus.off('agent:removed', handleRemoved);
    };
  }, []);

  const agentList = Array.from(agents.values());

  return (
    <div className="sidebar">
      <div className="sidebar-header">AGENTS ({agentList.length})</div>
      <div className="agent-list">
        {agentList.map((agent) => (
          <div
            key={agent.id}
            className={`agent-card ${selectedAgentId === agent.id ? 'selected' : ''}`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <div className="agent-card-header">
              <span className={`agent-type-badge ${agent.type}`}>
                {agent.type.toUpperCase()}
              </span>
              <span className="agent-name">{agent.name}</span>
            </div>
            <div className="agent-status">
              <span className={`status-dot ${agent.status}`} />
              {agent.status}
              {agent.task ? ` - ${agent.task.description}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
