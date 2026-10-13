import { useCallback, useEffect, useRef, useState } from 'react'

const MODEL_URL =
  import.meta.env.VITE_VOSK_MODEL_URL ??
  'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz'

export const VOICE_COMMANDS = [
  {
    action: 'forward',
    label: 'Drive forward until stop, or for 1–10 seconds',
    phrases: ['car go forward', 'car forward', 'car go'],
    timed: true,
  },
  {
    action: 'backward',
    label: 'Drive backward until stop, or for 1–10 seconds',
    phrases: ['car go back', 'car back', 'car reverse'],
    timed: true,
  },
  { action: 'left', label: 'Steering pulse left', phrases: ['car turn left', 'car left'] },
  { action: 'right', label: 'Steering pulse right', phrases: ['car turn right', 'car right'] },
  { action: 'stop', label: 'Stop driving and centre steering', phrases: ['stop', 'car stop'] },
]

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

function timedPhrases(phrase) {
  return NUMBER_WORDS.flatMap((number) => {
    const unit = number === 'one' ? 'second' : 'seconds'
    return [`${phrase} ${number} ${unit}`, `${phrase} for ${number} ${unit}`]
  })
}

// "[unk]" lets the recogniser reject speech that is not one of the phrases instead of forcing a match.
const GRAMMAR = JSON.stringify([
  ...VOICE_COMMANDS.flatMap((command) =>
    command.timed ? [...command.phrases, ...command.phrases.flatMap(timedPhrases)] : command.phrases,
  ),
  '[unk]',
])

function findAction(rest) {
  if (rest.includes('left')) return 'left'
  if (rest.includes('right')) return 'right'
  if (rest.includes('back') || rest.includes('reverse')) return 'backward'
  if (rest.includes('forward') || rest.includes('go')) return 'forward'
  return null
}

export function parseVoiceCommand(text) {
  const words = text.split(/\s+/).filter((word) => word && word !== '[unk]')

  if (words.includes('stop')) return { action: 'stop' }

  const carIndex = words.lastIndexOf('car')
  if (carIndex === -1) return null

  const rest = words.slice(carIndex + 1)
  const action = findAction(rest)
  if (!action) return null

  const numberIndex = NUMBER_WORDS.findIndex((number) => rest.includes(number))
  const timed = numberIndex !== -1 && (action === 'forward' || action === 'backward')
  return timed ? { action, seconds: numberIndex + 1 } : { action }
}

let modelPromise = null

function loadModel() {
  if (!modelPromise) {
    modelPromise = import('vosk-browser')
      .then((vosk) => {
        const { Model } = vosk.Model ? vosk : vosk.default
        const model = new Model(MODEL_URL)
        return new Promise((resolve, reject) => {
          model.on('load', (message) => {
            if (message.result) resolve(model)
            else reject(new Error('Voice model failed to load'))
          })
          model.on('error', (message) => reject(new Error(message.error)))
        })
      })
      .catch((error) => {
        modelPromise = null
        throw error
      })
  }
  return modelPromise
}

export function useVoiceControl(onCommand) {
  const [status, setStatus] = useState('off')
  const [error, setError] = useState('')
  const [heard, setHeard] = useState('')
  const [lastAction, setLastAction] = useState(null)

  const sessionRef = useRef(null)
  const onCommandRef = useRef(onCommand)
  const stopFiredRef = useRef(false)

  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])

  const runAction = useCallback((command) => {
    setLastAction({ ...command, time: Date.now() })
    onCommandRef.current(command)
  }, [])

  const stopListening = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    if (!session) return

    session.processor.disconnect()
    session.source.disconnect()
    session.stream.getTracks().forEach((track) => track.stop())
    session.audioContext.close()
    session.recognizer.remove()
  }, [])

  const startListening = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('Microphone access is not available. Open the page over HTTPS or localhost.')
      return
    }

    setStatus('loading')
    setError('')
    setHeard('')

    let stream
    try {
      // Ask for the mic first so the permission prompt is tied to the button press.
      stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      const model = await loadModel()

      const audioContext = new AudioContext()
      const recognizer = new model.KaldiRecognizer(audioContext.sampleRate, GRAMMAR)

      recognizer.on('partialresult', (message) => {
        const partial = message.result.partial
        if (!partial) return
        setHeard(partial)
        // React to "stop" as soon as it is heard instead of waiting for the end of the phrase.
        if (!stopFiredRef.current && parseVoiceCommand(partial)?.action === 'stop') {
          stopFiredRef.current = true
          runAction({ action: 'stop' })
        }
      })

      recognizer.on('result', (message) => {
        const text = message.result.text
        const alreadyStopped = stopFiredRef.current
        stopFiredRef.current = false
        if (!text) return

        setHeard(text)
        const command = parseVoiceCommand(text)
        if (command && !(command.action === 'stop' && alreadyStopped)) {
          runAction(command)
        }
      })

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (event) => {
        try {
          recognizer.acceptWaveform(event.inputBuffer)
        } catch (processError) {
          console.error('Voice recognition failed', processError)
        }
      }
      source.connect(processor)
      processor.connect(audioContext.destination)

      sessionRef.current = { stream, audioContext, source, processor, recognizer }
      setStatus('listening')
    } catch (startError) {
      stream?.getTracks().forEach((track) => track.stop())
      setStatus('error')
      setError(String(startError?.message || startError))
    }
  }, [runAction])

  const toggleListening = useCallback(() => {
    if (status === 'loading') return

    if (status === 'listening') {
      stopListening()
      setStatus('off')
      // Voice drive commands keep running, so turning the mic off must not leave the car moving.
      runAction({ action: 'stop' })
      return
    }

    startListening()
  }, [runAction, startListening, status, stopListening])

  useEffect(() => stopListening, [stopListening])

  return { status, error, heard, lastAction, toggleListening }
}
