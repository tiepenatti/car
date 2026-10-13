export function VisionHelpPanel() {
  return (
    <section className="control-help-panel">
      <h2>Camera Follow Mode</h2>
      <ol className="voice-help-steps">
        <li>
          Open this page on a phone (Android Chrome supports both Web Bluetooth and the camera) and connect to the hub.
        </li>
        <li>
          Mount the phone on the car with the back camera facing forward, so the video shows what the car sees.
        </li>
        <li>
          Tap <strong>CAMERA</strong>. The camera is off by default. The first time, the pose model (about 6 MB) and the
          detection engine (about 4 MB compressed) are downloaded. Processing runs entirely on the device; no video leaves it.
        </li>
        <li>
          Stand in front of the car. The person it tracks (the “commander”) is drawn with a skeleton and a box. Blue
          means tracking only, green means following.
        </li>
        <li>
          Tap <strong>START FOLLOWING</strong>. The car steers to keep you centred and drives forward until you fill the
          follow distance. Walk away and it follows.
        </li>
      </ol>

      <div className="control-help-grid">
        <div className="control-help-group">
          <h3>Overlay</h3>
          <ul className="voice-help-tips">
            <li>Dashed lines: the centre zone. Inside it the car drives straight.</li>
            <li>
              Outlined bar on the right: the follow distance. Solid bar next to it: how tall the commander currently is. The
              car drives until the solid bar is as tall as the outline.
            </li>
            <li>The dot marks the centre of the commander’s torso, which is what the car steers towards.</li>
            <li>
              While following, the bottom of the feed shows the current command: an arrow leaning the way the car is
              turning, a red STOP when close enough, or a grey LOST when nobody is in view.
            </li>
          </ul>
        </div>
        <div className="control-help-group">
          <h3>Debug mode</h3>
          <ul className="voice-help-tips">
            <li>
              Turn <strong>Debug</strong> on to test follow mode without moving the car. Commands are worked out and
              drawn as yellow arrows on the feed, but nothing is sent over Bluetooth.
            </li>
            <li>Turning debug on stops the car. Turning it off while following starts sending commands again.</li>
          </ul>
        </div>
        <div className="control-help-group">
          <h3>Safety</h3>
          <ul className="voice-help-tips">
            <li>The car stops if nobody is seen for about half a second.</li>
            <li>STOP, the voice “stop” command, turning the camera off, or switching away from the page all end following.</li>
            <li>The car does not reverse. If you walk towards it, it just stays stopped.</li>
            <li>Follow mode drives at full power, so start in plenty of space and try debug mode first.</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
