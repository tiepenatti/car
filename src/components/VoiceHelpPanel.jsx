import { VOICE_COMMANDS } from '../hooks/useVoiceControl'

export function VoiceHelpPanel() {
  return (
    <section className="control-help-panel">
      <h2>Voice Control</h2>
      <ol className="voice-help-steps">
        <li>Connect to the hub.</li>
        <li>
          Tap the big <strong>MIC</strong> button. Voice control is off by default and nothing is heard until you turn it on.
        </li>
        <li>
          Allow microphone access when the browser asks. The first time, the speech model (about 40 MB) is downloaded, which can
          take a little while. Recognition then runs entirely in your browser; no audio leaves the device.
        </li>
        <li>
          Start each command with <strong>“car”</strong>, then speak clearly. <strong>“Stop”</strong> works on its own and is
          acted on as soon as it is heard.
        </li>
        <li>Tap the MIC button again to turn voice control off. This also stops the car.</li>
      </ol>

      <div className="control-help-grid">
        <div className="control-help-group">
          <h3>Commands</h3>
          <dl className="voice-help-commands">
            {VOICE_COMMANDS.map((command) => (
              <div key={command.action} className="voice-help-row">
                <dt>{command.phrases.map((phrase) => `“${phrase}”`).join(' / ')}</dt>
                <dd>{command.label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="control-help-group">
          <h3>Tips</h3>
          <ul className="voice-help-tips">
            <li>Forward and backward keep driving until you say “stop” or press STOP.</li>
            <li>
              Add a duration from one to ten seconds to drive for a set time, for example “car go forward two seconds” or
              “car reverse for three seconds”. Steering commands during a timed drive do not cancel it.
            </li>
            <li>Each left/right command is one steering pulse. Raise the pulse duration in Servo Settings for bigger turns.</li>
            <li>Motor noise makes recognition harder, so speak close to the device that is running this page.</li>
            <li>Needs HTTPS or localhost for microphone access, same as Web Bluetooth.</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
