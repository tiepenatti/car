import { CommandLogPanel } from './components/CommandLogPanel'
import { ConnectionPanel } from './components/ConnectionPanel'
import { ControlHelpPanel } from './components/ControlHelpPanel'
import { ControlPad } from './components/ControlPad'
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
  const voice = useVoiceControl((action) => {
    if (action === 'forward') setDrive(-drivePower)
    else if (action === 'backward') setDrive(drivePower)
    else if (action === 'left') pulseSteering(-1)
    else if (action === 'right') pulseSteering(1)
    else if (action === 'stop') stopAll()
  })

  return (
    <main className="app-shell">
      <ConnectionPanel
        connected={connected}
        status={status}
        onConnect={connect}
        onDisconnect={disconnect}
      />
      <ControlPad
        drivePower={drivePower}
        pulseSteering={pulseSteering}
        setDrive={setDrive}
        stopAll={stopAll}
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
