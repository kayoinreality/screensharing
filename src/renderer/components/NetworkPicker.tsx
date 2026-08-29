import { useEffect, useState } from 'react'
import type { NetInterface } from '@shared/ipc'
import { IconChevron, IconWifi } from './Icons'
import './NetworkPicker.css'

/**
 * Escolha da placa de rede usada para anunciar e procurar na LAN.
 *
 * O automático segue a rota padrão do Windows, o que acerta na maioria dos PCs
 * — mas quem tem Radmin VPN, Hyper-V, WSL ou VirtualBox costuma ter várias
 * placas ativas, e a rota padrão pode apontar para a virtual em vez da Wi-Fi.
 * Nesse caso os dois computadores não se enxergam e nada na tela explicaria o
 * porquê. Daí este controle existir.
 */
export function NetworkPicker({
  value,
  onChange
}: {
  value: string | null
  onChange: (address: string | null) => void
}): React.JSX.Element {
  const [interfaces, setInterfaces] = useState<NetInterface[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void window.api.net.interfaces().then(setInterfaces)
  }, [])

  // Fecha ao clicar fora, como qualquer menu suspenso.
  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const auto = interfaces.find((i) => i.isPreferred)
  const chosen = value ? interfaces.find((i) => i.address === value) : null
  const summary = chosen
    ? `${chosen.name} · ${chosen.address}`
    : `Automática${auto ? ` · ${auto.address}` : ''}`

  const pick = (address: string | null): void => {
    onChange(address)
    setOpen(false)
  }

  return (
    <div className="netpick" onMouseDown={(e) => e.stopPropagation()}>
      <button className="netpick-trigger" onClick={() => setOpen((o) => !o)}>
        <IconWifi size={15} />
        <span className="netpick-summary">Rede: {summary}</span>
        <IconChevron size={14} />
      </button>

      {open && (
        <div className="netpick-menu fade-in">
          <button
            className={`netpick-item ${value === null ? 'is-active' : ''}`}
            onClick={() => pick(null)}
          >
            <span className="netpick-item-name">Automática</span>
            <span className="netpick-item-addr mono">
              {auto ? auto.address : 'detectando...'}
            </span>
          </button>

          {interfaces.length > 0 && <div className="netpick-sep" />}

          {interfaces.map((iface) => (
            <button
              key={iface.address}
              className={`netpick-item ${value === iface.address ? 'is-active' : ''}`}
              onClick={() => pick(iface.address)}
            >
              <span className="netpick-item-name">{iface.name}</span>
              <span className="netpick-item-addr mono">{iface.address}</span>
            </button>
          ))}

          <p className="netpick-note">
            Se os dois computadores não se acharem, escolha aqui a placa da rede
            que vocês realmente compartilham.
          </p>
        </div>
      )}
    </div>
  )
}
