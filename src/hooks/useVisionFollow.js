import { useCallback, useEffect, useRef, useState } from 'react'

const DETECT_INTERVAL_MS = 66
const TELEMETRY_INTERVAL_MS = 200
const LOST_TIMEOUT_MS = 600
const MIN_VISIBILITY = 0.5
const CENTER_DEADBAND = 0.08
const STEER_GAIN = 1.5
const SIZE_HYSTERESIS = 0.08
const TORSO_LANDMARKS = [11, 12, 23, 24]
// On this car a positive steering-motor angle turns the wheels left, so a right turn needs a negative angle.
const STEER_MOTOR_DIRECTION = -1

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

export function findCommander(landmarks) {
  const visible = landmarks.filter((point) => point.visibility >= MIN_VISIBILITY)
  if (visible.length < 4) return null

  const xs = visible.map((point) => clamp(point.x, 0, 1))
  const ys = visible.map((point) => clamp(point.y, 0, 1))
  const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }

  // The torso is steadier than the bounding box, which jumps around as arms and legs move.
  const torso = TORSO_LANDMARKS.map((index) => landmarks[index]).filter((point) => point?.visibility >= MIN_VISIBILITY)
  const centerX = torso.length > 0 ? average(torso.map((point) => point.x)) : (box.left + box.right) / 2

  return { box, centerX: clamp(centerX, 0, 1), size: box.bottom - box.top }
}

export function computeFollowCommand(commander, previousDrive, { targetSize, steeringMax }) {
  // turn is in degrees from the car's point of view: negative turns left, positive turns right.
  const offset = commander.centerX - 0.5
  const turn =
    Math.abs(offset) < CENTER_DEADBAND ? 0 : clamp(offset * 2 * steeringMax * STEER_GAIN, -steeringMax, steeringMax)

  // Hysteresis stops the car from twitching between drive and stop at the target distance.
  let drive = previousDrive
  if (commander.size < targetSize - SIZE_HYSTERESIS) drive = 'forward'
  else if (commander.size >= targetSize) drive = 'stop'

  return { turn, drive }
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

  if (command.drive === 'forward') {
    // The arrow leans further than the wheels so small turns are still visible.
    const angle = (command.turn * 1.5 * Math.PI) / 180
    const length = 110 * scale
    context.translate(baseX, baseY)
    context.rotate(angle)
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

function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = import('./poseLandmarker')
      .then(({ createPoseLandmarker }) => createPoseLandmarker())
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

  // Outlined bar on the right edge showing the height the commander should fill to stop the car.
  context.strokeStyle = 'rgba(255, 255, 255, 0.8)'
  context.lineWidth = 2
  context.strokeRect(width - 30, height * (1 - settings.targetSize) - 1, 10, height * settings.targetSize)

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
    context.fillRect(width - 14, box.top * height, 10, (box.bottom - box.top) * height)

    context.beginPath()
    context.arc(commander.centerX * width, ((box.top + box.bottom) / 2) * height, 10, 0, Math.PI * 2)
    context.fill()
  }

  if (command) drawCommand(context, width, height, command, settings.debug)
}

export function useVisionFollow({ steerToAngle, setDrive, stopAll, drivePower, steeringMax }) {
  const [status, setStatus] = useState('off')
  const [error, setError] = useState('')
  const [following, setFollowingState] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [targetSize, setTargetSize] = useState(0.7)
  const [debug, setDebugState] = useState(false)
  const [telemetry, setTelemetry] = useState(null)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const sessionRef = useRef(null)
  const controlRef = useRef({})
  const followingRef = useRef(false)
  const debugRef = useRef(false)
  const driveStateRef = useRef('stop')
  const lostRef = useRef(true)

  useEffect(() => {
    controlRef.current = { steerToAngle, setDrive, stopAll, drivePower, steeringMax, targetSize }
  }, [steerToAngle, setDrive, stopAll, drivePower, steeringMax, targetSize])

  const setFollowing = useCallback((next) => {
    followingRef.current = next
    setFollowingState(next)
    driveStateRef.current = 'stop'
    lostRef.current = true
    if (!next) controlRef.current.stopAll?.()
  }, [])

  const setDebug = useCallback((next) => {
    debugRef.current = next
    setDebugState(next)
    // Commands already sent keep the motors running, so entering debug must stop the car.
    if (next) controlRef.current.stopAll?.()
    driveStateRef.current = 'stop'
  }, [])

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
        if (send) control.stopAll()
      }
      return { turn: 0, drive: lostRef.current ? 'lost' : driveStateRef.current }
    }

    sessionRef.current.lastSeen = now
    lostRef.current = false
    const command = computeFollowCommand(commander, driveStateRef.current, control)
    driveStateRef.current = command.drive

    if (send) {
      control.steerToAngle(command.turn * STEER_MOTOR_DIRECTION)
      control.setDrive(command.drive === 'forward' ? -control.drivePower : 0)
    }
    return command
  }, [])

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
        const pose = await loadLandmarker()

        const video = videoRef.current
        video.srcObject = stream
        await video.play()

        const session = { stream, frameId: 0, lastDetect: 0, lastTelemetry: 0, lastSeen: 0 }
        sessionRef.current = session

        const loop = (now) => {
          if (sessionRef.current !== session) return
          session.frameId = requestAnimationFrame(loop)
          if (now - session.lastDetect < DETECT_INTERVAL_MS || video.readyState < 2) return

          const fps = session.lastDetect ? 1000 / (now - session.lastDetect) : 0
          session.lastDetect = now

          const result = pose.landmarker.detectForVideo(video, now)
          const landmarks = result.landmarks[0]
          const commander = landmarks ? findCommander(landmarks) : null
          const command = followingRef.current ? steer(commander, now) : null

          drawOverlay(canvasRef.current, video, pose, landmarks, commander, command, {
            targetSize: controlRef.current.targetSize,
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
    targetSize,
    setTargetSize,
    debug,
    setDebug,
    telemetry,
    videoRef,
    canvasRef,
    toggleCamera,
  }
}
