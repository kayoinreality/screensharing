import type { HostToViewer, ViewerToHost } from '@shared/protocol'
import type { QualitySettings } from '@shared/quality'
import { applyCodecPreference, preferOpusStereo } from './sdp'
import { toCandidatePayload } from './ice'
import { StatsSampler, emptyStats, type StreamStats } from './stats'

export type PeerState = 'conectando' | 'conectado' | 'instavel' | 'encerrado'

interface PeerEntry {
  pc: RTCPeerConnection
  videoTransceiver: RTCRtpTransceiver | null
  sampler: StatsSampler
  /** ICE que chegou antes da resposta: addIceCandidate falha sem remoteDescription. */
  pendingIce: RTCIceCandidateInit[]
  state: PeerState
}

/**
 * Lado emissor: uma RTCPeerConnection por espectador (malha simples, ate 4).
 *
 * Todos recebem os mesmos tracks do MESMO MediaStream — e isso que faz o
 * Chromium sincronizar audio e video por RTCP em cada conexao.
 *
 * Nao existe canal de dados nem qualquer via de entrada: este app nao faz
 * controle remoto, entao o espectador nao tem como enviar nada alem de
 * sinalizacao.
 */
export class HostSession {
  private readonly peers = new Map<string, PeerEntry>()
  private settings: QualitySettings

  onStateChange: ((viewerId: string, state: PeerState) => void) | null = null

  constructor(
    private readonly stream: MediaStream,
    settings: QualitySettings,
    private readonly send: (viewerId: string, msg: HostToViewer) => void
  ) {
    this.settings = settings
  }

  get peerCount(): number {
    return this.peers.size
  }

  /** Ids com conexao WebRTC viva. E a lista contra a qual o roster e comparado. */
  peerIds(): string[] {
    return [...this.peers.keys()]
  }

  private setState(viewerId: string, state: PeerState): void {
    const entry = this.peers.get(viewerId)
    if (!entry || entry.state === state) return
    entry.state = state
    this.onStateChange?.(viewerId, state)
  }

