import { useEffect, useState } from 'react';
import { eventBus } from '../services/EventBus';
import { STATION_CONFIGS } from '../game/constants';
import type { AgentState } from '../game/entities/AgentTypes';

interface DetailPanelProps {
  agentId: string;
  onClose: () => void;
  onAssign: (agentId: string, stationId: string) => void;
}

export function DetailPanel({ agentId, onClose, onAssign }: DetailPanelProps) {
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [selectedStation, setSelectedStation] = useState<string>(STATION_CONFIGS[0].id);

  useEffect(() => {
    const handleUpdate = ({ agent: updated }: { agent: AgentState }) => {
      if (updated.id === agentId) {
        setAgent(updated);
      }
    };

    eventBus.on('agent:updated', handleUpdate);
    return () => {
      eventBus.off('agent:updated', handleUpdate);
    };
  }, [agentId]);

  if (!agent) {
    return (
      <div className="detail-panel">
        <div className="detail-header">
          <span className="detail-title">AGENT DETAILS</span>
          <button className="detail-close" onClick={onClose}>X</button>
        </div>
        <div className="detail-body">
          <span style={{ color: 'var(--text-dim)' }}>Loading...</span>
        </div>
      </div>
    );
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <span className="detail-title">{agent.name}</span>
        <button className="detail-close" onClick={onClose}>X</button>
      </div>

      <div className="detail-body">
        <div className="detail-section">
          <div className="detail-label">TYPE</div>
          <div className="detail-value">
            <span className={`agent-type-badge ${agent.type}`}>
              {agent.type.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-label">STATUS</div>
          <div className="detail-value">
            <span className={`status-dot ${agent.status}`} />
            {agent.status.toUpperCase()}
          </div>
        </div>

        {agent.currentStation && (
          <div className="detail-section">
            <div className="detail-label">STATION</div>
            <div className="detail-value">{agent.currentStation}</div>
          </div>
        )}

        {agent.task && (
          <div className="detail-section">
            <div className="detail-label">CURRENT TASK</div>
            <div className="detail-value">{agent.task.description}</div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${agent.task.progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="detail-section">
          <div className="detail-label">ASSIGN TO STATION</div>
          <div className="command-bar" style={{ padding: 0, marginTop: 4 }}>
            <select
              className="command-select"
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
            >
              {STATION_CONFIGS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <button
              className="command-btn"
              onClick={() => onAssign(agent.id, selectedStation)}
              disabled={agent.status !== 'idle' && agent.status !== 'done'}
            >
              GO
            </button>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-label">LOG</div>
          <div className="log-list">
            {[...agent.logs].reverse().map((log, i) => (
              <div key={i} className="log-entry">
                <span className="log-time">{formatTime(log.timestamp)}</span>
                <span className={`log-msg ${log.type}`}>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
