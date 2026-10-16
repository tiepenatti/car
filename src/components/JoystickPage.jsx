import { useRef, useState } from 'react'

const DEAD_ZONE = 0.2
const STEER_DEAD_ZONE = 0.15
const POWER_STEP = 10
const STEER_STEP = 0.1

function drivePowerFor(y, minPower) {
  const amount = Math.abs(y)
  if (amount <= DEAD_ZONE) return 0
  const ratio = (amount - DEAD_ZONE) / (1 - DEAD_ZONE)
  const power = minPower + (100 - minPower) * ratio
  return Math.min(100, Math.round(power / POWER_STEP) * POWER_STEP)
}

function steerFractionFor(x) {
  const amount = Math.abs(x)
  if (amount <= STEER_DEAD_ZONE) return 0
  const ratio = (amount - STEER_DEAD_ZONE) / (1 - STEER_DEAD_ZONE)
  return Math.sign(x) * Math.min(1, Math.round(ratio / STEER_STEP) * STEER_STEP)
}

export function JoystickPage({ setDrive, steerServo, stopAll, steeringAngle, steeringLimits, onBack }) {
  const baseRef = useRef(null)
  const activePointerRef = useRef(null)
  const inCenterRef = useRef(true)

  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [minPower, setMinPower] = useState(50)
  const [readout, setReadout] = useState({ power: 0, steer: 0 })

  const stopAndCenter = () => {
    setDrive(0)
    steerServo(0)
    setReadout({ power: 0, steer: 0 })
  }

  const applyPosition = (x, y) => {
    const inCenter = Math.hypot(x, y) <= DEAD_ZONE
    if (inCenter) {
      if (!inCenterRef.current) stopAndCenter()
      inCenterRef.current = true
      return
    }
    inCenterRef.current = false

    // Screen up is negative y, and the hub drives forward with negative power.
    const power = drivePowerFor(y, minPower)
    setDrive(y < 0 ? -power : power)

    const steer = steerFractionFor(x)
    steerServo(steer)
    setReadout({ power: y < 0 ? power : -power, steer })
  }

  const positionFromEvent = (event) => {
    const rect = baseRef.current.getBoundingClientRect()
    const radius = rect.width / 2
    let x = (event.clientX - (rect.left + radius)) / radius
    let y = (event.clientY - (rect.top + radius)) / radius
    const distance = Math.hypot(x, y)
    if (distance > 1) {
      x /= distance
      y /= distance
    }
    return { x, y }
  }

  const release = () => {
    activePointerRef.current = null
    setDragging(false)
    setKnob({ x: 0, y: 0 })
    inCenterRef.current = true
    stopAndCenter()
  }

  const handleBack = () => {
    stopAll()
    onBack()
  }

  const powerLabel = readout.power === 0 ? 'STOP' : `${readout.power > 0 ? 'FWD' : 'BWD'} ${Math.abs(readout.power)}%`
  const steerSide = readout.steer < 0 ? 'left' : 'right'
  const steerLabel =
    readout.steer === 0
      ? 'straight'
      : `${Math.round(Math.abs(readout.steer) * 100)}% ${steerSide} of ${steeringLimits[steerSide]}°`

  return (
    <section className="joystick-page">
      <div className="joystick-header">
        <button type="button" className="disconnect-button" onClick={handleBack}>
          ← Back to controller
        </button>
        <p className="joystick-readout">
          <strong>{powerLabel}</strong> · {steerLabel} · wheels {steeringAngle === null ? '?' : `${steeringAngle}°`}
        </p>
      </div>

      {steeringAngle === null && (
        <p className="voice-warning">
          No position reading from the steering motor, so steering uses plain position commands instead of pulses.
        </p>
      )}

      <div className="joystick-base" ref={baseRef}>
        <div className="joystick-dead-zone" style={{ width: `${DEAD_ZONE * 100}%`, height: `${DEAD_ZONE * 100}%` }} />
        <div
          className={`joystick-knob${dragging ? ' joystick-knob-active' : ''}`}
          style={{ left: `${50 + knob.x * 50}%`, top: `${50 + knob.y * 50}%` }}
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            activePointerRef.current = event.pointerId
            setDragging(true)
          }}
          onPointerMove={(event) => {
            if (activePointerRef.current !== event.pointerId) return
            const { x, y } = positionFromEvent(event)
            setKnob({ x, y })
            applyPosition(x, y)
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>

      <div className="servo-settings-panel joystick-settings">
        <h2>Joystick tuning</h2>
        <div className="servo-settings-grid">
          <div className="servo-setting">
            <label>Min drive power: {minPower}%</label>
            <div className="servo-setting-controls">
              <input type="range" min="10" max="100" step="10" value={minPower} onChange={(e) => setMinPower(Number(e.target.value))} />
            </div>
          </div>
        </div>
        <p className="hint">Steering pulse length, power, centre and limits are on the Settings page.</p>
      </div>
    </section>
  )
}
