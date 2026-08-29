import { useEffect, useState } from 'react'
import type { DiscoveredHost } from '@shared/protocol'
import type { AppSettings } from '@shared/ipc'
import { useDiscovery } from '@/hooks/useDiscovery'
import type { ConnectTarget } from '@/hooks/useViewerStream'
import { Badge, Button, IconButton, TextInput } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { NetworkPicker } from '@/components/NetworkPicker'
import { ManualConnect } from '@/components/ManualConnect'
import {
  IconAlert,
  IconArrowLeft,
  IconLock,
  IconMonitor,
  IconSearch,
  IconRefresh,
  IconUsers,
  IconWifi,
  IconWindow
} from '@/components/Icons'
import './ViewerBrowse.css'

function elapsed(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  if (seconds < 60) return 'começou agora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  return `há ${Math.floor(minutes / 60)} h`
}

export function ViewerBrowse({
  settings,
  onSettingsChange,
  onBack,
  onConnect
}: {
  settings: AppSettings
  onSettingsChange: (patch: Partial<AppSettings>) => void
  onBack: () => void
  onConnect: (target: ConnectTarget, pin: string | null) => Promise<string | null>
}): React.JSX.Element {
  const { hosts, searching, refresh } = useDiscovery(true)
  const [target, setTarget] = useState<DiscoveredHost | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  // Se o host escolhido sair do ar enquanto o dialogo esta aberto, nao adianta insistir.
  useEffect(() => {
    if (target && !hosts.some((h) => h.id === target.id)) {
      setTarget(null)
      setPin('')
    }
  }, [hosts, target])

  const attempt = async (target: ConnectTarget, code: string | null): Promise<void> => {
    setBusy(true)
    setError(null)
    const failure = await onConnect(target, code)
    setBusy(false)
    if (failure) {
      setError(failure)
      setPin('')
    }
  }

  const attemptManual = async (target: ConnectTarget, code: string | null): Promise<void> => {
    setBusy(true)
    setManualError(null)
    const failure = await onConnect(target, code)
    setBusy(false)
    if (failure) setManualError(failure)
    else setManualOpen(false)
  }

  const pick = (host: DiscoveredHost): void => {
    setError(null)
    if (host.requiresPin) {
      setPin('')
      setTarget(host)
      return
    }
    void attempt(host, null)
  }

  const submitPin = (value: string): void => {
    if (!target || value.length !== 6) return
    void attempt(target, value)
  }

  return (
    <div className="screen fade-in">
      <header className="page-head">
        <IconButton label="Voltar" onClick={onBack}>
          <IconArrowLeft size={19} />
        </IconButton>
        <div>
          <div className="page-title">Assistir</div>
          <div className="page-sub">Transmissões abertas na sua rede.</div>
        </div>
        <div className="spacer" />
        {searching && <span className="spinner" />}
        <Button variant="subtle" size="sm" icon={<IconSearch size={16} />} onClick={() => setManualOpen(true)}>
          Conectar por IP
        </Button>
        <IconButton label="Procurar de novo" onClick={refresh}>
          <IconRefresh size={18} />
        </IconButton>
      </header>

      <div className="browse-body screen-scroll">
        {hosts.length === 0 ? (
          <div className="empty-state browse-empty">
            <IconWifi size={32} />
            <span className="empty-title">
              {searching ? 'Procurando na rede...' : 'Ninguém transmitindo agora'}
            </span>
            <span>
              Peça para a outra pessoa abrir o app e clicar em &ldquo;Compartilhar&rdquo;.
              <br />
              Os dois precisam estar na mesma rede Wi-Fi ou no mesmo cabo.
            </span>
            <Button variant="subtle" icon={<IconSearch size={16} />} onClick={() => setManualOpen(true)}>
              Conectar digitando o endereço
            </Button>
          </div>
        ) : (
          <ul className="host-list">
            {hosts.map((host) => {
              const full = host.viewers >= host.maxViewers
              return (
                <li key={host.id}>
                  <button
                    className="host-row"
                    onClick={() => pick(host)}
                    disabled={busy || full}
                  >
                    <span className="host-icon">
                      {host.sourceKind === 'screen' ? (
                        <IconMonitor size={20} />
                      ) : (
                        <IconWindow size={20} />
                      )}
                    </span>

                    <span className="host-info">
                      <span className="host-name">{host.name}</span>
                      <span className="host-source">
                        {host.sourceName} · {elapsed(host.startedAt)}
                      </span>
                    </span>

                    <span className="host-badges">
                      {host.requiresPin && (
                        <Badge tone="neutral" icon={<IconLock />}>
                          Código
                        </Badge>
                      )}
                      <Badge tone={full ? 'danger' : 'live'} icon={<IconUsers />}>
                        {full ? 'Lotado' : `${host.viewers}/${host.maxViewers}`}
                      </Badge>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {error && !target && (
          <div className="browse-error">
            <IconAlert size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <footer className="browse-foot">
        {editingName ? (
          <div className="name-edit">
            <TextInput
              autoFocus
              value={settings.viewerName}
              maxLength={40}
              onChange={(e) => onSettingsChange({ viewerName: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
              onBlur={() => setEditingName(false)}
            />
          </div>
        ) : (
          <button className="name-display" onClick={() => setEditingName(true)}>
            Você aparece como <strong>{settings.viewerName}</strong> · alterar
          </button>
        )}
        <div className="spacer" />
        <div className="browse-net">
          <NetworkPicker
            value={settings.preferredInterface}
            onChange={(preferredInterface) => onSettingsChange({ preferredInterface })}
          />
        </div>
      </footer>

      <ManualConnect
        open={manualOpen}
        busy={busy}
        error={manualError}
        onClose={() => {
          setManualOpen(false)
          setManualError(null)
        }}
        onConnect={(t, code) => void attemptManual(t, code)}
      />

      <Modal
        open={target !== null}
        width={400}
        icon={<IconLock size={19} />}
        title="Código de acesso"
        description={
          target ? (
            <>
              Peça o código de 6 dígitos que aparece na tela de <strong>{target.name}</strong>.
            </>
          ) : null
        }
        onClose={() => {
          setTarget(null)
          setError(null)
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="live"
              loading={busy}
              disabled={pin.length !== 6}
              onClick={() => submitPin(pin)}
            >
              Entrar
            </Button>
          </>
        }
      >
        <div className="pin-wrap">
          <input
            className="pin-input mono"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={pin}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, '').slice(0, 6)
              setPin(next)
              setError(null)
              // Seis digitos e o codigo inteiro: nao ha o que esperar.
              if (next.length === 6) submitPin(next)
            }}
          />
          {error && (
            <div className="pin-error">
              <IconAlert size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
