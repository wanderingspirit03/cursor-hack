import { useState } from 'react';

interface RolePickerModalProps {
  isOpen: boolean;
  onSelectRole: (role: string) => void;
  onClose: () => void;
}

interface RoleOption {
  name: string;
  emoji: string;
  description: string;
}

const roles: RoleOption[] = [
  { name: 'Planner', emoji: '📋', description: 'Analyzes & plans improvements' },
  { name: 'Coder', emoji: '⌨️', description: 'Implements code changes' },
  { name: 'Tester', emoji: '🧪', description: 'Runs tests & validates' },
  { name: 'Reviewer', emoji: '🔍', description: 'Reviews code quality' },
];

const roleBtnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '22px',
  color: 'var(--pixel-text)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
};

export function RolePickerModal({ isOpen, onSelectRole, onClose }: RolePickerModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <>
      {/* Invisible backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 49,
        }}
      />
      {/* Popup positioned above the button */}
      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 4,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: 4,
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 240,
          zIndex: 50,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: '22px', color: 'rgba(255, 255, 255, 0.9)' }}>Select Role</span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'close' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>
        {/* Role buttons */}
        {roles.map((role) => (
          <button
            key={role.name}
            onClick={() => onSelectRole(role.name)}
            onMouseEnter={() => setHovered(role.name)}
            onMouseLeave={() => setHovered(null)}
            style={{
              ...roleBtnBase,
              background:
                hovered === role.name ? 'rgba(255, 255, 255, 0.08)' : roleBtnBase.background,
            }}
          >
            <span style={{ fontSize: '24px', flexShrink: 0 }}>{role.emoji}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <span style={{ fontSize: '22px', color: 'var(--pixel-text)' }}>{role.name}</span>
              <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.5)' }}>
                {role.description}
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
