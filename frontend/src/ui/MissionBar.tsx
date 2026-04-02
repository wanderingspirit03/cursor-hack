import { useState, useEffect, useCallback, useRef } from 'react';
import { eventBus } from '../services/EventBus';
import type { WebSocketBackendService } from '../services/WebSocketBackend';

type MissionStatus = 'idle' | 'running' | 'complete' | 'error';
type OrchestratorStatus = null | 'thinking' | 'spawning';

interface MissionBarProps {
  backend: WebSocketBackendService;
}

export function MissionBar({ backend }: MissionBarProps) {
  const [prompt, setPrompt] = useState('');
  const [missionStatus, setMissionStatus] = useState<MissionStatus>('idle');
  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus>(null);
  const [spawnRound, setSpawnRound] = useState(0);
  const [missionSummary, setMissionSummary] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState(backend.isConnected());

  useEffect(() => {
    const onStarted = () => {
      setMissionStatus('running');
      setOrchestratorStatus(null);
      setMissionSummary(null);
      setErrorMessage(null);
    };

    const onComplete = ({ summary }: { summary: string }) => {
      setMissionStatus('complete');
      setOrchestratorStatus(null);
      setMissionSummary(summary ?? 'Mission complete.');
      setTimeout(() => {
        setMissionStatus('idle');
        setMissionSummary(null);
      }, 5000);
    };

    const onError = ({ message }: { message: string }) => {
      setMissionStatus('error');
      setOrchestratorStatus(null);
      setErrorMessage(message ?? 'Unknown error');
      setTimeout(() => {
        setMissionStatus('idle');
        setErrorMessage(null);
      }, 5000);
    };

    const onThinking = () => {
      setOrchestratorStatus('thinking');
    };

    const onSpawning = ({ round }: { round: number }) => {
      setOrchestratorStatus('spawning');
      setSpawnRound(round ?? 1);
    };

    const onConnection = ({ connected: c }: { connected: boolean }) => {
      setConnected(c);
    };

    const onMissionState = ({ status }: { missionId: string | null; status: string; agents: any[] }) => {
      if (status === 'running') {
        setMissionStatus('running');
      }
    };

    eventBus.on('mission:started', onStarted);
    eventBus.on('mission:complete', onComplete);
    eventBus.on('mission:error', onError);
    eventBus.on('orchestrator:thinking', onThinking);
    eventBus.on('orchestrator:spawning', onSpawning);
    eventBus.on('connection:changed', onConnection);
    eventBus.on('mission:state', onMissionState);

    return () => {
      eventBus.off('mission:started', onStarted);
      eventBus.off('mission:complete', onComplete);
      eventBus.off('mission:error', onError);
      eventBus.off('orchestrator:thinking', onThinking);
      eventBus.off('orchestrator:spawning', onSpawning);
      eventBus.off('connection:changed', onConnection);
      eventBus.off('mission:state', onMissionState);
    };
  }, []);

  const handleStart = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || missionStatus === 'running') return;
    backend.startMission(trimmed);
    setPrompt('');
  }, [prompt, missionStatus, backend]);

  const handleAbort = useCallback(() => {
    backend.abortMission();
    setMissionStatus('idle');
    setOrchestratorStatus(null);
  }, [backend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') handleStart();
    },
    [handleStart],
  );

  const isRunning = missionStatus === 'running';
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('keydown', stop, true);
    el.addEventListener('keyup', stop, true);
    el.addEventListener('keypress', stop, true);
    return () => {
      el.removeEventListener('keydown', stop, true);
      el.removeEventListener('keyup', stop, true);
      el.removeEventListener('keypress', stop, true);
    };
  }, []);

  return (
    <div className="mission-bar" ref={barRef}>
      <div className="mission-bar-header">
        <span className="mission-bar-title">MISSION CONTROL</span>
        <span className={`connection-dot ${connected ? 'online' : 'offline'}`} />
      </div>

      {missionStatus === 'idle' && (
        <div className="mission-input-row">
          <input
            className="mission-input"
            type="text"
            placeholder="Enter mission prompt..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
            disabled={!connected}
          />
          <button
            className="mission-btn start-btn"
            onClick={handleStart}
            disabled={!prompt.trim() || !connected}
          >
            START
          </button>
        </div>
      )}

      {isRunning && (
        <div className="mission-status-row">
          <div className="mission-status-text">
            {orchestratorStatus === 'thinking' && (
              <span className="status-thinking">ORCHESTRATOR THINKING...</span>
            )}
            {orchestratorStatus === 'spawning' && (
              <span className="status-spawning">
                SPAWNING AGENTS (ROUND {spawnRound})...
              </span>
            )}
            {orchestratorStatus === null && (
              <span className="status-running">MISSION RUNNING...</span>
            )}
          </div>
          <button className="mission-btn abort-btn" onClick={handleAbort}>
            ABORT
          </button>
        </div>
      )}

      {missionStatus === 'complete' && missionSummary && (
        <div className="mission-result-row complete">
          <span className="result-icon">✓</span>
          <span className="result-text">{missionSummary}</span>
        </div>
      )}

      {missionStatus === 'error' && errorMessage && (
        <div className="mission-result-row error">
          <span className="result-icon">✗</span>
          <span className="result-text">{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
