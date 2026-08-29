/**
 * Superficie de IPC: nomes de canais e o formato de `window.api`.
 *
 * O renderer nunca toca em Node diretamente (contextIsolation + sandbox ligados).
 * Tudo passa por aqui, tipado nas duas pontas.
 */

import type { QualitySettings, PresetId } from './quality'
import type {
  DiscoveredHost,
  HostToViewer,
  ViewerToHost,
  SourceKind,
  RejectReason,
  ConnectedViewer
} from './protocol'

export interface DesktopSource {
  id: string
  name: string
  kind: SourceKind
  /** data: URL da miniatura, ja redimensionada no main. */
  thumbnail: string
  /** data: URL do icone do app (so para janelas). */
  appIcon: string | null
  displayId: string
}

export interface AppInfo {
  name: string
  version: string
  /** Nome da maquina, usado como nome padrao do host. */
  hostname: string
  isPackaged: boolean
}

export interface HostStartOptions {
  sourceId: string
  sourceName: string
  sourceKind: SourceKind
  hostName: string
  requirePin: boolean
  maxViewers: number
}

export type HostStartResult =
  | { ok: true; sessionId: string; ip: string; port: number; pin: string | null }
  | { ok: false; error: string }

export interface ViewerConnectOptions {
  ip: string
  port: number
  pin: string | null
  name: string
}

export type ViewerConnectResult =
  | { ok: true; hostName: string; sourceName: string; sourceKind: SourceKind; viewerId: string }
  | { ok: false; reason: RejectReason | 'rede'; message: string; retryAfterMs?: number }

export interface NetInterface {
  name: string
  address: string
  netmask: string
  broadcast: string
  /** Interface da rota padrao: a escolha automatica. */
  isPreferred: boolean
}

export type NetworkProfile = 'private' | 'public' | 'domain' | 'unknown'

export interface FirewallStatus {
  ruleExists: boolean
  execPath: string
  /** Comando exato, para o campo copiavel do fallback manual. */
  command: string
  /** Em perfil `public` o Windows bloqueia mesmo com a regra criada. */
  profile: NetworkProfile
  /** false quando a checagem em si falhou (netsh ausente, permissao, etc). */
  checked: boolean
}

export interface AppSettings {
  hostName: string
  viewerName: string
  quality: QualitySettings
  presetId: PresetId
  requirePin: boolean
  /** IP da interface escolhida a mao; null = deteccao automatica. */
  preferredInterface: string | null
  firewallPromptDismissed: boolean
}

export interface ViewerClosedInfo {
  reason: 'kicked' | 'ended' | 'rede' | 'local'
  message: string
}

export type Unsubscribe = () => void

export interface Api {
  app: {
    info(): Promise<AppInfo>
    minimize(): void
    toggleMaximize(): void
    close(): void
    setAlwaysOnTop(value: boolean): Promise<boolean>
    onMaximizeChange(cb: (maximized: boolean) => void): Unsubscribe
  }
  sources: {
    list(): Promise<DesktopSource[]>
    /** Arma o handler de getDisplayMedia com a fonte escolhida. Chamar ANTES do getDisplayMedia. */
    select(sourceId: string, withAudio: boolean): Promise<void>
  }
  host: {
    start(opts: HostStartOptions): Promise<HostStartResult>
    stop(): Promise<void>
    kick(viewerId: string): Promise<void>
    send(viewerId: string, msg: HostToViewer): void
    /** Mantem o announce UDP com a contagem certa de espectadores. */
    setViewerCount(n: number): void
    onViewers(cb: (viewers: ConnectedViewer[]) => void): Unsubscribe
    onMessage(cb: (viewerId: string, msg: ViewerToHost) => void): Unsubscribe
  }
  discovery: {
    start(): Promise<void>
    stop(): Promise<void>
    /** Dispara um QUERY imediato em vez de esperar o proximo announce. */
    refresh(): void
    onHosts(cb: (hosts: DiscoveredHost[]) => void): Unsubscribe
  }
  viewer: {
    connect(opts: ViewerConnectOptions): Promise<ViewerConnectResult>
    send(msg: ViewerToHost): void
    disconnect(): void
    onMessage(cb: (msg: HostToViewer) => void): Unsubscribe
    onClosed(cb: (info: ViewerClosedInfo) => void): Unsubscribe
  }
  net: {
    interfaces(): Promise<NetInterface[]>
  }
  firewall: {
    status(): Promise<FirewallStatus>
    /** Dispara o UAC e cria a regra de entrada. */
    authorize(): Promise<{ ok: boolean; error?: string }>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
}

/** Nomes de canal, para nao errar string solta nos dois lados. */
export const CH = {
  appInfo: 'app:info',
  appMinimize: 'app:minimize',
  appToggleMaximize: 'app:toggle-maximize',
  appClose: 'app:close',
  appAlwaysOnTop: 'app:always-on-top',
  appMaximizeChanged: 'app:maximize-changed',

  sourcesList: 'sources:list',
  sourcesSelect: 'sources:select',

  hostStart: 'host:start',
  hostStop: 'host:stop',
  hostKick: 'host:kick',
  hostSend: 'host:send',
  hostSetViewerCount: 'host:set-viewer-count',
  hostViewers: 'host:viewers',
  hostMessage: 'host:message',

  discoveryStart: 'discovery:start',
  discoveryStop: 'discovery:stop',
  discoveryRefresh: 'discovery:refresh',
  discoveryHosts: 'discovery:hosts',

  viewerConnect: 'viewer:connect',
  viewerSend: 'viewer:send',
  viewerDisconnect: 'viewer:disconnect',
  viewerMessage: 'viewer:message',
  viewerClosed: 'viewer:closed',

  netInterfaces: 'net:interfaces',

  firewallStatus: 'firewall:status',
  firewallAuthorize: 'firewall:authorize',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set'
} as const
