const STATUS_LABELS = {
  off: 'Mic off. Tap to start voice control',
  loading: 'Loading voice model…',
  listening: 'Listening. Say "car, go forward"',
  error: 'Voice control error',
}

const ACTION_LABELS = {
  forward: 'Forward',
  backward: 'Backward',
  left: 'Left',
  right: 'Right',
  stop: 'Stop',
}

export function VoicePanel({ voice, connected }) {
  const { status, error, heard, lastAction, toggleListening } = voice
  const listening = status === 'listening'

  return (
    <section className="voice-panel">
      <button
        type="button"
        className={`mic-button${listening ? ' mic-button-live' : ''}`}
        onClick={toggleListening}
        disabled={status === 'loading'}
        aria-pressed={listening}
        aria-label={listening ? 'Turn voice control off' : 'Turn voice control on'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
          <path d="M19 11a7 7 0 0 1-14 0M12 18v4M8 22h8" fill="none" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>{listening ? 'MIC ON' : 'MIC OFF'}</span>
      </button>

      <div className="voice-status">
        <p className="voice-status-line">{STATUS_LABELS[status]}</p>
        {error && <p className="voice-error">{error}</p>}
        {listening && !connected && <p className="voice-warning">Hub not connected: commands are recognised but not sent.</p>}
        {heard && <p className="voice-heard">Heard: “{heard}”</p>}
        {lastAction && (
          <p className="voice-action">
            Last command: {ACTION_LABELS[lastAction.action]}
            {lastAction.seconds ? ` for ${lastAction.seconds} s` : ''}
          </p>
        )}
      </div>
    </section>
  )
}
