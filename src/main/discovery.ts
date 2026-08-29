import { createSocket, type Socket, type RemoteInfo } from 'node:dgram'
import {
  ANNOUNCE_INTERVAL_MS,
  DISCOVERY_PORT,
  HOST_TTL_MS,
  PROTOCOL_VERSION,
  type DiscoveredHost,
  type DiscoveryMessage,
  type HostAnnounce
} from '@shared/protocol'
import { broadcastTargets } from './net'

/** Dados que o host anuncia; o proprio Discovery cuida de `t` e `v`. */
export type AnnouncePayload = Omit<HostAnnounce, 't' | 'v'>

/**
 * Descoberta na LAN por broadcast UDP.
 *
 * Um socket so, compartilhado entre os dois papeis (anunciar e procurar), com
 * `reuseAddr` para que duas instancias na mesma maquina possam bindar a mesma
 * porta — e o que permite testar o fluxo inteiro em um PC so.
 */
export class Discovery {
  private socket: Socket | null = null
  private announceTimer: NodeJS.Timeout | null = null
  private pruneTimer: NodeJS.Timeout | null = null
  private queryTimer: NodeJS.Timeout | null = null

  private announcing: AnnouncePayload | null = null
  private browsing = false
  private readonly hosts = new Map<string, DiscoveredHost>()

  /** IP da interface escolhida a mao, ou null para automatico. */
  preferredInterface: string | null = null

  onHosts: ((hosts: DiscoveredHost[]) => void) | null = null

  private async ensureSocket(): Promise<Socket> {
    if (this.socket) return this.socket

    const sock = createSocket({ type: 'udp4', reuseAddr: true })
    this.socket = sock

    sock.on('message', (buf, rinfo) => this.handleMessage(buf, rinfo))
    sock.on('error', (err) => {
      console.error('[discovery] erro no socket:', err.message)
    })

    await new Promise<void>((resolve, reject) => {
      sock.once('error', reject)
      sock.bind(DISCOVERY_PORT, () => {
        sock.removeListener('error', reject)
        try {
          sock.setBroadcast(true)
        } catch (e) {
          console.warn('[discovery] setBroadcast falhou:', (e as Error).message)
        }
        resolve()
      })
    })

    return sock
  }

  private closeSocketIfIdle(): void {
    if (this.announcing || this.browsing) return
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer)
      this.pruneTimer = null
    }
    this.socket?.close()
    this.socket = null
  }

  private async send(msg: DiscoveryMessage, to?: { address: string; port: number }): Promise<void> {
    const sock = this.socket
    if (!sock) return
    const buf = Buffer.from(JSON.stringify(msg))

    if (to) {
      sock.send(buf, to.port, to.address, (err) => {
        if (err) console.warn('[discovery] envio unicast falhou:', err.message)
      })
      return
    }

    for (const target of await broadcastTargets(this.preferredInterface)) {
      sock.send(buf, DISCOVERY_PORT, target, (err) => {
        // ENETUNREACH e comum em adaptador virtual desconectado: ignorar.
        if (err && !/ENETUNREACH|EHOSTUNREACH|EACCES/.test(err.message)) {
          console.warn(`[discovery] envio para ${target} falhou:`, err.message)
        }
      })
    }
  }

  private handleMessage(buf: Buffer, rinfo: RemoteInfo): void {
    let msg: DiscoveryMessage
    try {
      msg = JSON.parse(buf.toString('utf8'))
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object' || msg.v !== PROTOCOL_VERSION) return

    switch (msg.t) {
      case 'query':
        // Responde unicast na hora: o espectador nao espera o proximo ciclo de 2s.
        if (this.announcing) {
          void this.send(
            { t: 'announce', v: PROTOCOL_VERSION, ...this.announcing },
            { address: rinfo.address, port: rinfo.port }
          )
        }
        break

      case 'announce': {
        if (!this.browsing) return
        // Ignora o proprio anuncio quando a instancia transmite e procura ao mesmo tempo.
        if (this.announcing && msg.id === this.announcing.id) return
        const { t: _t, v: _v, ...rest } = msg
        this.hosts.set(msg.id, {
          ...rest,
          // O endereco de origem do pacote e sempre roteavel de volta; o campo
          // anunciado pode estar errado em maquina com varias placas de rede.
          ip: rinfo.address,
          lastSeen: Date.now()
        })
        this.emit()
        break
      }

      case 'bye':
        if (this.hosts.delete(msg.id)) this.emit()
        break
    }
  }

  private emit(): void {
    if (!this.onHosts) return
    const list = [...this.hosts.values()].sort((a, b) => a.name.localeCompare(b.name))
    this.onHosts(list)
  }

  private prune(): void {
    const cutoff = Date.now() - HOST_TTL_MS
    let changed = false
    for (const [id, host] of this.hosts) {
      if (host.lastSeen < cutoff) {
        this.hosts.delete(id)
        changed = true
      }
    }
    if (changed) this.emit()
  }

  // ------------------------------------------------------------------ host

  async startAnnouncing(payload: AnnouncePayload): Promise<void> {
    await this.ensureSocket()
    this.announcing = payload
    if (this.announceTimer) clearInterval(this.announceTimer)
    void this.send({ t: 'announce', v: PROTOCOL_VERSION, ...payload })
    this.announceTimer = setInterval(() => {
      if (this.announcing) void this.send({ t: 'announce', v: PROTOCOL_VERSION, ...this.announcing })
    }, ANNOUNCE_INTERVAL_MS)
  }

  /** Atualiza campos vivos (contagem de espectadores) sem reiniciar o ciclo. */
  patchAnnounce(patch: Partial<AnnouncePayload>): void {
    if (!this.announcing) return
    this.announcing = { ...this.announcing, ...patch }
  }

  async stopAnnouncing(): Promise<void> {
    if (this.announceTimer) {
      clearInterval(this.announceTimer)
      this.announceTimer = null
    }
    if (this.announcing) {
      await this.send({ t: 'bye', v: PROTOCOL_VERSION, id: this.announcing.id })
      this.announcing = null
    }
    this.closeSocketIfIdle()
  }

  // ------------------------------------------------------------- espectador

  async startBrowsing(): Promise<void> {
    await this.ensureSocket()
    this.browsing = true
    this.hosts.clear()
    this.emit()

    this.refresh()
    if (this.queryTimer) clearInterval(this.queryTimer)
    this.queryTimer = setInterval(() => this.refresh(), 3000)

    if (!this.pruneTimer) this.pruneTimer = setInterval(() => this.prune(), 2000)
  }

  stopBrowsing(): void {
    this.browsing = false
    if (this.queryTimer) {
      clearInterval(this.queryTimer)
      this.queryTimer = null
    }
    this.hosts.clear()
    this.closeSocketIfIdle()
  }

  refresh(): void {
    if (!this.browsing) return
    void this.send({ t: 'query', v: PROTOCOL_VERSION })
  }

  async dispose(): Promise<void> {
    this.browsing = false
    await this.stopAnnouncing()
    this.stopBrowsing()
  }
}
