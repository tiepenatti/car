import {
  MAX_DETECTION_CONFIDENCE,
  MAX_FOLLOW_DISTANCE,
  MAX_STEER_LEVEL,
  MIN_DETECTION_CONFIDENCE,
  MIN_FOLLOW_DISTANCE,
} from '../hooks/useVisionFollow'
import { VisionHelpPanel } from './VisionHelpPanel'

const STATUS_LABELS = {
  off: 'Camera off',
  loading: 'Starting camera and loading pose model…',
  on: 'Camera on',
  error: 'Camera error',
}

const DRIVE_LABELS = {
  forward: 'Too far: driving forward',
  backward: 'Too close: reversing',
  stop: 'At follow distance: stopped',
  lost: 'Commander lost: stopped',
}

function formatSteer(steer) {
  if (steer === 0) return 'wheels straight'
  return `wheels ${steer < 0 ? 'left' : 'right'} ${Math.abs(steer)}/${MAX_STEER_LEVEL}`
}

export function VisionPage({ vision, connected, stopAll, onBack }) {
  const {
    status,
    error,
    following,
    setFollowing,
    facingMode,
    switchCamera,
    targetDistance,
    setTargetDistance,
    detectionConfidence,
    setDetectionConfidence,
    debug,
    setDebug,
    telemetry,
    videoRef,
    canvasRef,
    toggleCamera,
    swapSteering,
    setSwapSteering,
  } = vision
  const cameraOn = status === 'on'
  const commander = telemetry?.commander
  const command = telemetry?.command

  const handleBack = () => {
    // The video element unmounts with this page, so the camera cannot keep running behind it.
    if (cameraOn) toggleCamera()
    else stopAll()
    onBack()
  }

  return (
    <section className="vision-page">
      <div className="vision-page-header">
        <button type="button" className="disconnect-button" onClick={handleBack}>
          ← Back
        </button>
        <h1 className="settings-title">Camera follow</h1>
      </div>

      {!connected && <p className="voice-warning">Hub not connected: motor commands are not sent.</p>}
      {error && <p className="voice-error">{error}</p>}

      <div className={`vision-feed vision-page-feed${cameraOn ? '' : ' vision-feed-idle'}`}>
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
        {!cameraOn && <p className="vision-feed-placeholder">{STATUS_LABELS[status]}</p>}
      </div>

      <div className="vision-page-status">
        {cameraOn && (
          <p className="voice-heard">
            {commander
              ? `Commander at ${Math.round(commander.centerX * 100)}% across, ${
                  commander.distance ? `≈${commander.distance.toFixed(1)} m` : 'distance unknown'
                }`
              : 'No commander in view'}
            {telemetry?.fps ? ` · ${Math.round(telemetry.fps)} fps` : ''}
          </p>
        )}
        {command && (
          <p className="voice-action">
            {debug ? 'Would send: ' : ''}
            {DRIVE_LABELS[command.drive]} · {formatSteer(command.steer)}
          </p>
        )}
      </div>

      <div className="vision-page-main-actions">
        <button
          type="button"
          className={`vision-big-button${cameraOn ? ' camera-button-live' : ''}`}
          onClick={toggleCamera}
          disabled={status === 'loading'}
          aria-pressed={cameraOn}
        >
          {status === 'loading' ? 'STARTING…' : cameraOn ? 'CAMERA OFF' : 'CAMERA ON'}
        </button>
        <button
          type="button"
          className={`vision-big-button follow-button${following ? ' follow-button-live' : ''}`}
          onClick={() => setFollowing(!following)}
          disabled={!cameraOn}
          aria-pressed={following}
        >
          {following ? 'STOP FOLLOWING' : 'START FOLLOWING'}
        </button>
        <button
          type="button"
          className="vision-big-button stop-button vision-stop-button"
          onClick={stopAll}
        >
          STOP
        </button>
      </div>

      <div className="vision-page-toggles">
        <button
          type="button"
          className={`servo-btn${debug ? ' debug-button-live' : ''}`}
          onClick={() => setDebug(!debug)}
          aria-pressed={debug}
        >
          Debug: {debug ? 'ON (commands not sent)' : 'OFF'}
        </button>
        <button type="button" className="servo-btn" onClick={switchCamera}>
          Use {facingMode === 'environment' ? 'front' : 'back'} camera
        </button>
        <button
          type="button"
          className={`servo-btn${swapSteering ? ' debug-button-live' : ''}`}
          onClick={() => setSwapSteering(!swapSteering)}
          aria-pressed={swapSteering}
        >
          Swap left/right: {swapSteering ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="vision-page-sliders">
        <label htmlFor="follow-target-distance">
          Follow distance: about <strong>{targetDistance.toFixed(2).replace(/0$/, '')} m</strong> (right = closer)
        </label>
        {/* Negated so that dragging right brings the car closer. */}
        <input
          id="follow-target-distance"
          type="range"
          min={-MAX_FOLLOW_DISTANCE}
          max={-MIN_FOLLOW_DISTANCE}
          step="0.25"
          value={-targetDistance}
          onChange={(event) => setTargetDistance(-Number(event.target.value))}
        />
        <label htmlFor="detection-confidence">
          Detection strictness: <strong>{Math.round(detectionConfidence * 100)}%</strong> (right = fewer phantom people)
        </label>
        <input
          id="detection-confidence"
          type="range"
          min={MIN_DETECTION_CONFIDENCE}
          max={MAX_DETECTION_CONFIDENCE}
          step="0.05"
          value={detectionConfidence}
          onChange={(event) => setDetectionConfidence(Number(event.target.value))}
        />
      </div>

      <details className="vision-page-help">
        <summary>How follow mode works</summary>
        <VisionHelpPanel />
      </details>
    </section>
  )
}
