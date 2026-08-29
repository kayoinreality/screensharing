import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectedViewer } from '@shared/protocol'
import type { HostStartOptions, HostStartResult } from '@shared/ipc'
import type { QualitySettings } from '@shared/quality'
import { HostSession, type PeerState } from '@/rtc/HostSession'
import type { StreamStats } from '@/rtc/stats'

export interface HostInfo {
  sessionId: string
  ip: string
  port: number
  pin: string | null
}

export interface HostBroadcast {
  info: HostInfo | null
  viewers: ConnectedViewer[]
  states: Record<string, PeerState>
  stats: Map<string, StreamStats>
  start(
    stream: MediaStream,
    settings: QualitySettings,
    opts: HostStartOptions
  ): Promise<HostStartResult>
  stop(): Promise<void>
  updateSettings(settings: QualitySettings): void
  kick(viewerId: string): void
}

/**
 * Transmissao ativa.
 *
 * Vive no App, nao na tela: a assinatura de `host.onMessage` precisa existir
 * antes do primeiro espectador chegar, e ele pode chegar em milissegundos —
 * o announce vai para a rede assim que `host.start` retorna.
 *
 * O roster do servidor de sinalizacao e a fonte da verdade: entrou alguem na
 * lista, criamos a conexao WebRTC; saiu, derrubamos. Assim nao ha dois lugares
 * decidindo quem esta conectado.
 */
export function useHostBroadcast(): HostBroadcast {
  const sessionRef = useRef<HostSession | null>(null)
  const [info, setInfo] = useState<HostInfo | null>(null)
  const [viewers, setViewers] = useState<ConnectedViewer[]>([])
  const [states, setStates] = useState<Record<string, PeerState>>({})
  const [stats, setStats] = useState<Map<string, StreamStats>>(new Map())

  useEffect(() => {
    const offViewers = window.api.host.onViewers((list) => {
      setViewers(list)

      const session = sessionRef.current
      if (!session) return

      const present = new Set(list.map((v) => v.id))

      // Quem entrou no roster ganha uma conexao; quem saiu tem a sua derrubada.
      // A comparacao e contra os peers da sessao, nao contra o estado do React:
      // este callback e assinado uma vez e enxergaria sempre o valor inicial.
      for (const viewer of list) {
        if (session.getState(viewer.id) === null) {
          void session.addViewer(viewer.id).catch((err) => {
            console.error('[host] nao foi possivel oferecer a transmissao:', err)
          })
        }
      }
      for (const id of session.peerIds()) {
        if (!present.has(id)) session.removeViewer(id)
      }

      setStates((prev) => {
        const next: Record<string, PeerState> = {}
        for (const v of list) next[v.id] = prev[v.id] ?? 'conectando'
        return next
      })
    })

    const offMessage = window.api.host.onMessage((viewerId, msg) => {
      void sessionRef.current?.handleMessage(viewerId, msg)
    })

    return () => {
      offViewers()
      offMessage()
    }
  }, [])

  // Amostragem de estatisticas so enquanto ha transmissao.
  useEffect(() => {
    if (!info) return
    const timer = setInterval(() => {
      void sessionRef.current?.readStats().then(setStats)
    }, 1000)
    return () => clearInterval(timer)
  }, [info])

  const start = useCallback(
    async (
      stream: MediaStream,
      settings: QualitySettings,
      opts: HostStartOptions
    ): Promise<HostStartResult> => {
      const session = new HostSession(stream, settings, (viewerId, msg) =>
        window.api.host.send(viewerId, msg)
      )
      session.onStateChange = (viewerId, state) =>
        setStates((prev) => ({ ...prev, [viewerId]: state }))
      sessionRef.current = session

      const result = await window.api.host.start(opts)
      if (result.ok) {
        setInfo({ sessionId: result.sessionId, ip: result.ip, port: result.port, pin: result.pin })
      } else {
        session.close()
        sessionRef.current = null
      }
      return result
    },
    []
  )

  const stop = useCallback(async (): Promise<void> => {
    await window.api.host.stop()
    sessionRef.current?.close()
    sessionRef.current = null
    setInfo(null)
    setViewers([])
    setStates({})
    setStats(new Map())
  }, [])

  const updateSettings = useCallback((settings: QualitySettings): void => {
    void sessionRef.current?.updateSettings(settings)
  }, [])

  const kick = useCallback((viewerId: string): void => {
    void window.api.host.kick(viewerId)
  }, [])

  return { info, viewers, states, stats, start, stop, updateSettings, kick }
}
