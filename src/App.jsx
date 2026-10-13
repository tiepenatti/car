import { useRef, useState } from 'react'
import { CommandLogPanel } from './components/CommandLogPanel'
import { ConnectionPanel } from './components/ConnectionPanel'
import { ControlHelpPanel } from './components/ControlHelpPanel'
import { ControlPad } from './components/ControlPad'
import { JoystickPage } from './components/JoystickPage'
import { SensorPanel } from './components/SensorPanel'
import { ServoSettingsPanel } from './components/ServoSettingsPanel'
import { VoiceHelpPanel } from './components/VoiceHelpPanel'
import { VoicePanel } from './components/VoicePanel'
import { useLegoHubController } from './hooks/useLegoHubController'
import { useTiltAlarm } from './hooks/useTiltAlarm'
import { useVoiceControl } from './hooks/useVoiceControl'
import './App.css'

function App() {
  const {
    connected,
    status,
    drivePower,
    servoPulseMs,
    setServoPulseMs,
    servoSpeedPct,
    setServoSpeedPct,
    servoPosition,
    commandLog,
    distanceSensor,
    connect,
    disconnect,
    clearCommandLog,
    pulseSteering,
    setDrive,
    stopAll,
    forceStopSteering,
  } = useLegoHubController()
  // Hub tilt reports [yaw, pitch, roll]; yaw is heading, not tilt.
  const tiltAngles = Array.isArray(distanceSensor.value) ? distanceSensor.value.slice(1) : distanceSensor.value
  const tiltAlarm = useTiltAlarm(tiltAngles, connected)
  const voiceTimerRef = useRef(null)
  const [view, setView] = useState('main')

  const stopEverything = () => {
    clearTimeout(voiceTimerRef.current)
    stopAll()
  }

  const voice = useVoiceControl(({ action, seconds }) => {
    // Steering pulses must not cancel a timed drive, or the car would keep going.
    if (action !== 'left' && action !== 'right') clearTimeout(voiceTimerRef.current)
    if (action === 'forward') setDrive(-drivePower)
    else if (action === 'backward') setDrive(drivePower)
    else if (action === 'left') pulseSteering(-1)
    else if (action === 'right') pulseSteering(1)
    else if (action === 'stop') stopEverything()

    if (seconds) voiceTimerRef.current = setTimeout(() => setDrive(0), seconds * 1000)
  })

  if (view === 'joystick' && connected) {
    return (
      <main className="app-shell">
        <JoystickPage
          setDrive={setDrive}
          pulseSteering={pulseSteering}
          stopAll={stopEverything}
          servoPulseMs={servoPulseMs}
          setServoPulseMs={setServoPulseMs}
          servoSpeedPct={servoSpeedPct}
          setServoSpeedPct={setServoSpeedPct}
          onBack={() => setView('main')}
        />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <ConnectionPanel
        connected={connected}
        status={status}
        onConnect={connect}
        onDisconnect={disconnect}
      />
      <div className="joystick-open">
        <button type="button" className="connect-button" onClick={() => setView('joystick')} disabled={!connected}>
          Open joystick
        </button>
      </div>
      <ControlPad
        drivePower={drivePower}
        pulseSteering={pulseSteering}
        setDrive={setDrive}
        stopAll={stopEverything}
      />
      <VoicePanel voice={voice} connected={connected} />
      <ServoSettingsPanel
        servoPulseMs={servoPulseMs}
        setServoPulseMs={setServoPulseMs}
        servoSpeedPct={servoSpeedPct}
        setServoSpeedPct={setServoSpeedPct}
        servoPosition={servoPosition}
        forceStopSteering={forceStopSteering}
      />
      <SensorPanel tiltAlarm={tiltAlarm} distanceSensor={distanceSensor} servoPulseMs={servoPulseMs} servoSpeedPct={servoSpeedPct} servoPosition={servoPosition} />
      <CommandLogPanel entries={commandLog} onClear={clearCommandLog} />
      <ControlHelpPanel />
      <VoiceHelpPanel />
    </main>
  )
}

export default App
