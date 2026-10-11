import { CommandLogPanel } from './components/CommandLogPanel'
import { ConnectionPanel } from './components/ConnectionPanel'
import { ControlHelpPanel } from './components/ControlHelpPanel'
import { ControlPad } from './components/ControlPad'
import { SensorPanel } from './components/SensorPanel'
import { ServoSettingsPanel } from './components/ServoSettingsPanel'
import { useLegoHubController } from './hooks/useLegoHubController'
import { useTiltAlarm } from './hooks/useTiltAlarm'
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
    </main>
  )
}

export default App
