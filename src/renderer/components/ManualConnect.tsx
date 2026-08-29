import { useEffect, useState } from 'react'
import { SIGNALING_PORT } from '@shared/protocol'
import { Modal } from './Modal'
import { Button, Field, TextInput } from './ui'
import { IconAlert } from './Icons'
import type { ConnectTarget } from '@/hooks/useViewerStream'
import './ManualConnect.css'

/**
 * Conexão digitando o endereço.
 *
 * A descoberta automática depende de broadcast UDP chegar até a outra máquina,
 * e há redes onde isso não acontece: VPNs que não repassam broadcast, Wi-Fi com
 * isolamento de clientes, sub-redes diferentes ligadas por roteador. Sem esta
 * saída, nesses casos não haveria como conectar de jeito nenhum — o endereço
 * aparece na tela de quem transmite justamente para ser passado adiante.
 */
function parseAddress(raw: string): ConnectTarget | null {
  const text = raw.trim()
  if (!text) return null

  const parts = text.split(':')
  if (parts.length > 2) return null

  const ip = parts[0].trim()
  const octets = ip.split('.')
  if (octets.length !== 4) return null
  if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return null

  const port = parts[1] ? Number(parts[1].trim()) : SIGNALING_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null

  return { ip, port, name: ip }
}

export function ManualConnect({
  open,
  busy,
  error,
  onClose,
  onConnect
}: {
  open: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onConnect: (target: ConnectTarget, pin: string | null) => void
}): React.JSX.Element {
  const [address, setAddress] = useState('')
  const [pin, setPin] = useState('')

  useEffect(() => {
    if (open) {
      setAddress('')
      setPin('')
    }
  }, [open])

  const target = parseAddress(address)
  const invalid = address.trim().length > 0 && target === null

  const submit = (): void => {
    if (!target) return
    onConnect(target, pin.length === 6 ? pin : null)
  }

  return (
    <Modal
      open={open}
      width={430}
      title="Conectar digitando o endereço"
      description="Use quando o computador não aparecer sozinho na lista. O endereço fica na tela de quem está transmitindo."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="live" loading={busy} disabled={!target} onClick={submit}>
            Conectar
          </Button>
        </>
      }
    >
      <div className="manual-body">
        <Field label="Endereço" hint={target ? `porta ${target.port}` : undefined}>
          <TextInput
            autoFocus
            className="mono"
            placeholder={`192.168.1.10:${SIGNALING_PORT}`}
            value={address}
            disabled={busy}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>

        <Field label="Código de acesso" hint="deixe vazio se não pedir">
          <TextInput
            className="mono"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={pin}
            disabled={busy}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>

        {invalid && (
          <div className="manual-error">
            <IconAlert size={15} />
            <span>
              Escreva no formato <span className="mono">192.168.1.10</span> ou{' '}
              <span className="mono">192.168.1.10:{SIGNALING_PORT}</span>.
            </span>
          </div>
        )}

        {error && !invalid && (
          <div className="manual-error">
            <IconAlert size={15} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}
