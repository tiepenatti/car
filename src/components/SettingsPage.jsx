export function SettingsPage({ onBack, children }) {
  return (
    <section className="settings-page">
      <div className="joystick-header">
        <button type="button" className="disconnect-button" onClick={onBack}>
          ← Back to controller
        </button>
        <h1 className="settings-title">Settings</h1>
      </div>
      {children}
    </section>
  )
}
