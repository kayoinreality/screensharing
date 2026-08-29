import type { HostToViewer, ViewerToHost } from '@shared/protocol'
import { StatsSampler, emptyStats, type StreamStats } from './stats'
import { toCandidatePayload } from './ice'

export type ViewerState = 'conectando' | 'recebendo' | 'instavel' | 'encerrado'

/**
 * Lado receptor. Sempre responde — o host e quem faz a oferta —, entao nao ha
 * disputa de negociacao (glare) para resolver.
 */
export class ViewerSession {
  private pc: RTCPeerConnection | null = null
  private readonly sampler = new StatsSampler('receive')
  private pendingIce: RTCIceCandidateInit[] = []
  private state: ViewerState = 'conectando'

  onStream: ((stream: MediaStream) => void) | null = null
  onStateChange: ((state: ViewerState) => void) | null = null

  constructor(private readonly send: (msg: ViewerToHost) => void) {}

  private setState(next: ViewerState): void {
    if (this.state === next) return
    this.state = next
    this.onStateChange?.(next)
  }

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc

    const pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' })
    this.pc = pc

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      this.send({ t: 'ice', candidate: toCandidatePayload(event.candidate) })
    }

    // O host manda video e audio no mesmo MediaStream; `event.streams[0]` ja
    // vem com os dois, o que preserva a sincronia A/V feita pelo Chromium.
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) this.onStream?.(stream)
    }

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          this.setState('recebendo')
          break
        case 'disconnected':
          this.setState('instavel')
          break
        case 'failed':
        case 'closed':
          this.setState('encerrado')
          break
        default:
          this.setState('conectando')
      }
    }

    return pc
  }

  async handleMessage(msg: HostToViewer): Promise<void> {
    if (msg.t === 'offer') {
      const pc = this.ensurePeer()
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.desc.sdp })

      for (const candidate of this.pendingIce.splice(0)) {
        await pc.addIceCandidate(candidate).catch(() => {})
      }

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.send({ t: 'answer', desc: { type: 'answer', sdp: answer.sdp ?? '' } })
      return
    }

    if (msg.t === 'ice') {
      const pc = this.pc
      if (!pc?.remoteDescription) {
        this.pendingIce.push(msg.candidate)
        return
      }
      await pc.addIceCandidate(msg.candidate).catch((err) => {
        console.warn('[rtc] addIceCandidate falhou:', err)
      })
    }
  }

  async readStats(): Promise<StreamStats> {
    if (!this.pc) return emptyStats()
    try {
      return await this.sampler.read(this.pc)
    } catch {
      return emptyStats()
    }
  }

  close(): void {
    const pc = this.pc
    this.pc = null
    this.pendingIce = []
    if (!pc) return
    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    try {
      pc.close()
    } catch {
      /* ja fechada */
    }
    this.setState('encerrado')
  }
}
