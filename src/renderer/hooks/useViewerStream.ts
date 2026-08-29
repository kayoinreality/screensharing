import { useCallback, useEffect, useRef, useState } from 'react'
import type { SourceKind } from '@shared/protocol'
import type { ViewerClosedInfo, ViewerConnectResult } from '@shared/ipc'
import { ViewerSession, type ViewerState } from '@/rtc/ViewerSession'
import { emptyStats, type StreamStats } from '@/rtc/stats'

/**
 * Para onde conectar.
 *
 * Deliberadamente menor que `DiscoveredHost`: alem do host achado na rede, o
 * usuario pode digitar um endereco a mao — necessario quando a descoberta por
 * broadcast nao chega, como costuma acontecer atraves de VPN.
 */
export interface ConnectTarget {
  ip: string
  port: number
  /** Nome so para exibir enquanto conecta; o definitivo vem no `welcome`. */
  name: string
}

export interface ViewerConnection {
  hostName: string
  sourceName: string
  sourceKind: SourceKind
}

export interface ViewerStream {
  stream: MediaStream | null
  state: ViewerState
  stats: StreamStats
  connection: ViewerConnection | null
  closed: ViewerClosedInfo | null
  connect(target: ConnectTarget, pin: string | null, name: string): Promise<ViewerConnectResult>
  disconnect(): void
  dismissClosed(): void
}

/**
 * Recepcao da transmissao.
 *
 * Assim como o lado do host, vive no App: o `offer` sai do outro lado no
 * instante seguinte ao `welcome`, entao a assinatura de `viewer.onMessage`
 * precisa ja estar de pe quando `connect` retorna — montar isso na tela do
 * player perderia a oferta.
 */
export function useViewerStream(): ViewerStream {
  const sessionRef = useRef<ViewerSession | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [state, setState] = useState<ViewerState>('encerrado')
  const [stats, setStats] = useState<StreamStats>(emptyStats())
  const [connection, setConnection] = useState<ViewerConnection | null>(null)
  const [closed, setClosed] = useState<ViewerClosedInfo | null>(null)

  useEffect(() => {
    const offMessage = window.api.viewer.onMessage((msg) => {
      void sessionRef.current?.handleMessage(msg)
    })
    const offClosed = window.api.viewer.onClosed((info) => {
      sessionRef.current?.close()
      sessionRef.current = null
      setStream(null)
      setState('encerrado')
      setConnection(null)
      setClosed(info)
    })
    return () => {
      offMessage()
      offClosed()
    }
  }, [])

  useEffect(() => {
    if (!connection) return
    const timer = setInterval(() => {
      void sessionRef.current?.readStats().then(setStats)
    }, 1000)
    return () => clearInterval(timer)
  }, [connection])

  const connect = useCallback(
    async (
      target: ConnectTarget,
      pin: string | null,
      name: string
    ): Promise<ViewerConnectResult> => {
      sessionRef.current?.close()
      setClosed(null)
      setStats(emptyStats())

      const session = new ViewerSession((msg) => window.api.viewer.send(msg))
      session.onStream = setStream
      session.onStateChange = setState
      sessionRef.current = session
      setState('conectando')

      const result = await window.api.viewer.connect({
        ip: target.ip,
        port: target.port,
        pin,
        name
      })

      if (result.ok) {
        setConnection({
          hostName: result.hostName,
          sourceName: result.sourceName,
          sourceKind: result.sourceKind
        })
      } else {
        session.close()
        sessionRef.current = null
        setState('encerrado')
      }
      return result
    },
    []
  )

  const disconnect = useCallback((): void => {
    window.api.viewer.disconnect()
    sessionRef.current?.close()
    sessionRef.current = null
    setStream(null)
    setConnection(null)
    setState('encerrado')
    setStats(emptyStats())
    // Saida a pedido do proprio usuario: nao ha aviso de desconexao a mostrar.
    setClosed(null)
  }, [])

  const dismissClosed = useCallback((): void => setClosed(null), [])

  return { stream, state, stats, connection, closed, connect, disconnect, dismissClosed }
}
