import { useCallback, useEffect, useRef, useState } from 'react'

const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123'
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123'

const PORT_A = 0x00 // steering
const PORT_B = 0x01 // rear traction
const PORT_C = 0x02
const PORT_D = 0x03 // front traction
const PORT_HUB_TILT = 0x63 // built-in tilt sensor (mode 0: yaw/pitch/roll in degrees)
const PORT_HUB_VOLTAGE = 0x3c // built-in battery voltage sensor (mode 0: raw DATA16)
const HUB_ATTACHED_IO = 0x04
const ERROR_MESSAGE = 0x05
const PORT_INFO_REQUEST = 0x21
const PORT_INFO_VALUE = 0x00
const PORT_MODE_INFO = 0x44
const PORT_VALUE_SINGLE = 0x45
const PORT_INPUT_FORMAT_SINGLE = 0x47
const PORT_OUTPUT_COMMAND = 0x81
const PORT_OUTPUT_COMMAND_FEEDBACK = 0x82
const DISTANCE_SENSOR_MODE = 0x00
const MODE_INFO_VALUE_FORMAT = 0x80
const DISTANCE_DELTA = 1

const DRIVE_BRAKE_POWER = 127
const DRIVE_POWER = 100
const PORT_D_TEST_POWER = 100
const STEERING_SPEED = 60
const STEERING_STEP = 8
const STEERING_MAX = 40
const MAX_POWER = 100
const HOLD_END_STATE = 126
const FLOAT_END_STATE = 0
const STARTUP_AND_COMPLETION = 0x11
const STARTUP_IMMEDIATE = 0x01
const COMMAND_LOG_LIMIT = 80
const WRITE_DIRECT_MODE_DATA = 0x51
const STEERING_POSITION_MODE = 0x02
const STEERING_SETTINGS_KEY = 'car.steeringSettings'
const DEFAULT_STEERING_LIMIT = 40
// Keeps the servo loop from pushing against the mechanical end stops.
const STEERING_LIMIT_MARGIN = 5
const SERVO_SETTLE_MS = 80
const SERVO_HOLD_CHECK_MS = 150
const SERVO_MIN_PULSE_MS = 20
const SERVO_STALL_PULSES = 4
const SERVO_LOCK_STALL_PULSES = 2
const FULL_LOCK_FRACTION = 0.95
const CALIBRATION_POLL_MS = 40
const CALIBRATION_STALL_MS = 400
const CALIBRATION_TIMEOUT_MS = 4000
const CALIBRATION_MIN_RANGE = 20
const BATTERY_POLL_MS = 15000
// Technic Hub voltage scale: raw 3893 = 9.615 V.
const VOLTAGE_RAW_TO_VOLTS = 9.615 / 3893

const DATA_FORMAT_LABELS = {
  0x00: 'DATA8',
  0x01: 'DATA16',
  0x02: 'DATA32',
  0x03: 'DATAF',
}

const PORT_LABELS = {
  [PORT_A]: 'A',
  [PORT_B]: 'B',
  [PORT_C]: 'C',
  [PORT_D]: 'D',
  [PORT_HUB_TILT]: 'Tilt',
  [PORT_HUB_VOLTAGE]: 'Voltage',
}

const MESSAGE_TYPE_LABELS = {
  [HUB_ATTACHED_IO]: 'Attached I/O',
  [ERROR_MESSAGE]: 'Error',
  [PORT_INFO_REQUEST]: 'Port value request',
  0x22: 'Mode info request',
  0x41: 'Input format setup',
  [PORT_MODE_INFO]: 'Mode info',
  [PORT_VALUE_SINGLE]: 'Port value',
  [PORT_INPUT_FORMAT_SINGLE]: 'Input format',
  [PORT_OUTPUT_COMMAND]: 'Motor command',
  [PORT_OUTPUT_COMMAND_FEEDBACK]: 'Command feedback',
}

const DEVICE_KIND_LABELS = {
  0x25: 'BOOST distance sensor',
  0x2e: 'Technic large motor',
  0x2f: 'Technic XL motor',
  0x3e: 'SPIKE ultrasonic sensor',
  0x4b: 'Technic medium angular motor',
  0x4c: 'Technic large angular motor',
}

const IO_EVENT_LABELS = {
  0x00: 'Detached',
  0x01: 'Attached',
  0x02: 'Attached virtual',
}

const ERROR_CODE_LABELS = {
  0x01: 'ACK',
  0x02: 'NACK',
  0x03: 'Buffer overflow',
  0x04: 'Timeout',
  0x05: 'Unknown command',
  0x06: 'Invalid parameters',
  0x07: 'Over current',
  0x08: 'Internal error',
}

const FEEDBACK_FLAG_LABELS = {
  0x01: 'in progress',
  0x02: 'completed',
  0x04: 'discarded',
  0x08: 'idle',
  0x10: 'busy',
}

function speedToByte(speed) {
  return speed < 0 ? 256 + speed : speed
}

function int32ToBytes(value) {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ')
}

function signedByte(value) {
  return value > 127 ? value - 256 : value
}

function int32FromBytes(bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getInt32(offset, true)
}

