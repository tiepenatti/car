import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'

const MODEL_URL =
  import.meta.env.VITE_POSE_MODEL_URL ??
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

export function confidenceOptions(confidence) {
  return {
    minPoseDetectionConfidence: confidence,
    minPosePresenceConfidence: confidence,
    minTrackingConfidence: confidence,
  }
}

function create(delegate, confidence) {
  return PoseLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      ...confidenceOptions(confidence),
    },
  )
}

export async function createPoseLandmarker(confidence) {
  let landmarker
  try {
    landmarker = await create('GPU', confidence)
  } catch (error) {
    console.warn('GPU pose detection unavailable, falling back to CPU', error)
    landmarker = await create('CPU', confidence)
  }
  return { landmarker, DrawingUtils, connections: PoseLandmarker.POSE_CONNECTIONS, confidenceOptions }
}
