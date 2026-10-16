import { useCallback, useEffect, useRef, useState } from 'react'

const DETECT_INTERVAL_MS = 66
const TELEMETRY_INTERVAL_MS = 200
const LOST_TIMEOUT_MS = 600
const MIN_VISIBLE_LANDMARKS = 8
// A person must be seen this many detections in a row before being followed, which filters out one-off phantoms.
const CONFIRM_FRAMES = 4
export const MIN_DETECTION_CONFIDENCE = 0.5
export const MAX_DETECTION_CONFIDENCE = 0.9
const CENTER_DEADBAND = 0.06
const STEER_GAIN = 2
export const MAX_STEER_LEVEL = 3
const DISTANCE_TOLERANCE = 0.15
const DISTANCE_SMOOTHING = 0.35
export const MIN_FOLLOW_DISTANCE = 0.5
export const MAX_FOLLOW_DISTANCE = 3.5
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12
const LEFT_HIP = 23
const RIGHT_HIP = 24
const TORSO_LANDMARKS = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP]
// Typical adult proportions; the distance estimate scales directly with these.
const TORSO_LENGTH_M = 0.5
const SHOULDER_WIDTH_M = 0.36
// Field of view across the long side of the image, typical for phone main cameras and webcams.
const CAMERA_LONG_SIDE_FOV_DEG = 65

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function pixelDistance(a, b, width, height) {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height)
}

function estimateDistance(landmarks, width, height, minVisibility) {
  const seen = (index) => landmarks[index]?.visibility >= minVisibility
  const focalPx = Math.max(width, height) / (2 * Math.tan((CAMERA_LONG_SIDE_FOV_DEG * Math.PI) / 360))
  const shoulders = seen(LEFT_SHOULDER) && seen(RIGHT_SHOULDER)

  if (shoulders && seen(LEFT_HIP) && seen(RIGHT_HIP)) {
    const torsoPx = pixelDistance(
      midpoint(landmarks[LEFT_SHOULDER], landmarks[RIGHT_SHOULDER]),
      midpoint(landmarks[LEFT_HIP], landmarks[RIGHT_HIP]),
      width,
      height,
    )
    if (torsoPx > 1) return (TORSO_LENGTH_M * focalPx) / torsoPx
  }

  // Close up the hips drop out of frame; shoulder width is a rougher fallback because it shrinks when turning sideways.
  if (shoulders) {
    const shoulderPx = pixelDistance(landmarks[LEFT_SHOULDER], landmarks[RIGHT_SHOULDER], width, height)
    if (shoulderPx > 1) return (SHOULDER_WIDTH_M * focalPx) / shoulderPx
  }

  return null
}

export function findCommander(landmarks, width, height, minVisibility) {
  const visible = landmarks.filter((point) => point.visibility >= minVisibility)
  if (visible.length < MIN_VISIBLE_LANDMARKS) return null
  // Phantom detections rarely have a convincing pair of shoulders, and steering and distance both need them.
  const shouldersSeen = [LEFT_SHOULDER, RIGHT_SHOULDER].every((index) => landmarks[index]?.visibility >= minVisibility)
  if (!shouldersSeen) return null

  const xs = visible.map((point) => clamp(point.x, 0, 1))
  const ys = visible.map((point) => clamp(point.y, 0, 1))
  const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }

  // The torso is steadier than the bounding box, which jumps around as arms and legs move.
  const torso = TORSO_LANDMARKS.map((index) => landmarks[index]).filter((point) => point?.visibility >= minVisibility)
  const centerX = average(torso.map((point) => point.x))

  return { box, centerX: clamp(centerX, 0, 1), distance: estimateDistance(landmarks, width, height, minVisibility) }
}

