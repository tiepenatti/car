import { useCallback, useEffect, useRef, useState } from 'react'

const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123'
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123'

const PORT_A = 0x00 // steering
const PORT_B = 0x01 // rear traction
const PORT_C = 0x02
const PORT_D = 0x03 // front traction
const PORT_HUB_TILT = 0x63 // built-in tilt sensor (mode 0: yaw/pitch/roll in degrees)
const HUB_ATTACHED_IO = 0x04
const ERROR_MESSAGE = 0x05
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
}

const MESSAGE_TYPE_LABELS = {
  [HUB_ATTACHED_IO]: 'Attached I/O',
  [ERROR_MESSAGE]: 'Error',
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

    if (subCommand === 0x13 && bytes.length >= 10) {
      const target = int32FromBytes(bytes, 6)

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
    0x0a,
    0x00,
    PORT_OUTPUT_COMMAND,
    port,
    STARTUP_AND_COMPLETION,
    0x13,
    ...int32ToBytes(position),
  ])
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
  const [servoPulseMs, setServoPulseMs] = useState(50)
  const [servoSpeedPct, setServoSpeedPct] = useState(100)
  const [servoPosition, setServoPosition] = useState(0)
  const [distanceSensor, setDistanceSensor] = useState({
    value: null,
    raw: '',
    mode: DISTANCE_SENSOR_MODE,
    format: DATA_FORMAT_LABELS[0x00],
    datasets: 1,
    decimals: 0,
    notifyEnabled: false,
  })

  const sensorAttachedRef = useRef(() => {})
  const deviceRef = useRef(null)
  const characteristicRef = useRef(null)

  const driveSpeedRef = useRef(0)
  const steeringTargetRef = useRef(0)
  const portDSpeedRef = useRef(0)

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
      appendLog('RX', 'Hub notification', bytes)

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
    [appendLog],
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
    setConnected(false)
    setStatus('Disconnected')
  }, [clearPressedKeys, handleNotification, updateSteeringTarget])

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

  const stopSteering = useCallback(async () => {
    await steerTo(0, 'Center steering')
  }, [steerTo])

  const pulseSteering = useCallback(
    (direction) => {
      const power = direction < 0 ? -servoSpeedPct : servoSpeedPct
      const dir = direction < 0 ? 'left' : 'right'
      writeCommand(`Steer pulse ${dir} ${servoSpeedPct}% ${servoPulseMs}ms`, buildStartPowerCommand(PORT_A, power))
      setTimeout(() => {
        writeCommand('Steer pulse brake', buildStartPowerCommand(PORT_A, 127))
      }, servoPulseMs)
    },
    [servoPulseMs, servoSpeedPct, writeCommand],
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

  const stopAll = useCallback(async () => {
    stopSteering()
    await setDrive(0)
  }, [setDrive, stopSteering])

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
    zeroSteeringEncoder,
  ])

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
    servoPulseMs,
    setServoPulseMs,
    servoSpeedPct,
    setServoSpeedPct,
    servoPosition,
    drivePower: DRIVE_POWER,
    connect,
    disconnect,
    clearCommandLog,
    pulseSteering,
    setDrive,
    stopAll,
    forceStopSteering,
  }
}
