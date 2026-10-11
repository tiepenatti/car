import { useCallback, useEffect, useRef, useState } from 'react'

const TILT_THRESHOLD_DEG = 15
const BEEP_INTERVAL_MS = 400

export function isTilted(value) {
  const axes = Array.isArray(value) ? value : [value]
  return axes.some((axis) => typeof axis === 'number' && Math.abs(axis) > TILT_THRESHOLD_DEG)
}

export function useTiltAlarm(sensorValue, connected) {
  const [armed, setArmed] = useState(true)
  const audioRef = useRef(null)

  const tilted = connected && sensorValue !== null && sensorValue !== undefined && isTilted(sensorValue)
  const alarmActive = armed && tilted

  const toggleArmed = useCallback(() => {
    // Created inside a click so the browser allows audio playback.
    if (!audioRef.current) {
      audioRef.current = new AudioContext()
    }
    audioRef.current.resume()
    setArmed((previous) => !previous)
  }, [])

  useEffect(() => {
    if (!alarmActive) return undefined

    let high = false
    const beep = () => {
      const context = audioRef.current
      if (!context) return
      if (context.state === 'suspended') context.resume()

      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'square'
      oscillator.frequency.value = high ? 1200 : 800
      high = !high
      gain.gain.value = 0.2
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + BEEP_INTERVAL_MS / 1000 - 0.05)
    }

    beep()
    const timer = setInterval(beep, BEEP_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [alarmActive])

  useEffect(() => {
    if (audioRef.current) return undefined
    // Lazily create the audio context on the first user gesture (e.g. the Connect click).
    const init = () => {
      if (!audioRef.current) audioRef.current = new AudioContext()
    }
    window.addEventListener('pointerdown', init, { once: true })
    window.addEventListener('keydown', init, { once: true })
    return () => {
      window.removeEventListener('pointerdown', init)
      window.removeEventListener('keydown', init)
    }
  }, [])

  return { armed, toggleArmed, tilted, alarmActive, thresholdDeg: TILT_THRESHOLD_DEG }
}