function uint16FromBytes(bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getUint16(offset, true)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function portName(port) {
  return PORT_LABELS[port] || String(port)
}

function deviceKindName(kind) {
  return DEVICE_KIND_LABELS[kind] || `Device 0x${kind.toString(16)}`
}

function endStateName(value) {
  if (value === 0) return 'float'
  if (value === 126) return 'hold'
  if (value === 127) return 'brake'
  return `0x${value.toString(16)}`
}

function describeFeedbackFlags(value) {
  const labels = Object.entries(FEEDBACK_FLAG_LABELS)
    .filter(([flag]) => value & Number(flag))
    .map(([, label]) => label)

  return labels.length > 0 ? labels.join(', ') : `0x${value.toString(16)}`
}

function describeMessage(label, payload, note) {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload)
  const type = bytes[2]
  const fallback = {
    typeLabel: MESSAGE_TYPE_LABELS[type] || `0x${(type ?? 0).toString(16)}`,
    portLabel: bytes.length > 3 ? portName(bytes[3]) : '-',
    summary: label,
    detail: note,
  }

  if (bytes.length < 3) {
    return fallback
  }

  if (type === PORT_OUTPUT_COMMAND && bytes.length >= 7) {
    const port = bytes[3]
    const subCommand = bytes[5]

    if (subCommand === 0x01 && bytes.length >= 7) {
      const power = signedByte(bytes[6])
      let summary = label

      if (power === DRIVE_BRAKE_POWER) {
        summary = 'Brake motor'
      } else if (power === 0) {
        summary = 'Float motor'
      } else {
        summary = `Run ${power > 0 ? 'forward' : 'reverse'} at ${Math.abs(power)}% power`
      }

      return {
        typeLabel: 'Motor command',
        portLabel: portName(port),
        summary,
        detail: `StartPower on port ${portName(port)}`,
      }
    }

    if (subCommand === 0x0d && bytes.length >= 14) {
      const target = int32FromBytes(bytes, 6)
      const speed = bytes[10]
      const maxPower = bytes[11]
      const endState = bytes[12]
      const useProfile = bytes[13]

      return {
        typeLabel: 'Motor command',
        portLabel: portName(port),
        summary: `Steer to ${target} deg`,
        detail: `GotoAbsolutePosition speed ${speed}%, max power ${maxPower}%, end ${endStateName(endState)}, profile ${useProfile}`,
      }
    }

    if (subCommand === WRITE_DIRECT_MODE_DATA && bytes[6] === STEERING_POSITION_MODE && bytes.length >= 11) {
      const target = int32FromBytes(bytes, 7)

      return {
        typeLabel: 'Motor command',
        portLabel: portName(port),
        summary: target === 0 ? 'Reset encoder to zero' : `Preset encoder to ${target}`,
        detail: `PresetEncoder on port ${portName(port)}`,
      }
    }

    return fallback
  }

  if (type === 0x22 && bytes.length >= 6) {
    return {
      typeLabel: 'Mode info request',
      portLabel: portName(bytes[3]),
      summary: `Request mode ${bytes[4]} format`,
      detail: `Info kind 0x${bytes[5].toString(16)}`,
    }
  }

  if (type === 0x41 && bytes.length >= 10) {
    const notify = bytes[9] ? 'on' : 'off'
    return {
      typeLabel: 'Input format setup',
      portLabel: portName(bytes[3]),
      summary: `Mode ${bytes[4]} notifications ${notify}`,
      detail: `Delta ${int32FromBytes(bytes, 5)}`,
    }
  }

  if (type === HUB_ATTACHED_IO && bytes.length >= 5) {
    const event = bytes[4]
    if (event === 0x00) {
      return {
        typeLabel: 'Attached I/O',
        portLabel: portName(bytes[3]),
        summary: 'Device detached',
        detail: `Port ${portName(bytes[3])}`,
      }
    }

    if (event === 0x01 && bytes.length >= 7) {
      const device = uint16FromBytes(bytes, 5)
      return {
        typeLabel: 'Attached I/O',
        portLabel: portName(bytes[3]),
        summary: `${deviceKindName(device)} attached`,
        detail: IO_EVENT_LABELS[event],
      }
    }

    if (event === 0x02 && bytes.length >= 9) {
      const device = uint16FromBytes(bytes, 5)
      return {
        typeLabel: 'Attached I/O',
        portLabel: portName(bytes[3]),
        summary: `${deviceKindName(device)} virtual port`,
        detail: `Backed by ${portName(bytes[7])} + ${portName(bytes[8])}`,
      }
    }
  }

  if (type === ERROR_MESSAGE && bytes.length >= 5) {
    return {
      typeLabel: 'Error',
      portLabel: '-',
      summary: ERROR_CODE_LABELS[bytes[4]] || `Error 0x${bytes[4].toString(16)}`,
      detail: `For message ${MESSAGE_TYPE_LABELS[bytes[3]] || `0x${bytes[3].toString(16)}`}`,
    }
  }

  if (type === PORT_OUTPUT_COMMAND_FEEDBACK && bytes.length >= 5) {
    const parts = []
    for (let index = 3; index + 1 < bytes.length; index += 2) {
      parts.push(`${portName(bytes[index])}: ${describeFeedbackFlags(bytes[index + 1])}`)
    }

    return {
      typeLabel: 'Command feedback',
      portLabel: '-',
      summary: 'Hub execution feedback',
      detail: parts.join(' | '),
    }
  }

  if (type === PORT_MODE_INFO && bytes.length >= 10) {
    return {
      typeLabel: 'Mode info',
      portLabel: portName(bytes[3]),
      summary: `Mode ${bytes[4]} format received`,
      detail: `${DATA_FORMAT_LABELS[bytes[7]] || 'Unknown'} with ${bytes[6]} dataset(s)`,
    }
  }

  if (type === PORT_INPUT_FORMAT_SINGLE && bytes.length >= 10) {
    return {
      typeLabel: 'Input format',
      portLabel: portName(bytes[3]),
      summary: `Mode ${bytes[4]} notifications ${bytes[9] ? 'enabled' : 'disabled'}`,
      detail: `Delta ${int32FromBytes(bytes, 5)}`,
    }
  }

  if (type === PORT_VALUE_SINGLE && bytes.length >= 5) {
    return {
      typeLabel: 'Port value',
      portLabel: portName(bytes[3]),
      summary: `Value update on port ${portName(bytes[3])}`,
      detail: `Payload ${bytes.length - 4} byte(s)`,
    }
  }

  return fallback
}

