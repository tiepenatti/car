function formatSensorValue(value, decimals) {
  if (value === null || value === undefined) {
    return 'Waiting for data'
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'number' && decimals > 0 ? item.toFixed(decimals) : String(item)))
      .join(', ')
  }

  if (typeof value === 'number' && decimals > 0) {
    return value.toFixed(decimals)
  }

  return String(value)
}

export function SensorPanel({ tiltAlarm, distanceSensor, servoPulseMs, servoSpeedPct, servoPosition }) {
  return (
    <section className="sensor-panel">
      <div className="servo-speed">
        <strong>Pulse:</strong> {servoPulseMs}ms <span style={{ opacity: 0.5 }}>(2/8 ±20ms)</span>
        &nbsp;&nbsp;
        <strong>Speed:</strong> {servoSpeedPct}% <span style={{ opacity: 0.5 }}>(PgDn/PgUp ±10)</span>
        &nbsp;&nbsp;
        <strong>Position:</strong> {servoPosition}°
      </div>

      <div className="sensor-panel-header">
        <h2>Tilt Sensor</h2>
        <span className={`sensor-badge ${distanceSensor.notifyEnabled ? 'sensor-badge-live' : ''}`}>
          {distanceSensor.notifyEnabled ? 'Live' : 'Idle'}
        </span>
      </div>

      <div className="servo-speed" style={tiltAlarm.alarmActive ? { color: '#c00', fontWeight: 700 } : undefined}>
        {tiltAlarm.alarmActive ? '🚨 ALARM: not flat!' : tiltAlarm.tilted ? 'Tilted (alarm disarmed)' : 'Flat'}
        &nbsp;&nbsp;
        <button type="button" onClick={tiltAlarm.toggleArmed}>
          {tiltAlarm.armed ? 'Disarm alarm' : 'Arm alarm'}
        </button>
        &nbsp;<span style={{ opacity: 0.5 }}>(&gt;{tiltAlarm.thresholdDeg}° on any axis)</span>
      </div>

      <div className="sensor-reading">{formatSensorValue(distanceSensor.value, distanceSensor.decimals)}</div>

      <div className="sensor-meta">
        <span>Port C</span>
        <span>Mode {distanceSensor.mode}</span>
        <span>{distanceSensor.format}</span>
        <span>{distanceSensor.datasets} dataset{distanceSensor.datasets === 1 ? '' : 's'}</span>
      </div>

      <p className="sensor-raw">Raw: {distanceSensor.raw || 'No value frame yet'}</p>
    </section>
  )
}