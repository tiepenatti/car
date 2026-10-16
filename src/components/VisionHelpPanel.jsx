import { MAX_STEER_LEVEL } from '../hooks/useVisionFollow'

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
          Tap <strong>CAMERA ON</strong>. The camera is off by default. The first time, the pose model (about 6 MB) and the
          detection engine (about 4 MB compressed) are downloaded. Processing runs entirely on the device; no video leaves it.
        </li>
        <li>
          Stand in front of the car. The person it tracks (the “commander”) is drawn with a skeleton and a box. Blue
          means tracking only, green means following.
        </li>
        <li>
          Tap <strong>START FOLLOWING</strong>. The car steers to keep you centred and holds the follow distance: it drives
          forward when you are too far and reverses when you are too close. Walk away and it follows.
        </li>
        <li>
          The follow distance slider is in metres: all the way right is about half a metre, halfway is 2 m, all the way
          left is 3.5 m. Distance is estimated from the length of your torso, so it is approximate and works best facing
          the camera with shoulders and hips in view.
        </li>
        <li>
          If it “finds” people who are not there, move the <strong>Detection strictness</strong> slider right. A person
          only counts once both shoulders are clearly visible for a few frames in a row. Too strict and it may lose you in
          poor light or at a distance.
        </li>
      </ol>

      <div className="control-help-grid">
        <div className="control-help-group">
          <h3>Overlay</h3>
          <ul className="voice-help-tips">
            <li>
              Dashed lines: the centre zone. Inside it the wheels are straightened. Outside it the wheels turn towards
              you in {MAX_STEER_LEVEL} steps, further the more off-centre you are, up to the full steering travel set on
              the Settings page.
            </li>
            <li>Top right: the estimated distance to the commander and the follow distance it is aiming for.</li>
            <li>The dot marks the centre of the commander’s torso, which is what the car steers towards.</li>
            <li>
              While following, the bottom of the feed shows the current command: an up arrow when driving forward, a down
              arrow when reversing (both lean the way the wheels are turned), a red STOP at the follow distance, or a grey
              LOST when nobody is in view.
            </li>
            <li>
              Steering uses the same encoder-guided pulses as the joystick, so calibrate the centre and travel on the
              Settings page first.
            </li>
            <li>
              If the car turns away from you instead of towards you, turn on <strong>Swap left/right</strong>.
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
            <li>The car reverses at full power if you walk towards it, so keep the space behind it clear.</li>
            <li>Follow mode drives at full power, so start in plenty of space and try debug mode first.</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