export function computeFollowCommand(commander, previousDrive, { targetDistance }) {
  // steer is a level from the car's point of view: negative turns left, positive turns right.
  const offset = commander.centerX - 0.5
  const outside = Math.max(0, Math.abs(offset) - CENTER_DEADBAND) / (0.5 - CENTER_DEADBAND)
  let steer = Math.sign(offset) * Math.min(MAX_STEER_LEVEL, Math.ceil(outside * MAX_STEER_LEVEL * STEER_GAIN))

  // Hysteresis stops the car from twitching between drive and stop at the target distance.
  let drive = previousDrive
  const { distance } = commander
  if (distance === null) drive = 'stop'
  else if (distance > targetDistance * (1 + DISTANCE_TOLERANCE)) drive = 'forward'
  else if (distance < targetDistance * (1 - DISTANCE_TOLERANCE)) drive = 'backward'
  else if (drive === 'forward' && distance <= targetDistance) drive = 'stop'
  else if (drive === 'backward' && distance >= targetDistance) drive = 'stop'

  // Reversing swings the nose the opposite way, so the wheels must turn away from the commander.
  if (drive === 'backward') steer = -steer

  return { steer, drive }
}

function drawCommand(context, width, height, command, debug) {
  const scale = width / 640
  const baseX = width / 2
  const baseY = height - 24 * scale

  context.save()
  context.font = `bold ${16 * scale}px system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  if (debug) {
    context.fillStyle = 'rgba(250, 204, 21, 0.9)'
    context.fillRect(10 * scale, 10 * scale, 230 * scale, 30 * scale)
    context.fillStyle = '#0f172a'
    context.fillText('DEBUG · commands not sent', 125 * scale, 25 * scale)
  }

  if (command.drive === 'forward' || command.drive === 'backward') {
    const angle = (command.steer * 15 * Math.PI) / 180
    const length = 110 * scale
    context.translate(baseX, baseY - (command.drive === 'backward' ? length : 0))
    // Pointing down for reverse; the lean still shows which way the wheels are turned.
    if (command.drive === 'backward') context.rotate(Math.PI)
    context.rotate(command.drive === 'backward' ? -angle : angle)
    context.fillStyle = debug ? 'rgba(250, 204, 21, 0.85)' : 'rgba(34, 197, 94, 0.85)'
    context.strokeStyle = '#ffffff'
    context.lineWidth = 2 * scale
    context.beginPath()
    context.moveTo(-12 * scale, 0)
    context.lineTo(-12 * scale, -length + 36 * scale)
    context.lineTo(-30 * scale, -length + 36 * scale)
    context.lineTo(0, -length)
    context.lineTo(30 * scale, -length + 36 * scale)
    context.lineTo(12 * scale, -length + 36 * scale)
    context.lineTo(12 * scale, 0)
    context.closePath()
    context.fill()
    context.stroke()
  } else {
    const label = command.drive === 'lost' ? 'LOST' : 'STOP'
    const boxWidth = 90 * scale
    const boxHeight = 40 * scale
    context.fillStyle = command.drive === 'lost' ? 'rgba(100, 116, 139, 0.9)' : 'rgba(239, 68, 68, 0.9)'
    context.fillRect(baseX - boxWidth / 2, baseY - boxHeight, boxWidth, boxHeight)
    context.fillStyle = '#ffffff'
    context.fillText(label, baseX, baseY - boxHeight / 2)
  }

  context.restore()
}

let landmarkerPromise = null

function loadLandmarker(confidence) {
  if (!landmarkerPromise) {
    landmarkerPromise = import('./poseLandmarker')
      .then(({ createPoseLandmarker }) => createPoseLandmarker(confidence))
      .catch((error) => {
        landmarkerPromise = null
        throw error
      })
  }
  return landmarkerPromise
}

function drawOverlay(canvas, video, pose, landmarks, commander, command, settings) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  const context = canvas.getContext('2d')
  context.clearRect(0, 0, width, height)

  context.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  context.lineWidth = 2
  context.setLineDash([8, 8])
  for (const edge of [0.5 - CENTER_DEADBAND, 0.5 + CENTER_DEADBAND]) {
    context.beginPath()
    context.moveTo(edge * width, 0)
    context.lineTo(edge * width, height)
    context.stroke()
  }
  context.setLineDash([])

  const scale = width / 640
  const distanceText = commander?.distance ? `${commander.distance.toFixed(1)} m` : '? m'
  context.font = `bold ${18 * scale}px system-ui, sans-serif`
  context.textAlign = 'right'
  context.textBaseline = 'top'
  context.fillStyle = 'rgba(15, 23, 42, 0.7)'
  context.fillRect(width - 200 * scale, 10 * scale, 190 * scale, 30 * scale)
  context.fillStyle = '#ffffff'
  context.fillText(`${distanceText} → ${settings.targetDistance.toFixed(1)} m`, width - 20 * scale, 16 * scale)

  if (landmarks && commander) {
    const color = settings.following ? '#22c55e' : '#38bdf8'
    const drawing = new pose.DrawingUtils(context)
    drawing.drawConnectors(landmarks, pose.connections, { color, lineWidth: 4 })
    drawing.drawLandmarks(landmarks, { color: '#ffffff', fillColor: color, radius: 3 })

    const { box } = commander
    context.strokeStyle = color
    context.lineWidth = 3
    context.strokeRect(box.left * width, box.top * height, (box.right - box.left) * width, (box.bottom - box.top) * height)

    context.fillStyle = color
    context.beginPath()
    context.arc(commander.centerX * width, ((box.top + box.bottom) / 2) * height, 10, 0, Math.PI * 2)
    context.fill()
  }

  if (command) drawCommand(context, width, height, command, settings.debug)
}

export function useVisionFollow({ steerServo, setDrive, stopAll, drivePower }) {
  const [status, setStatus] = useState('off')
  const [error, setError] = useState('')
  const [following, setFollowingState] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [targetDistance, setTargetDistance] = useState(2)
  const [detectionConfidence, setDetectionConfidence] = useState(0.7)
  const [debug, setDebugState] = useState(false)
  const [telemetry, setTelemetry] = useState(null)
  const [swapSteering, setSwapSteering] = useState(false)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const sessionRef = useRef(null)
  const controlRef = useRef({})
  const followingRef = useRef(false)
  const debugRef = useRef(false)
  const driveStateRef = useRef('stop')
  const lostRef = useRef(true)

  useEffect(() => {
    controlRef.current = {
      steerServo,
      setDrive,
      stopAll,
      drivePower,
      targetDistance,
      detectionConfidence,
      swapSteering,
    }
  }, [steerServo, setDrive, stopAll, drivePower, targetDistance, detectionConfidence, swapSteering])

  useEffect(() => {
    // Only update a model that is already loaded; a later load picks the value up from controlRef.
    landmarkerPromise
      ?.then((pose) => pose.landmarker.setOptions(pose.confidenceOptions(detectionConfidence)))
      .catch(() => {})
  }, [detectionConfidence])

  const stopCar = useCallback(() => {
    // stopAll also re-centres the steering on its encoder.
    controlRef.current.stopAll?.()
  }, [])

  const setFollowing = useCallback(
    (next) => {
      followingRef.current = next
      setFollowingState(next)
      driveStateRef.current = 'stop'
      lostRef.current = true
      if (!next) stopCar()
    },
    [stopCar],
  )

  const setDebug = useCallback(
    (next) => {
      debugRef.current = next
      setDebugState(next)
      // Commands already sent keep the motors running, so entering debug must stop the car.
      if (next) stopCar()
      driveStateRef.current = 'stop'
    },
    [stopCar],
  )

  const stopCamera = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    if (!session) return

    cancelAnimationFrame(session.frameId)
    session.stream.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    canvasRef.current?.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }, [])

  const steer = useCallback((commander, now) => {
    const control = controlRef.current
    const send = !debugRef.current

    if (!commander) {
      if (!lostRef.current && now - (sessionRef.current?.lastSeen ?? 0) > LOST_TIMEOUT_MS) {
        lostRef.current = true
        driveStateRef.current = 'stop'
        if (send) stopCar()
      }
      return { steer: 0, drive: lostRef.current ? 'lost' : driveStateRef.current }
    }

    sessionRef.current.lastSeen = now
    lostRef.current = false
    const command = computeFollowCommand(commander, driveStateRef.current, control)
    driveStateRef.current = command.drive
    if (!send) return command

    // Same sign convention as the joystick: positive steers right. steerServo ignores repeats of the same target.
    const steerSign = control.swapSteering ? -1 : 1
    control.steerServo((steerSign * command.steer) / MAX_STEER_LEVEL)

    // The hub drives forward with negative power.
    const power = { forward: -control.drivePower, backward: control.drivePower }[command.drive] ?? 0
    control.setDrive(power)
    return command
  }, [stopCar])

  const startCamera = useCallback(
    async (facing) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setError('Camera access is not available. Open the page over HTTPS or localhost.')
        return
      }

      setStatus('loading')
      setError('')

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } },
        })
        const pose = await loadLandmarker(controlRef.current.detectionConfidence)

        const video = videoRef.current
        video.srcObject = stream
        await video.play()

        const session = { stream, frameId: 0, lastDetect: 0, lastTelemetry: 0, lastSeen: 0, distance: null, seenFrames: 0 }
        sessionRef.current = session

        const loop = (now) => {
          if (sessionRef.current !== session) return
          session.frameId = requestAnimationFrame(loop)
          if (now - session.lastDetect < DETECT_INTERVAL_MS || video.readyState < 2) return

          const fps = session.lastDetect ? 1000 / (now - session.lastDetect) : 0
          session.lastDetect = now

          const result = pose.landmarker.detectForVideo(video, now)
          const landmarks = result.landmarks[0]
          const candidate = landmarks
            ? findCommander(landmarks, video.videoWidth, video.videoHeight, controlRef.current.detectionConfidence)
            : null
          session.seenFrames = candidate ? session.seenFrames + 1 : 0
          const commander = session.seenFrames >= CONFIRM_FRAMES ? candidate : null
          if (!commander) session.distance = null
          else if (commander.distance !== null) {
            // Smoothing keeps pose jitter from flipping the car between forward, stop and reverse.
            session.distance =
              session.distance === null
                ? commander.distance
                : session.distance + DISTANCE_SMOOTHING * (commander.distance - session.distance)
          }
          if (commander) commander.distance = session.distance
          const command = followingRef.current ? steer(commander, now) : null

          drawOverlay(canvasRef.current, video, pose, landmarks, commander, command, {
            targetDistance: controlRef.current.targetDistance,
            following: followingRef.current,
            debug: debugRef.current,
          })

          if (now - session.lastTelemetry >= TELEMETRY_INTERVAL_MS) {
            session.lastTelemetry = now
            setTelemetry({ commander, command, fps })
          }
        }
        session.frameId = requestAnimationFrame(loop)
        setStatus('on')
      } catch (startError) {
        stream?.getTracks().forEach((track) => track.stop())
        setStatus('error')
        setError(String(startError?.message || startError))
      }
    },
    [steer],
  )

  const toggleCamera = useCallback(() => {
    if (status === 'loading') return

    if (status === 'on') {
      setFollowing(false)
      stopCamera()
      setTelemetry(null)
      setStatus('off')
      return
    }

    startCamera(facingMode)
  }, [facingMode, setFollowing, startCamera, status, stopCamera])

  const switchCamera = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    if (status === 'on') {
      setFollowing(false)
      stopCamera()
      startCamera(next)
    }
  }, [facingMode, setFollowing, startCamera, status, stopCamera])

  useEffect(() => {
    // Animation frames pause in background tabs, so the lost-person stop would never fire.
    const onVisibilityChange = () => {
      if (document.hidden && followingRef.current) setFollowing(false)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [setFollowing])

  useEffect(() => stopCamera, [stopCamera])

  return {
    status,
    error,
    following,
    setFollowing,
    facingMode,
    switchCamera,
    targetDistance,
    setTargetDistance,
    detectionConfidence,
    setDetectionConfidence,
    debug,
    setDebug,
    telemetry,
    videoRef,
    canvasRef,
    toggleCamera,
    swapSteering,
    setSwapSteering,
  }
}
