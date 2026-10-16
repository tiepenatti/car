// Rough thresholds for 6 x AA in the Technic Hub (about 9 V fresh).
function batteryLevel(volts) {
  if (volts >= 7.5) return 'good'
  if (volts >= 6.6) return 'low'
  return 'critical'
}

export function BatteryIndicator({ connected, voltage }) {
  if (!connected) return null

  const level = voltage == null ? 'unknown' : batteryLevel(voltage)

  return (
    <div className="battery-indicator-row">
      <span className={`battery-indicator battery-${level}`} title="Hub battery voltage, refreshed every 15 s">
        <span className="battery-dot" aria-hidden="true" />
        Battery {voltage == null ? '…' : `${voltage.toFixed(2)} V`}
      </span>
    </div>
  )
}