  async addViewer(viewerId: string): Promise<void> {
    this.removeViewer(viewerId)

    // Sem iceServers: os dois lados estao na mesma LAN, candidatos host bastam.
    const pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' })

    const entry: PeerEntry = {
      pc,
      videoTransceiver: null,
      sampler: new StatsSampler('send'),
      pendingIce: [],
      state: 'conectando'
    }
    this.peers.set(viewerId, entry)

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      this.send(viewerId, { t: 'ice', candidate: toCandidatePayload(event.candidate) })
    }

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          this.setState(viewerId, 'conectado')
          break
        case 'disconnected':
          this.setState(viewerId, 'instavel')
          break
        case 'failed':
        case 'closed':
          this.setState(viewerId, 'encerrado')
          break
        default:
          this.setState(viewerId, 'conectando')
      }
    }

    const videoTrack = this.stream.getVideoTracks()[0]
    const audioTrack = this.stream.getAudioTracks()[0]

    if (videoTrack) {
      // sendEncodings no addTransceiver e a via confiavel de fixar bitrate e fps:
      // mexer em getParameters antes do setLocalDescription costuma virar no-op.
      entry.videoTransceiver = pc.addTransceiver(videoTrack, {
        direction: 'sendonly',
        streams: [this.stream],
        sendEncodings: [
          {
            maxBitrate: this.settings.maxBitrateKbps * 1000,
            maxFramerate: this.settings.fps
          }
        ]
      })
      applyCodecPreference(entry.videoTransceiver, this.settings.codec)
    }

    if (audioTrack) {
      pc.addTransceiver(audioTrack, { direction: 'sendonly', streams: [this.stream] })
    }

    await this.negotiate(viewerId)
  }

  private async negotiate(viewerId: string): Promise<void> {
    const entry = this.peers.get(viewerId)
    if (!entry) return

    const offer = await entry.pc.createOffer()
    const sdp = preferOpusStereo(offer.sdp ?? '')
    await entry.pc.setLocalDescription({ type: 'offer', sdp })

    // degradationPreference nao cabe em sendEncodings; e o unico ajuste que
    // precisa esperar o setLocalDescription.
    this.applyDegradation(entry)

    this.send(viewerId, { t: 'offer', desc: { type: 'offer', sdp } })
  }

  private applyDegradation(entry: PeerEntry): void {
    const sender = entry.videoTransceiver?.sender
    if (!sender) return
    const params = sender.getParameters()
    params.degradationPreference = this.settings.degradation
    void sender.setParameters(params).catch((err) => {
      console.warn('[rtc] setParameters (degradacao) falhou:', err)
    })
  }

  async handleMessage(viewerId: string, msg: ViewerToHost): Promise<void> {
    const entry = this.peers.get(viewerId)
    if (!entry) return

    if (msg.t === 'answer') {
      await entry.pc.setRemoteDescription({ type: 'answer', sdp: msg.desc.sdp })
      for (const candidate of entry.pendingIce.splice(0)) {
        await entry.pc.addIceCandidate(candidate).catch(() => {})
      }
      return
    }

    if (msg.t === 'ice') {
      if (!entry.pc.remoteDescription) {
        entry.pendingIce.push(msg.candidate)
        return
      }
      await entry.pc.addIceCandidate(msg.candidate).catch((err) => {
        console.warn('[rtc] addIceCandidate falhou:', err)
      })
    }
  }

  removeViewer(viewerId: string): void {
    const entry = this.peers.get(viewerId)
    if (!entry) return
    this.peers.delete(viewerId)
    entry.pc.onicecandidate = null
    entry.pc.onconnectionstatechange = null
    try {
      entry.pc.close()
    } catch {
      /* ja fechada */
    }
  }

  /**
   * Troca de qualidade ao vivo.
   *
   * Bitrate, fps e resolucao entram sem renegociar. Trocar o codec, nao: ele e
   * decidido no SDP, entao exige uma nova oferta para cada espectador.
   */
  async updateSettings(next: QualitySettings): Promise<void> {
    const codecChanged = next.codec !== this.settings.codec
    this.settings = next

    const videoTrack = this.stream.getVideoTracks()[0]
    if (videoTrack) {
      await videoTrack
        .applyConstraints({
          frameRate: { ideal: next.fps, max: next.fps },
          ...(next.maxHeight ? { height: { max: next.maxHeight } } : {})
        })
        .catch((err) => console.warn('[rtc] applyConstraints falhou:', err))
    }

    for (const [viewerId, entry] of this.peers) {
      const sender = entry.videoTransceiver?.sender
      if (sender) {
        const params = sender.getParameters()
        if (!params.encodings?.length) params.encodings = [{}]
        params.encodings[0].maxBitrate = next.maxBitrateKbps * 1000
        params.encodings[0].maxFramerate = next.fps
        params.degradationPreference = next.degradation
        await sender.setParameters(params).catch((err) => {
          console.warn('[rtc] setParameters falhou:', err)
        })
      }

      if (codecChanged && entry.videoTransceiver) {
        applyCodecPreference(entry.videoTransceiver, next.codec)
        await this.negotiate(viewerId).catch((err) => {
          console.warn('[rtc] renegociacao apos troca de codec falhou:', err)
        })
      }
    }
  }

  /** Uma leitura por espectador; a UI agrega. */
  async readStats(): Promise<Map<string, StreamStats>> {
    const out = new Map<string, StreamStats>()
    await Promise.all(
      [...this.peers.entries()].map(async ([viewerId, entry]) => {
        try {
          out.set(viewerId, await entry.sampler.read(entry.pc))
        } catch {
          out.set(viewerId, emptyStats())
        }
      })
    )
    return out
  }

  getState(viewerId: string): PeerState | null {
    return this.peers.get(viewerId)?.state ?? null
  }

  close(): void {
    for (const viewerId of [...this.peers.keys()]) this.removeViewer(viewerId)
  }
}
