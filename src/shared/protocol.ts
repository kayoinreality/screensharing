/**
 * Contrato de rede entre instancias do app.
 *
 * Este arquivo e compartilhado por main (Node) e renderer (Chromium), entao nao
 * pode referenciar tipos do DOM. As cargas de WebRTC sao descritas de forma
 * estrutural (`SessionDescriptionPayload`, `IceCandidatePayload`) para serem
 * compativeis com RTCSessionDescriptionInit / RTCIceCandidateInit sem importa-los.
 */

export const PROTOCOL_VERSION = 1

/** Porta UDP de descoberta. Fixa: e o unico ponto de encontro entre as maquinas. */
export const DISCOVERY_PORT = 41234
/** Porta TCP inicial de sinalizacao. Incrementa se estiver ocupada. */
export const SIGNALING_PORT = 41235

export const ANNOUNCE_INTERVAL_MS = 2000
/** Host nao visto por este tempo some da lista do espectador. */
export const HOST_TTL_MS = 6000

export const MAX_VIEWERS = 4

/** Tentativas de PIN antes do bloqueio temporario, por endereco IP. */
export const PIN_MAX_ATTEMPTS = 5
export const PIN_BLOCK_MS = 60_000

// ---------------------------------------------------------------- descoberta

export type SourceKind = 'screen' | 'window'

export interface HostAnnounce {
  t: 'announce'
  v: number
  /** Id da sessao de transmissao, novo a cada "Iniciar". */
  id: string
  /** Nome legivel do host, ex. "PC do Kayor". */
  name: string
  ip: string
  port: number
  requiresPin: boolean
  sourceName: string
  sourceKind: SourceKind
  viewers: number
  maxViewers: number
  startedAt: number
}

export interface DiscoveryQuery {
  t: 'query'
  v: number
}

export interface HostBye {
  t: 'bye'
  v: number
  id: string
}

export type DiscoveryMessage = HostAnnounce | DiscoveryQuery | HostBye

/** Um host visto na rede, do ponto de vista do espectador. */
export interface DiscoveredHost extends Omit<HostAnnounce, 't' | 'v'> {
  /** Timestamp local do ultimo announce recebido; usado para o TTL. */
  lastSeen: number
}

// --------------------------------------------------------------- sinalizacao

export interface SessionDescriptionPayload {
  type: 'offer' | 'answer'
  sdp: string
}

export interface IceCandidatePayload {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
  usernameFragment?: string | null
}

export type RejectReason =
  | 'pin-invalido'
  | 'sala-cheia'
  | 'versao-incompativel'
  | 'bloqueado'
  | 'sem-transmissao'

export const REJECT_MESSAGES: Record<RejectReason, string> = {
  'pin-invalido': 'Código incorreto.',
  'sala-cheia': 'A transmissão já está com o número máximo de espectadores.',
  'versao-incompativel': 'As duas máquinas estão com versões diferentes do app.',
  bloqueado: 'Muitas tentativas erradas. Espere um minuto e tente de novo.',
  'sem-transmissao': 'Este computador não está transmitindo no momento.'
}

export type ViewerToHost =
  | { t: 'hello'; v: number; name: string; pin: string | null }
  | { t: 'answer'; desc: SessionDescriptionPayload }
  | { t: 'ice'; candidate: IceCandidatePayload }
  | { t: 'ping'; sentAt: number }
  | { t: 'bye' }

export type HostToViewer =
  | { t: 'welcome'; viewerId: string; hostName: string; sourceName: string; sourceKind: SourceKind }
  | { t: 'rejected'; reason: RejectReason; retryAfterMs?: number }
  | { t: 'offer'; desc: SessionDescriptionPayload }
  | { t: 'ice'; candidate: IceCandidatePayload }
  | { t: 'pong'; sentAt: number }
  | { t: 'kicked' }
  | { t: 'ended' }

/** Um espectador conectado, do ponto de vista do host. */
export interface ConnectedViewer {
  id: string
  name: string
  address: string
  joinedAt: number
  /** RTT da sinalizacao em ms; null enquanto o primeiro ping nao voltou. */
  pingMs: number | null
}
