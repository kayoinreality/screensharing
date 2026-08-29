import { useEffect, useState } from 'react'
import type { DiscoveredHost } from '@shared/protocol'

export interface DiscoveryResult {
  hosts: DiscoveredHost[]
  /** true ate a primeira varredura completar, so para nao piscar o estado vazio. */
  searching: boolean
  refresh(): void
}

/**
 * Procura hosts na LAN enquanto `active` for true.
 *
 * O main manda a lista inteira a cada mudanca (entrada, saida ou expiracao por
 * TTL), entao aqui basta refletir.
 */
export function useDiscovery(active: boolean): DiscoveryResult {
  const [hosts, setHosts] = useState<DiscoveredHost[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!active) return

    setSearching(true)
    setHosts([])

    const off = window.api.discovery.onHosts(setHosts)
    void window.api.discovery.start()

    // Uma rede saudavel responde em bem menos que isso; o prazo existe so para
    // trocar "procurando" por "nao achei ninguem" em algum momento.
    const settle = setTimeout(() => setSearching(false), 2500)

    return () => {
      clearTimeout(settle)
      off()
      void window.api.discovery.stop()
    }
  }, [active])

  return {
    hosts,
    searching,
    refresh: () => {
      setSearching(true)
      window.api.discovery.refresh()
      setTimeout(() => setSearching(false), 1500)
    }
  }
}
