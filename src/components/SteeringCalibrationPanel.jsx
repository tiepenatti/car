export function SteeringCalibrationPanel({
  connected,
  steeringAngle,
  steeringMotor,
  steeringLimits,
  setSteeringLimits,
  steeringCalibrated,
  steeringTolerance,
  setSteeringTolerance,
  calibration,
  calibrateSteering,
  setCurrentAsCenter,
  pulseSteering,
  steerServo,
  fullLockEnabled,
  setFullLockEnabled,
}) {
  const hasFeedback = connected && steeringAngle !== null
  const busy = calibration.running

  return (
    <section className="servo-settings-panel">
      <h2>Steering Centre &amp; Limits</h2>

      <div className="sensor-meta">
        <span>Motor: {steeringMotor ?? (connected ? 'waiting…' : 'not connected')}</span>
        <span>
          Wheels now: <strong>{steeringAngle === null ? '?' : `${steeringAngle}°`}</strong>
        </span>
        <span>
          Travel: {steeringLimits.left}° left / {steeringLimits.right}° right ({steeringCalibrated ? 'calibrated' : 'manual'})
        </span>
      </div>

      <div className="steering-actions">
        <button type="button" className="connect-button" onClick={calibrateSteering} disabled={!hasFeedback || busy}>
          {busy ? 'Calibrating…' : 'Auto-calibrate'}
        </button>
        <button type="button" className="servo-btn" onClick={() => pulseSteering(-1)} disabled={!connected || busy}>
          ◀ Nudge left
        </button>
        <button type="button" className="servo-btn" onClick={() => pulseSteering(1)} disabled={!connected || busy}>
          Nudge right ▶
        </button>
        <button type="button" className="servo-btn" onClick={setCurrentAsCenter} disabled={!hasFeedback || busy}>
          Set current as centre
        </button>
        <button type="button" className="servo-btn" onClick={() => steerServo(0)} disabled={!connected || busy}>
          Go to centre
        </button>
      </div>

      {calibration.message && <p className="status">{calibration.message}</p>}

      <label className="settings-toggle">
        <input type="checkbox" checked={fullLockEnabled} onChange={(e) => setFullLockEnabled(e.target.checked)} />
        Full-lock detection: with the joystick hard left or right, push until the wheels hit the end stop and widen
        the travel if needed. Experimental, off by default.
      </label>

      <p className="hint">
        Auto-calibrate pushes the wheels to each end until the motor stops turning, then sets the centre halfway
        between. Lift the front wheels off the ground first, or the steering can stall before the end stops. If the car still pulls to one side, nudge the wheels until they are straight and press Set current
        as centre. The centre is reset to wherever the wheels are when you connect, so recalibrate after reconnecting
        if they were not straight.
      </p>

      <div className="servo-settings-grid">
        <div className="servo-setting">
          <label>
            Left travel: <strong>{steeringLimits.left}°</strong>
          </label>
          <div className="servo-setting-controls">
            <input
              type="range"
              min={5}
              max={180}
              step={1}
              value={steeringLimits.left}
              onChange={(e) => setSteeringLimits({ ...steeringLimits, left: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="servo-setting">
          <label>
            Right travel: <strong>{steeringLimits.right}°</strong>
          </label>
          <div className="servo-setting-controls">
            <input
              type="range"
              min={5}
              max={180}
              step={1}
              value={steeringLimits.right}
              onChange={(e) => setSteeringLimits({ ...steeringLimits, right: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="servo-setting">
          <label>
            Close enough: <strong>±{steeringTolerance}°</strong>
          </label>
          <div className="servo-setting-controls">
            <input
              type="range"
              min={1}
              max={15}
              step={1}
              value={steeringTolerance}
              onChange={(e) => setSteeringTolerance(Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