function makeTimestamp() {
  const now = new Date()
  return `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, '0')}`
}

function buildStartPowerCommand(port, power) {
  return new Uint8Array([
    0x08,
    0x00,
    PORT_OUTPUT_COMMAND,
    port,
    STARTUP_AND_COMPLETION,
    0x01,
    speedToByte(power),
    0x00,
  ])
}

function buildGoToAbsolutePositionCommand(port, position, speed) {
  return new Uint8Array([
    0x0e,
    0x00,
    PORT_OUTPUT_COMMAND,
    port,
    STARTUP_IMMEDIATE,
    0x0d,
    ...int32ToBytes(position),
    speed,
    MAX_POWER,
    FLOAT_END_STATE,
    0x00,
  ])
}

function buildPresetEncoderCommand(port, position) {
  return new Uint8Array([
    0x0b,
    0x00,
    PORT_OUTPUT_COMMAND,
    port,
    STARTUP_AND_COMPLETION,
    WRITE_DIRECT_MODE_DATA,
    STEERING_POSITION_MODE,
    ...int32ToBytes(position),
  ])
}

function loadSteeringSettings() {
  try {
    return JSON.parse(localStorage.getItem(STEERING_SETTINGS_KEY)) || {}
  } catch {
    return {}
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildPortInputFormatSetupCommand(port, mode, delta, notify) {
  return new Uint8Array([
    0x0a,
    0x00,
    0x41,
    port,
    mode,
    delta & 0xff,
    (delta >> 8) & 0xff,
    (delta >> 16) & 0xff,
    (delta >> 24) & 0xff,
    notify ? 0x01 : 0x00,
  ])
}

function buildPortModeInfoRequestCommand(port, mode, infoKind) {
  return new Uint8Array([0x06, 0x00, 0x22, port, mode, infoKind])
}

function buildPortValueRequestCommand(port) {
  return new Uint8Array([0x05, 0x00, PORT_INFO_REQUEST, port, PORT_INFO_VALUE])
}

function decodeDistanceValue(payload, format, datasets) {
  const buffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
  const view = new DataView(buffer)
  const count = Math.max(datasets || 1, 1)
  const values = []

  for (let index = 0; index < count; index += 1) {
    let value = null

    if (format === 0x00 && view.byteLength >= index + 1) {
      value = view.getInt8(index)
    } else if (format === 0x01 && view.byteLength >= (index + 1) * 2) {
      value = view.getInt16(index * 2, true)
    } else if (format === 0x02 && view.byteLength >= (index + 1) * 4) {
      value = view.getInt32(index * 4, true)
    } else if (format === 0x03 && view.byteLength >= (index + 1) * 4) {
      value = view.getFloat32(index * 4, true)
    }

    if (value !== null) {
      values.push(value)
    }
  }

  if (values.length === 0) {
    return null
  }

  return values.length === 1 ? values[0] : values
}

export function useLegoHubController() {
  const [status, setStatus] = useState('Disconnected')
  const [connected, setConnected] = useState(false)
  const [commandLog, setCommandLog] = useState([])
  const [savedSettings] = useState(loadSteeringSettings)
  const [servoPulseMs, setServoPulseMs] = useState(savedSettings.pulseMs ?? 50)
  const [servoSpeedPct, setServoSpeedPct] = useState(savedSettings.speedPct ?? 100)
  const [servoPosition, setServoPosition] = useState(0)
  const [steeringAngle, setSteeringAngle] = useState(null)
  const [steeringMotor, setSteeringMotor] = useState(null)
  const [steeringLimits, setSteeringLimits] = useState(
    savedSettings.limits ?? { left: DEFAULT_STEERING_LIMIT, right: DEFAULT_STEERING_LIMIT },
  )
  const [steeringCalibrated, setSteeringCalibrated] = useState(savedSettings.calibrated ?? false)
  const [steeringTolerance, setSteeringTolerance] = useState(savedSettings.tolerance ?? 4)
  const [fullLockEnabled, setFullLockEnabled] = useState(savedSettings.fullLock ?? false)
  const [calibration, setCalibration] = useState({ running: false, message: '' })
  const [distanceSensor, setDistanceSensor] = useState({
    value: null,
    raw: '',
    mode: DISTANCE_SENSOR_MODE,
    format: DATA_FORMAT_LABELS[0x00],
    datasets: 1,
    decimals: 0,
    notifyEnabled: false,
  })
  const [batteryVoltage, setBatteryVoltage] = useState(null)

  const sensorAttachedRef = useRef(() => {})
  const steeringAttachedRef = useRef(() => {})
  const deviceRef = useRef(null)
  const characteristicRef = useRef(null)

  const driveSpeedRef = useRef(0)
  const steeringTargetRef = useRef(0)
  const portDSpeedRef = useRef(0)

  const steeringAngleRef = useRef(null)
  const servoTargetRef = useRef(null)
  const servoLockRef = useRef(0)
  const servoLockedAtRef = useRef(null)
  const servoTimerRef = useRef(null)
  const servoPulseLengthRef = useRef(0)
  // Learned degrees per millisecond of pulse, so pulses can be sized to the remaining error.
  const servoRateRef = useRef(null)
  const servoLastPulseRef = useRef(null)
  const servoLastDirectionRef = useRef(0)
  const servoStallRef = useRef({ count: 0, position: null })
  const calibratingRef = useRef(false)
  const servoSettingsRef = useRef({})
  const steeringLimitsRef = useRef(steeringLimits)
  const fullLockRef = useRef(fullLockEnabled)

  useEffect(() => {
    servoSettingsRef.current = { pulseMs: servoPulseMs, speedPct: servoSpeedPct, tolerance: steeringTolerance }
    steeringLimitsRef.current = steeringLimits
    fullLockRef.current = fullLockEnabled
    localStorage.setItem(
      STEERING_SETTINGS_KEY,
      JSON.stringify({
        pulseMs: servoPulseMs,
        speedPct: servoSpeedPct,
        tolerance: steeringTolerance,
        limits: steeringLimits,
        calibrated: steeringCalibrated,
        fullLock: fullLockEnabled,
      }),
    )
  }, [servoPulseMs, servoSpeedPct, steeringTolerance, steeringLimits, steeringCalibrated, fullLockEnabled])

  // The learned pulse rate only holds for the power it was measured at.
  useEffect(() => {
    servoRateRef.current = null
  }, [servoSpeedPct])

  const updateSteeringAngle = useCallback((value) => {
    steeringAngleRef.current = value
    setSteeringAngle(value)
  }, [])

  const updateSteeringTarget = useCallback((value) => {
    steeringTargetRef.current = value
    setServoPosition(value)
  }, [])

  const distanceFormatRef = useRef({
    mode: DISTANCE_SENSOR_MODE,
    dataFormat: 0x00,
    datasets: 1,
    decimals: 0,
  })
  const pressedKeysRef = useRef({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    w: false,
    s: false,
    d: false,
  })

  const clearPressedKeys = useCallback(() => {
    pressedKeysRef.current = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      w: false,
      s: false,
      d: false,
    }
  }, [])

  const appendLog = useCallback((direction, label, payload, note = '') => {
    const bytes = bytesToHex(payload)
    const parsed = describeMessage(label, payload, note)

    setCommandLog((previous) => {
      const nextEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        time: makeTimestamp(),
        direction,
        label: parsed.summary,
        typeLabel: parsed.typeLabel,
        portLabel: parsed.portLabel,
        detail: parsed.detail,
        bytes,
        note,
      }

      return [nextEntry, ...previous].slice(0, COMMAND_LOG_LIMIT)
    })
  }, [])

  const clearCommandLog = useCallback(() => {
    setCommandLog([])
  }, [])



  const handleNotification = useCallback(
    (event) => {
      const dataView = event.target.value
      if (!dataView) return

      const bytes = new Uint8Array(
        dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength),
      )

      // Encoder updates arrive for every degree of movement and would bury the command log.
      if (bytes[2] === PORT_VALUE_SINGLE && bytes[3] === PORT_A && bytes.length >= 8) {
        updateSteeringAngle(int32FromBytes(bytes, 4))
        return
      }

      appendLog('RX', 'Hub notification', bytes)

      if (bytes[2] === HUB_ATTACHED_IO && bytes[3] === PORT_A && bytes[4] === 0x01 && bytes.length >= 7) {
        setSteeringMotor(deviceKindName(uint16FromBytes(bytes, 5)))
        steeringAttachedRef.current()
        return
      }

      if (bytes[2] === PORT_VALUE_SINGLE && bytes[3] === PORT_HUB_VOLTAGE && bytes.length >= 6) {
        setBatteryVoltage(uint16FromBytes(bytes, 4) * VOLTAGE_RAW_TO_VOLTS)
        return
      }

      if (bytes[2] === HUB_ATTACHED_IO && bytes[3] === PORT_HUB_TILT && bytes[4] === 0x01) {
        sensorAttachedRef.current()
        return
      }

      if (bytes[2] === PORT_MODE_INFO && bytes[3] === PORT_HUB_TILT && bytes[4] === DISTANCE_SENSOR_MODE && bytes[5] === MODE_INFO_VALUE_FORMAT) {
        distanceFormatRef.current = {
          mode: bytes[4],
          dataFormat: bytes[7],
          datasets: bytes[6],
          decimals: bytes[9],
        }

        setDistanceSensor((previous) => ({
          ...previous,
          mode: bytes[4],
          format: DATA_FORMAT_LABELS[bytes[7]] || `Unknown (${bytes[7]})`,
          datasets: bytes[6],
          decimals: bytes[9],
        }))
        return
      }

      if (bytes[2] === PORT_INPUT_FORMAT_SINGLE && bytes[3] === PORT_HUB_TILT && bytes[4] === DISTANCE_SENSOR_MODE) {
        setDistanceSensor((previous) => ({
          ...previous,
          notifyEnabled: Boolean(bytes[9]),
        }))
        return
      }

      if (bytes[2] === PORT_VALUE_SINGLE && bytes[3] === PORT_HUB_TILT) {
        const payload = bytes.slice(4)
        const decodedValue = decodeDistanceValue(
          payload,
          distanceFormatRef.current.dataFormat,
          distanceFormatRef.current.datasets,
        )

        setDistanceSensor((previous) => ({
          ...previous,
          value: decodedValue,
          raw: bytesToHex(payload),
        }))
      }
    },
    [appendLog, updateSteeringAngle],
  )

  const handleDisconnected = useCallback(() => {
    const currentCharacteristic = characteristicRef.current

    if (currentCharacteristic) {
      currentCharacteristic.removeEventListener('characteristicvaluechanged', handleNotification)
    }

    deviceRef.current = null
    characteristicRef.current = null
    distanceFormatRef.current = {
      mode: DISTANCE_SENSOR_MODE,
      dataFormat: 0x00,
      datasets: 1,
      decimals: 0,
    }
    updateSteeringTarget(0)
    driveSpeedRef.current = 0
    portDSpeedRef.current = 0
    clearPressedKeys()
    setDistanceSensor({
      value: null,
      raw: '',
      mode: DISTANCE_SENSOR_MODE,
      format: DATA_FORMAT_LABELS[0x00],
      datasets: 1,
      decimals: 0,
      notifyEnabled: false,
    })
    setBatteryVoltage(null)
    clearTimeout(servoTimerRef.current)
    servoTargetRef.current = null
    updateSteeringAngle(null)
    setSteeringMotor(null)
    setConnected(false)
    setStatus('Disconnected')
  }, [clearPressedKeys, handleNotification, updateSteeringAngle, updateSteeringTarget])

  const writeCommand = useCallback(
    async (label, command) => {
      const characteristic = characteristicRef.current
      if (!characteristic) return false

      appendLog('TX', label, command)
      try {
        await characteristic.writeValueWithoutResponse(command)
        return true
      } catch (error) {
        appendLog('ERR', label, command, String(error))
        return false
      }
    },
    [appendLog],
  )

  const sendDrivePower = useCallback(
    async (power, label = 'Drive power') => {
      await writeCommand(`${label} rear`, buildStartPowerCommand(PORT_B, power))
      await writeCommand(`${label} front`, buildStartPowerCommand(PORT_D, power))
    },
    [writeCommand],
  )

  const sendPortDPower = useCallback(
    async (power, label = 'Port D test') => {
      if (portDSpeedRef.current === power) {
        return
      }

      portDSpeedRef.current = power
      await writeCommand(label, buildStartPowerCommand(PORT_D, power))
    },
    [writeCommand],
  )

  const forceStopSteering = useCallback(async () => {
    const characteristic = characteristicRef.current
    if (!characteristic) return

    clearTimeout(servoTimerRef.current)
    servoTimerRef.current = null
    servoTargetRef.current = null
    servoLockRef.current = 0
    servoLockedAtRef.current = null
    updateSteeringTarget(0)
    const cmd = buildStartPowerCommand(PORT_A, 0)
    appendLog('TX', 'FORCE STOP steering', cmd)
    try {
      await characteristic.writeValueWithoutResponse(cmd)
    } catch (error) {
      appendLog('ERR', 'FORCE STOP steering', cmd, String(error))
    }
  }, [appendLog, updateSteeringTarget])

  const zeroSteeringEncoder = useCallback(async () => {
    updateSteeringTarget(0)
    await writeCommand('Zero steering encoder', buildPresetEncoderCommand(PORT_A, 0))
  }, [updateSteeringTarget, writeCommand])

  const steerTo = useCallback(
    async (target, label) => {
      if (steeringTargetRef.current === target) {
        return
      }

      updateSteeringTarget(target)
      await writeCommand(label, buildGoToAbsolutePositionCommand(PORT_A, target, STEERING_SPEED))
    },
    [updateSteeringTarget, writeCommand],
  )

  const requestDistanceSensorFormat = useCallback(async () => {
    await writeCommand(
      'Tilt sensor format request',
      buildPortModeInfoRequestCommand(PORT_HUB_TILT, DISTANCE_SENSOR_MODE, MODE_INFO_VALUE_FORMAT),
    )
  }, [writeCommand])

  const enableDistanceSensorNotifications = useCallback(async () => {
    await writeCommand(
      'Enable tilt sensor notifications',
      buildPortInputFormatSetupCommand(PORT_HUB_TILT, DISTANCE_SENSOR_MODE, DISTANCE_DELTA, true),
    )
  }, [writeCommand])

  const setDrive = useCallback(
    async (power) => {
      if (driveSpeedRef.current === power) {
        return
      }

      driveSpeedRef.current = power

      if (power === 0) {
        await sendDrivePower(DRIVE_BRAKE_POWER, 'Brake drive')
        return
      }

      await sendDrivePower(power, 'Drive command')
    },
    [sendDrivePower],
  )

  const cancelServo = useCallback(() => {
    clearTimeout(servoTimerRef.current)
    servoTimerRef.current = null
    servoTargetRef.current = null
    servoLockRef.current = 0
    servoLockedAtRef.current = null
  }, [])

  const learnSteeringLimit = useCallback(
    (direction, position) => {
      const side = direction < 0 ? 'left' : 'right'
      const reach = direction * position
      if (reach <= steeringLimitsRef.current[side]) return

      const next = { ...steeringLimitsRef.current, [side]: reach }
      steeringLimitsRef.current = next
      setSteeringLimits(next)
      appendLog('TX', `Learned ${side} travel ${reach}°`, new Uint8Array(), 'from full lock')
    },
    [appendLog],
  )

  const runServo = useCallback(() => {
    const sendPulse = (direction, length, label) => {
      writeCommand(label, buildStartPowerCommand(PORT_A, direction * servoSettingsRef.current.speedPct))
      setTimeout(() => {
        writeCommand('Servo pulse brake', buildStartPowerCommand(PORT_A, DRIVE_BRAKE_POWER))
      }, length)
    }

    // Full lock ignores the stored limits and pushes until the end stop stops the encoder.
    const lockTick = (lock, position) => {
      const { pulseMs, tolerance } = servoSettingsRef.current
      const lockedAt = servoLockedAtRef.current

      if (lockedAt !== null) {
        if (Math.abs(position - lockedAt) <= tolerance) {
          servoTimerRef.current = setTimeout(tick, SERVO_HOLD_CHECK_MS)
          return
        }
        servoLockedAtRef.current = null
        servoStallRef.current = { count: 0, position: null }
      }

      const stall = servoStallRef.current
      if (stall.position !== null && Math.abs(position - stall.position) < 2) {
        stall.count += 1
      } else {
        servoStallRef.current = { count: 0, position }
      }
      if (servoStallRef.current.count >= SERVO_LOCK_STALL_PULSES) {
        servoLockedAtRef.current = position
        learnSteeringLimit(lock, position)
        servoTimerRef.current = setTimeout(tick, SERVO_HOLD_CHECK_MS)
        return
      }

      sendPulse(lock, pulseMs, `Servo full ${lock < 0 ? 'left' : 'right'} ${pulseMs}ms (at ${position}°)`)
      servoTimerRef.current = setTimeout(tick, pulseMs + SERVO_SETTLE_MS)
    }

    const tick = () => {
      servoTimerRef.current = null
      const target = servoTargetRef.current
      const lock = servoLockRef.current
      const position = steeringAngleRef.current
      if ((target === null && lock === 0) || position === null || calibratingRef.current) return

      if (lock !== 0) {
        lockTick(lock, position)
        return
      }

      const { pulseMs, tolerance } = servoSettingsRef.current
      const error = target - position

      const lastPulse = servoLastPulseRef.current
      servoLastPulseRef.current = null
      if (lastPulse) {
        const moved = Math.abs(position - lastPulse.position)
        const rate = servoRateRef.current
        if (moved >= 1) {
          const measured = moved / lastPulse.length
          servoRateRef.current = rate === null ? measured : (rate + measured) / 2
        } else if (rate !== null) {
          // Too short to break static friction, so assume a slower motor and lengthen the next pulse.
          servoRateRef.current = rate * 0.6
        }
      }

      if (Math.abs(error) <= tolerance) {
        servoLastDirectionRef.current = 0
        servoStallRef.current = { count: 0, position }
        // Once centred the loop lets go, so keyboard and follow-mode pulses are not undone.
        if (target === 0) {
          servoTargetRef.current = null
          return
        }
        servoTimerRef.current = setTimeout(tick, SERVO_HOLD_CHECK_MS)
        return
      }

      const direction = Math.sign(error)
      if (servoLastDirectionRef.current !== 0 && direction !== servoLastDirectionRef.current) {
        servoPulseLengthRef.current = Math.max(SERVO_MIN_PULSE_MS, servoPulseLengthRef.current / 2)
      }
      servoLastDirectionRef.current = direction
      const maxLength = Math.round(servoPulseLengthRef.current || pulseMs)
      const rate = servoRateRef.current
      // Aim slightly short because the wheels keep coasting after the brake.
      const length =
        rate === null ? maxLength : Math.round(clamp((Math.abs(error) * 0.8) / rate, SERVO_MIN_PULSE_MS, maxLength))

      const stall = servoStallRef.current
      if (stall.position !== null && Math.abs(position - stall.position) < 1 && length === maxLength) {
        stall.count += 1
      } else if (stall.position === null || Math.abs(position - stall.position) >= 1) {
        servoStallRef.current = { count: 0, position }
      }
      if (servoStallRef.current.count >= SERVO_STALL_PULSES) {
        appendLog('ERR', `Steering stuck at ${position}° (target ${target}°)`, new Uint8Array(), 'servo gave up')
        servoTargetRef.current = null
        return
      }

      servoLastPulseRef.current = { position, length }
      sendPulse(direction, length, `Servo ${direction < 0 ? 'left' : 'right'} ${length}ms → ${target}° (at ${position}°)`)
      servoTimerRef.current = setTimeout(tick, length + SERVO_SETTLE_MS)
    }

    tick()
  }, [appendLog, learnSteeringLimit, writeCommand])

  // fraction runs from -1 (full left) to 1 (full right) of the calibrated travel.
  const steerServo = useCallback(
    (fraction) => {
      const limits = steeringLimitsRef.current
      const usable = fraction < 0 ? limits.left : limits.right
      const target = Math.round(fraction * Math.max(0, usable - STEERING_LIMIT_MARGIN))
      const lock = fullLockRef.current && Math.abs(fraction) >= FULL_LOCK_FRACTION ? Math.sign(fraction) : 0

      if (steeringAngleRef.current === null) {
        steerTo(target, `Steer → ${target}° (no encoder feedback)`)
        return
      }

      if (lock !== 0) {
        if (servoLockRef.current === lock) return
        servoLockRef.current = lock
        servoLockedAtRef.current = null
        servoTargetRef.current = null
        steeringTargetRef.current = null
        servoStallRef.current = { count: 0, position: null }
        setServoPosition(lock * usable)
        if (servoTimerRef.current === null) runServo()
        return
      }

      let previous = servoTargetRef.current
      if (servoLockRef.current !== 0) {
        servoLockRef.current = 0
        servoLockedAtRef.current = null
        previous = null
      }
      if (previous === target) return

      servoTargetRef.current = target
      steeringTargetRef.current = null
      setServoPosition(target)
      if (previous === null || Math.abs(target - previous) > servoSettingsRef.current.tolerance) {
        servoPulseLengthRef.current = servoSettingsRef.current.pulseMs
        servoLastDirectionRef.current = 0
        servoStallRef.current = { count: 0, position: null }
      }
      if (servoTimerRef.current === null) runServo()
    },
    [runServo, steerTo],
  )

  const calibrateSteering = useCallback(async () => {
    if (calibratingRef.current) return
    if (steeringAngleRef.current === null) {
      setCalibration({ running: false, message: 'No position reading from the steering motor yet.' })
      return
    }

    cancelServo()
    calibratingRef.current = true
    const power = servoSettingsRef.current.speedPct

    const findStop = async (direction) => {
      await writeCommand(
        `Calibrate: push ${direction < 0 ? 'left' : 'right'} ${power}%`,
        buildStartPowerCommand(PORT_A, direction * power),
      )
      const start = Date.now()
      let lastPosition = steeringAngleRef.current
      let lastMove = start
      while (Date.now() - start < CALIBRATION_TIMEOUT_MS) {
        await sleep(CALIBRATION_POLL_MS)
        const position = steeringAngleRef.current
        if (Math.abs(position - lastPosition) >= 2) {
          lastPosition = position
          lastMove = Date.now()
        } else if (Date.now() - lastMove >= CALIBRATION_STALL_MS) {
          break
        }
      }
      await writeCommand('Calibrate: brake', buildStartPowerCommand(PORT_A, DRIVE_BRAKE_POWER))
      await sleep(150)
      return steeringAngleRef.current
    }

    try {
      setCalibration({ running: true, message: 'Finding the left limit…' })
      const left = await findStop(-1)
      setCalibration({ running: true, message: 'Finding the right limit…' })
      const right = await findStop(1)
      const range = right - left

      if (range < CALIBRATION_MIN_RANGE) {
        setCalibration({
          running: false,
          message: `The wheels only moved ${range}°. Raise the servo power and try again.`,
        })
        return
      }

      const center = Math.round((left + right) / 2)
      const position = steeringAngleRef.current
      await writeCommand('Set steering centre', buildPresetEncoderCommand(PORT_A, position - center))
      updateSteeringAngle(position - center)
      const half = Math.floor(range / 2)
      setSteeringLimits({ left: half, right: half })
      steeringLimitsRef.current = { left: half, right: half }
      setSteeringCalibrated(true)
      setCalibration({ running: false, message: `Found ${range}° of travel (±${half}°). Centring the wheels.` })
    } finally {
      calibratingRef.current = false
      setCalibration((previous) => ({ ...previous, running: false }))
    }

    steerServo(0)
  }, [cancelServo, steerServo, updateSteeringAngle, writeCommand])

  const setCurrentAsCenter = useCallback(async () => {
    const position = steeringAngleRef.current ?? 0
    cancelServo()
    await writeCommand('Set steering centre', buildPresetEncoderCommand(PORT_A, 0))
    updateSteeringAngle(0)
    updateSteeringTarget(0)
    if (steeringCalibrated) {
      setSteeringLimits((limits) => ({
        left: Math.max(0, limits.left + position),
        right: Math.max(0, limits.right - position),
      }))
    }
  }, [cancelServo, steeringCalibrated, updateSteeringAngle, updateSteeringTarget, writeCommand])

  const updateSteeringLimits = useCallback((limits) => {
    setSteeringLimits(limits)
    setSteeringCalibrated(false)
  }, [])

  const pulseSteering = useCallback(
    (direction) => {
      const power = direction < 0 ? -servoSpeedPct : servoSpeedPct
      const dir = direction < 0 ? 'left' : 'right'
      cancelServo()
      // The wheel angle is unknown after a pulse, so the next centring command must not be skipped.
      steeringTargetRef.current = null
      writeCommand(`Steer pulse ${dir} ${servoSpeedPct}% ${servoPulseMs}ms`, buildStartPowerCommand(PORT_A, power))
      setTimeout(() => {
        writeCommand('Steer pulse brake', buildStartPowerCommand(PORT_A, 127))
      }, servoPulseMs)
    },
    [cancelServo, servoPulseMs, servoSpeedPct, writeCommand],
  )

  const stepSteering = useCallback(
    async (direction) => {
      const next = clamp(
        steeringTargetRef.current + direction * STEERING_STEP,
        -STEERING_MAX,
        STEERING_MAX,
      )
      await steerTo(next, `Steer ${direction < 0 ? 'left' : 'right'} → ${next}°`)
    },
    [steerTo],
  )

  const steerToAngle = useCallback(
    async (angle) => {
      const target = clamp(Math.round(angle / STEERING_STEP) * STEERING_STEP, -STEERING_MAX, STEERING_MAX)
      await steerTo(target, `Steer → ${target}°`)
    },
    [steerTo],
  )

  const syncDriveFromKeyboard = useCallback(async () => {
    const keys = pressedKeysRef.current

    if (keys.ArrowUp === keys.ArrowDown) {
      await setDrive(0)
    } else if (keys.ArrowUp) {
      await setDrive(-DRIVE_POWER)
    } else {
      await setDrive(DRIVE_POWER)
    }
  }, [setDrive])

  // Always sent, even if the app thinks a motor is already stopped: keyboard and test keys drive the motors directly.
  const stopAll = useCallback(async () => {
    cancelServo()
    driveSpeedRef.current = 0
    portDSpeedRef.current = 0
    await sendDrivePower(DRIVE_BRAKE_POWER, 'STOP drive')
    await writeCommand('STOP steering', buildStartPowerCommand(PORT_A, DRIVE_BRAKE_POWER))
    steeringTargetRef.current = null
    steerServo(0)
  }, [cancelServo, sendDrivePower, steerServo, writeCommand])

  const disconnect = useCallback(async () => {
    await stopAll()

    const device = deviceRef.current
    if (device?.gatt?.connected) {
      device.gatt.disconnect()
      return
    }

    handleDisconnected()
  }, [handleDisconnected, stopAll])

  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      setStatus('Error: Web Bluetooth is not available in this browser.')
      return
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
      })

      if (deviceRef.current && deviceRef.current !== device) {
        deviceRef.current.removeEventListener('gattserverdisconnected', handleDisconnected)
      }

      const server = await device.gatt.connect()
      const service = await server.getPrimaryService(SERVICE_UUID)
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID)

      if (characteristicRef.current) {
        characteristicRef.current.removeEventListener('characteristicvaluechanged', handleNotification)
      }

      characteristic.removeEventListener('characteristicvaluechanged', handleNotification)

      // Listen before enabling notifications so the hub's attach messages are not missed.
      deviceRef.current = device
      characteristicRef.current = characteristic
      device.addEventListener('gattserverdisconnected', handleDisconnected)
      characteristic.addEventListener('characteristicvaluechanged', handleNotification)
      sensorAttachedRef.current = async () => {
        await requestDistanceSensorFormat()
        await enableDistanceSensorNotifications()
      }
      steeringAttachedRef.current = async () => {
        await writeCommand(
          'Enable steering position notifications',
          buildPortInputFormatSetupCommand(PORT_A, STEERING_POSITION_MODE, 1, true),
        )
      }
      await characteristic.startNotifications()
      setConnected(true)
      setStatus(`Connected to ${device.name || 'LEGO Hub'}`)

      await zeroSteeringEncoder()
    } catch (error) {
      setStatus(`Error: ${String(error)}`)
      console.error(error)
    }
  }, [
    enableDistanceSensorNotifications,
    handleDisconnected,
    handleNotification,
    requestDistanceSensorFormat,
    writeCommand,
    zeroSteeringEncoder,
  ])

  useEffect(() => {
    if (!connected) return undefined

    const requestVoltage = () => {
      writeCommand('Battery voltage request', buildPortValueRequestCommand(PORT_HUB_VOLTAGE))
    }

    // Give the hub a moment to finish its attach messages before the first read.
    const firstRead = setTimeout(requestVoltage, 1000)
    const interval = setInterval(requestVoltage, BATTERY_POLL_MS)

    return () => {
      clearTimeout(firstRead)
      clearInterval(interval)
    }
  }, [connected, writeCommand])

  useEffect(() => {
    const steeringTestHeld = { current: false }

    const onKeyDown = (event) => {
      const key = event.shiftKey && event.key.toLowerCase() === 'd' ? 'Shift+d' : event.key

      if (key === 'd' || key === 'Shift+d') {
        if (!pressedKeysRef.current.d) {
          pressedKeysRef.current.d = true
          event.preventDefault()

          const power = key === 'Shift+d' ? -PORT_D_TEST_POWER : PORT_D_TEST_POWER
          sendPortDPower(power, `Port D test ${power > 0 ? 'forward' : 'reverse'} 100%`)
        }
        return
      }

      // Steering test keys (numpad-style layout)
      if (key === '5') {
        event.preventDefault()
        forceStopSteering()
        return
      }

      if (key === '8') {
        event.preventDefault()
        setServoPulseMs((s) => Math.min(1000, s + 20))
        return
      }

      if (key === '2') {
        event.preventDefault()
        setServoPulseMs((s) => Math.max(30, s - 20))
        return
      }

      if (key === 'PageUp') {
        event.preventDefault()
        setServoSpeedPct((s) => Math.min(100, s + 10))
        return
      }

      if (key === 'PageDown') {
        event.preventDefault()
        setServoSpeedPct((s) => Math.max(10, s - 10))
        return
      }

      if (key === '7' || key === '9') {
        event.preventDefault()
        if (!steeringTestHeld.current) {
          steeringTestHeld.current = true
          const power = key === '7' ? -servoSpeedPct : servoSpeedPct
          writeCommand(`Steer test ${key === '7' ? 'left' : 'right'} ${servoSpeedPct}%`, buildStartPowerCommand(PORT_A, power))
        }
        return
      }

      if (key === '4' || key === '6') {
        event.preventDefault()
        const power = key === '4' ? -servoSpeedPct : servoSpeedPct
        const dir = key === '4' ? 'left' : 'right'
        const pulseMs = servoPulseMs * 2
        writeCommand(`Steer pulse ${dir} ${servoSpeedPct}% ${pulseMs}ms`, buildStartPowerCommand(PORT_A, power))
        setTimeout(() => {
          writeCommand(`Steer pulse brake`, buildStartPowerCommand(PORT_A, 127))
        }, pulseMs)
        return
      }

      if (key === '1' || key === '3') {
        event.preventDefault()
        pulseSteering(key === '1' ? -1 : 1)
        return
      }

      if (key === 'ArrowLeft') {
        event.preventDefault()
        stepSteering(-1)
        return
      }

      if (key === 'ArrowRight') {
        event.preventDefault()
        stepSteering(1)
        return
      }

      if (!(key in pressedKeysRef.current)) return
      event.preventDefault()

      if (!pressedKeysRef.current[key]) {
        pressedKeysRef.current[key] = true

        if (key === 'w') {
          sendDrivePower(-100, 'Drive fwd')
          return
        }

        if (key === 's') {
          sendDrivePower(100, 'Drive bwd')
          return
        }

        syncDriveFromKeyboard()
      }
    }

    const onKeyUp = (event) => {
      const key = event.shiftKey && event.key.toLowerCase() === 'd' ? 'Shift+d' : event.key

      if (key === 'd' || key === 'Shift+d') {
        pressedKeysRef.current.d = false
        event.preventDefault()
        sendPortDPower(0, 'Port D stop')
        return
      }

      if (key === '7' || key === '9') {
        event.preventDefault()
        steeringTestHeld.current = false
        writeCommand('Steer test stop', buildStartPowerCommand(PORT_A, 0))
        return
      }

      if (!(key in pressedKeysRef.current)) return
      event.preventDefault()

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault()
        return
      }

      if (!(key in pressedKeysRef.current)) return
      event.preventDefault()

      pressedKeysRef.current[key] = false

      if (key === 'w' || key === 's') {
        sendDrivePower(0, 'Drive stop')
        return
      }

      syncDriveFromKeyboard()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [stepSteering, syncDriveFromKeyboard, sendDrivePower, sendPortDPower, forceStopSteering, pulseSteering, writeCommand, servoPulseMs, servoSpeedPct, updateSteeringTarget])

  return {
    connected,
    status,
    commandLog,
    distanceSensor,
    batteryVoltage,
    servoPulseMs,
    setServoPulseMs,
    servoSpeedPct,
    setServoSpeedPct,
    servoPosition,
    drivePower: DRIVE_POWER,
    steeringMax: STEERING_MAX,
    connect,
    disconnect,
    clearCommandLog,
    pulseSteering,
    steerToAngle,
    setDrive,
    stopAll,
    forceStopSteering,
    steeringAngle,
    steeringMotor,
    steeringLimits,
    setSteeringLimits: updateSteeringLimits,
    steeringCalibrated,
    steeringTolerance,
    setSteeringTolerance,
    calibration,
    calibrateSteering,
    setCurrentAsCenter,
    steerServo,
    fullLockEnabled,
    setFullLockEnabled,
  }
}
