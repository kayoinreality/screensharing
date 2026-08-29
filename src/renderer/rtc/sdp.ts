import type { VideoCodec } from '@shared/quality'

/**
 * Ajustes de SDP e de codec.
 *
 * O Opus do WebRTC vem mono e em ~64kbps por padrao, o que e razoavel para
 * uma chamada de voz e ruim para a trilha de um filme. Os parametros so entram
 * pelo `a=fmtp`, entao nao ha como pedir isso pela API — tem que ser no texto.
 */

const OPUS_RTPMAP = /a=rtpmap:(\d+) opus\/48000\/2/i

export function preferOpusStereo(sdp: string, bitrateBps = 192_000): string {
  const match = sdp.match(OPUS_RTPMAP)
  if (!match) return sdp

  const pt = match[1]
  const params = [
    'stereo=1',
    'sprop-stereo=1',
    `maxaveragebitrate=${bitrateBps}`,
    'useinbandfec=1'
  ]

  const lines = sdp.split(/\r\n|\n/)
  const fmtpIndex = lines.findIndex((l) => l.startsWith(`a=fmtp:${pt} `))

  if (fmtpIndex >= 0) {
    const existing = lines[fmtpIndex].slice(`a=fmtp:${pt} `.length)
    const keys = new Set(existing.split(';').map((kv) => kv.split('=')[0].trim()))
    const additions = params.filter((p) => !keys.has(p.split('=')[0]))
    if (additions.length) lines[fmtpIndex] = `a=fmtp:${pt} ${existing};${additions.join(';')}`
  } else {
    const rtpmapIndex = lines.findIndex((l) => l.startsWith(`a=rtpmap:${pt} `))
    if (rtpmapIndex < 0) return sdp
    lines.splice(rtpmapIndex + 1, 0, `a=fmtp:${pt} ${params.join(';')}`)
  }

  // O SDP precisa voltar com CRLF: alguns parsers rejeitam LF sozinho.
  return lines.join('\r\n')
}

const MIME_BY_CODEC: Record<Exclude<VideoCodec, 'auto'>, string> = {
  h264: 'video/H264',
  vp9: 'video/VP9',
  av1: 'video/AV1'
}

/**
 * Reordena os codecs do transceiver deixando o escolhido na frente.
 *
 * Os outros continuam na lista: se a outra ponta nao suportar o preferido, a
 * negociacao ainda fecha em vez de falhar. 'auto' resolve para H.264, que e o
 * unico com encode por hardware garantido em NVIDIA, Intel e AMD no Windows —
 * e isso e o que decide se da para jogar enquanto transmite.
 */
export function applyCodecPreference(
  transceiver: RTCRtpTransceiver,
  codec: VideoCodec
): void {
  const capabilities = RTCRtpSender.getCapabilities('video')
  if (!capabilities?.codecs?.length) return

  const wanted = MIME_BY_CODEC[codec === 'auto' ? 'h264' : codec]
  const preferred = capabilities.codecs.filter(
    (c) => c.mimeType.toLowerCase() === wanted.toLowerCase()
  )
  if (!preferred.length) return

  const rest = capabilities.codecs.filter(
    (c) => c.mimeType.toLowerCase() !== wanted.toLowerCase()
  )

  try {
    transceiver.setCodecPreferences([...preferred, ...rest])
  } catch (err) {
    // Navegador sem suporte ao codec pedido: seguir com a ordem padrao.
    console.warn('[rtc] setCodecPreferences falhou:', err)
  }
}
