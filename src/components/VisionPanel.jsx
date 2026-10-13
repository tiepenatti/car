const STATUS_LABELS = {
  off: 'Camera off. Tap to start person tracking',
  loading: 'Starting camera and loading pose model…',
  on: 'Camera on',
  error: 'Camera error',
}

const DRIVE_LABELS = {
  forward: 'Following (driving forward)',
  stop: 'Close enough (stopped)',
  lost: 'Commander lost (stopped)',
}

function formatTurn(turn) {
  const degrees = Math.round(Math.abs(turn))
  if (degrees === 0) return 'straight'
  return `turn ${turn < 0 ? 'left' : 'right'} ${degrees}°`
}

export function VisionPanel({ vision, connected }) {
  const {
    status,
    error,
    following,
    setFollowing,
    facingMode,
    switchCamera,
    targetSize,
    setTargetSize,
    debug,
    setDebug,
    telemetry,
    videoRef,
    canvasRef,
    toggleCamera,
  } = vision
  const cameraOn = status === 'on'
  const commander = telemetry?.commander
  const command = telemetry?.command

  return (
    <section className="vision-panel">
      <div className="vision-controls">
        <button
          type="button"
          className={`camera-button${cameraOn ? ' camera-button-live' : ''}`}
          onClick={toggleCamera}
          disabled={status === 'loading'}
          aria-pressed={cameraOn}
          aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
            <circle cx="12" cy="13" r="4" className="camera-lens" />
          </svg>
          <span>{cameraOn ? 'CAMERA ON' : 'CAMERA OFF'}</span>
        </button>

        <div className="vision-status">
          <p className="voice-status-line">{STATUS_LABELS[status]}</p>
          {error && <p className="voice-error">{error}</p>}

          {cameraOn && (
            <>
              <div className="vision-actions">
                <button
                  type="button"
                  className={`follow-button${following ? ' follow-button-live' : ''}`}
                  onClick={() => setFollowing(!following)}
                  aria-pressed={following}
                >
                  {following ? 'STOP FOLLOWING' : 'START FOLLOWING'}
                </button>
                <button
                  type="button"
                  className={`servo-btn${debug ? ' debug-button-live' : ''}`}
                  onClick={() => setDebug(!debug)}
                  aria-pressed={debug}
                >
                  Debug: {debug ? 'ON (commands not sent)' : 'OFF'}
                </button>
                <button type="button" className="servo-btn" onClick={switchCamera}>
                  Switch to {facingMode === 'environment' ? 'front' : 'back'} camera
                </button>
              </div>
              {following && !debug && !connected && (
                <p className="voice-warning">Hub not connected: motor commands are not sent.</p>
              )}
              <p className="voice-heard">
                {commander
                  ? `Commander: centre ${Math.round(commander.centerX * 100)}%, size ${Math.round(commander.size * 100)}%`
                  : 'No commander in view'}
                {telemetry?.fps ? ` · ${Math.round(telemetry.fps)} fps` : ''}
              </p>
              {command && (
                <p className="voice-action">
                  {debug ? 'Would send: ' : ''}
                  {DRIVE_LABELS[command.drive]} · {formatTurn(command.turn)}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className={`vision-feed${status === 'off' ? ' vision-feed-hidden' : ''}`}>
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
      </div>

      {cameraOn && (
        <div className="servo-settings-grid vision-settings">
          <div className="servo-setting">
            <label htmlFor="follow-target-size">Follow distance: stop when commander fills {Math.round(targetSize * 100)}% of the frame height</label>
            <div className="servo-setting-controls">
              <input
                id="follow-target-size"
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={targetSize}
                onChange={(event) => setTargetSize(Number(event.target.value))}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
