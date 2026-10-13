import { useEffect, useRef, useState } from 'react'

const DEAD_ZONE = 0.2
const STEER_ZONE = 0.35
const POWER_STEP = 10

function drivePowerFor(y, minPower) {
  const amount = Math.abs(y)
  if (amount <= DEAD_ZONE) return 0
  const ratio = (amount - DEAD_ZONE) / (1 - DEAD_ZONE)
  const power = minPower + (100 - minPower) * ratio
  return Math.min(100, Math.round(power / POWER_STEP) * POWER_STEP)
}

export function JoystickPage({
  setDrive,
  pulseSteering,
  stopAll,
  servoPulseMs,
  setServoPulseMs,
  servoSpeedPct,
  setServoSpeedPct,
  onBack,
}) {
  const baseRef = useRef(null)
  const activePointerRef = useRef(null)
  const steerTimerRef = useRef(null)
  const steerDirRef = useRef(0)
  const inCenterRef = useRef(true)
  const pulseSteeringRef = useRef(pulseSteering)
  const burstIntervalRef = useRef(0)

  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [minPower, setMinPower] = useState(50)
  const [burstIntervalMs, setBurstIntervalMs] = useState(300)
  const [readout, setReadout] = useState({ power: 0, steer: 0 })

  useEffect(() => {
    pulseSteeringRef.current = pulseSteering
  }, [pulseSteering])

  useEffect(() => {
    burstIntervalRef.current = burstIntervalMs
  }, [burstIntervalMs])

  const updateSteering = (dir) => {
    if (steerDirRef.current === dir) return
    steerDirRef.current = dir
    clearInterval(steerTimerRef.current)
    if (dir === 0) return
    pulseSteeringRef.current(dir)
    steerTimerRef.current = setInterval(() => pulseSteeringRef.current(dir), burstIntervalRef.current)
  }

  // Restart the burst timer so a changed interval applies while still holding a side.
  useEffect(() => {
    const dir = steerDirRef.current
    if (dir === 0) return
    clearInterval(steerTimerRef.current)
    steerTimerRef.current = setInterval(() => pulseSteeringRef.current(dir), burstIntervalMs)
  }, [burstIntervalMs])

  const applyPosition = (x, y) => {
    const inCenter = Math.hypot(x, y) <= DEAD_ZONE
    if (inCenter) {
      updateSteering(0)
      if (!inCenterRef.current) stopAll()
      inCenterRef.current = true
      setReadout({ power: 0, steer: 0 })
      return
    }
    inCenterRef.current = false

    // Screen up is negative y, and the hub drives forward with negative power.
    const power = drivePowerFor(y, minPower)
    setDrive(y < 0 ? -power : power)

    const steer = Math.abs(x) >= STEER_ZONE ? Math.sign(x) : 0
    updateSteering(steer)
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
    updateSteering(0)
    inCenterRef.current = true
    setReadout({ power: 0, steer: 0 })
    stopAll()
  }

  useEffect(
    () => () => {
      clearInterval(steerTimerRef.current)
    },
    [],
  )

  const handleBack = () => {
    clearInterval(steerTimerRef.current)
    steerDirRef.current = 0
    stopAll()
    onBack()
  }

  const powerLabel = readout.power === 0 ? 'STOP' : `${readout.power > 0 ? 'FWD' : 'BWD'} ${Math.abs(readout.power)}%`
  const steerLabel = readout.steer === 0 ? 'straight' : readout.steer < 0 ? 'left bursts' : 'right bursts'

  return (
    <section className="joystick-page">
      <div className="joystick-header">
        <button type="button" className="disconnect-button" onClick={handleBack}>
          ← Back to controller
        </button>
        <p className="joystick-readout">
          <strong>{powerLabel}</strong> · {steerLabel}
        </p>
      </div>

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
          <div className="servo-setting">
            <label>Steer burst every: {burstIntervalMs} ms</label>
            <div className="servo-setting-controls">
              <input type="range" min="100" max="1000" step="50" value={burstIntervalMs} onChange={(e) => setBurstIntervalMs(Number(e.target.value))} />
            </div>
          </div>
          <div className="servo-setting">
            <label>Steer pulse length: {servoPulseMs} ms</label>
            <div className="servo-setting-controls">
              <input type="range" min="30" max="1000" step="10" value={servoPulseMs} onChange={(e) => setServoPulseMs(Number(e.target.value))} />
            </div>
          </div>
          <div className="servo-setting">
            <label>Steer pulse power: {servoSpeedPct}%</label>
            <div className="servo-setting-controls">
              <input type="range" min="10" max="100" step="10" value={servoSpeedPct} onChange={(e) => setServoSpeedPct(Number(e.target.value))} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
