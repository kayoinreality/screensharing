/**
 * Presets e tipos de qualidade.
 *
 * A qualidade e aplicada em dois lugares diferentes e complementares:
 *   1. captura  -> constraints do getDisplayMedia (resolucao e fps de entrada)
 *   2. envio    -> RTCRtpSender.setParameters (bitrate, fps e degradacao)
 * Trocar de preset ao vivo mexe nos dois, sem renegociar SDP.
 */

export type DegradationPreference = 'balanced' | 'maintain-framerate' | 'maintain-resolution'

/** 'auto' resolve para H.264, unico com encode por hardware garantido no Windows. */
export type VideoCodec = 'auto' | 'h264' | 'vp9' | 'av1'

export interface QualitySettings {
  /** Altura maxima em px. null = resolucao nativa da fonte. */
  maxHeight: number | null
  fps: number
  maxBitrateKbps: number
  degradation: DegradationPreference
  codec: VideoCodec
  /** Capturar audio do sistema (loopback WASAPI) junto com o video. */
  audio: boolean
}

export type PresetId = 'leve' | 'filme' | 'jogo' | 'maxima' | 'custom'

export interface Preset {
  id: PresetId
  label: string
  hint: string
  settings: QualitySettings
}

/**
 * Bitrates sao altos de proposito: em LAN a rede sobra e o gargalo real e o
 * encoder. `maintain-framerate` prioriza fluidez (jogo); `maintain-resolution`
 * prioriza nitidez (filme, texto, slides).
 */
export const PRESETS: Preset[] = [
  {
    id: 'leve',
    label: 'Leve',
    hint: 'Wi-Fi fraco ou PC antigo',
    settings: {
      maxHeight: 720,
      fps: 30,
      maxBitrateKbps: 3000,
      degradation: 'balanced',
      codec: 'auto',
      audio: true
    }
  },
  {
    id: 'filme',
    label: 'Filme',
    hint: 'Nitidez constante, 30fps',
    settings: {
      maxHeight: 1080,
      fps: 30,
      maxBitrateKbps: 8000,
      degradation: 'maintain-resolution',
      codec: 'auto',
      audio: true
    }
  },
  {
    id: 'jogo',
    label: 'Jogo',
    hint: 'Fluidez acima de tudo, 60fps',
    settings: {
      maxHeight: 1080,
      fps: 60,
      maxBitrateKbps: 12000,
      degradation: 'maintain-framerate',
      codec: 'auto',
      audio: true
    }
  },
  {
    id: 'maxima',
    label: 'Máxima',
    hint: 'Resolução nativa, 60fps, exige rede cabeada',
    settings: {
      maxHeight: null,
      fps: 60,
      maxBitrateKbps: 25000,
      degradation: 'maintain-framerate',
      codec: 'auto',
      audio: true
    }
  }
]

export const DEFAULT_PRESET_ID: PresetId = 'filme'

export function presetById(id: PresetId): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

export function defaultSettings(): QualitySettings {
  return { ...presetById(DEFAULT_PRESET_ID)!.settings }
}

// Limites dos controles do modo Personalizado.
export const FPS_OPTIONS = [15, 24, 30, 48, 60] as const
export const HEIGHT_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 720, label: '720p' },
  { value: 1080, label: '1080p' },
  { value: 1440, label: '1440p' },
  { value: null, label: 'Nativa' }
]
export const BITRATE_MIN_KBPS = 1000
export const BITRATE_MAX_KBPS = 40000
export const BITRATE_STEP_KBPS = 500

export const CODEC_OPTIONS: Array<{ value: VideoCodec; label: string; hint: string }> = [
  { value: 'auto', label: 'Automático', hint: 'H.264 por hardware. Menor uso de CPU.' },
  { value: 'h264', label: 'H.264', hint: 'Força H.264 mesmo sem hardware.' },
  { value: 'vp9', label: 'VP9', hint: 'Mais nítido no mesmo bitrate, mais CPU.' },
  { value: 'av1', label: 'AV1', hint: 'Melhor compressão. Só use com CPU forte.' }
]

/** Compara com os presets para saber se o usuario esta em modo Personalizado. */
export function matchPreset(s: QualitySettings): PresetId {
  const found = PRESETS.find(
    (p) =>
      p.settings.maxHeight === s.maxHeight &&
      p.settings.fps === s.fps &&
      p.settings.maxBitrateKbps === s.maxBitrateKbps &&
      p.settings.degradation === s.degradation &&
      p.settings.codec === s.codec &&
      p.settings.audio === s.audio
  )
  return found ? found.id : 'custom'
}
