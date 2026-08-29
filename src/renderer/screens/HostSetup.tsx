import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, DesktopSource, FirewallStatus } from '@shared/ipc'
import { MAX_VIEWERS, type SourceKind } from '@shared/protocol'
import type { QualitySettings } from '@shared/quality'
import { Badge, Button, IconButton, Segmented, Toggle } from '@/components/ui'
import { QualityPanel } from '@/components/QualityPanel'
import { SourceGrid } from '@/components/SourceGrid'
import { AudioMeter } from '@/components/AudioMeter'
import { FirewallModal } from '@/components/FirewallModal'
import { NetworkPicker } from '@/components/NetworkPicker'
import {
  IconAlert,
  IconArrowLeft,
  IconBroadcast,
  IconLock,
  IconRefresh
} from '@/components/Icons'
import './HostSetup.css'

/** Constraints de captura a partir da qualidade escolhida. */
function videoConstraints(q: QualitySettings): MediaTrackConstraints {
  return {
    frameRate: { ideal: q.fps, max: q.fps },
    ...(q.maxHeight ? { height: { max: q.maxHeight } } : {})
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop())
}

export function HostSetup({
  settings,
  onSettingsChange,
  onBack,
  onStart
}: {
  settings: AppSettings
  onSettingsChange: (patch: Partial<AppSettings>) => void
  onBack: () => void
  onStart: (stream: MediaStream, source: DesktopSource) => Promise<string | null>
}): React.JSX.Element {
  const [sources, setSources] = useState<DesktopSource[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<SourceKind>('screen')
  const [selected, setSelected] = useState<DesktopSource | null>(null)
  const [preview, setPreview] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const [firewall, setFirewall] = useState<FirewallStatus | null>(null)
  const [showFirewall, setShowFirewall] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  // A previa e descartada no unmount, exceto quando vira a transmissao.
  const handedOffRef = useRef(false)

  const quality = settings.quality

  const loadSources = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setSources(await window.api.sources.list())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSources()
    void window.api.firewall.status().then(setFirewall)
  }, [loadSources])

  // Solta a previa ao sair da tela — a nao ser que ela tenha virado transmissao.
  useEffect(() => {
    return () => {
      if (!handedOffRef.current) stopStream(preview)
    }
  }, [preview])

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = preview
  }, [preview])

  /**
   * Trocar de fonte ou ligar/desligar o audio exige uma captura nova. Mudar
   * resolucao ou fps, nao: `applyConstraints` resolve na track existente, sem
   * o piscar de reabrir a captura.
   */
  useEffect(() => {
    if (!selected) return
    let cancelled = false

    const acquire = async (): Promise<void> => {
      setError(null)
      try {
        await window.api.sources.select(selected.id, quality.audio)
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: videoConstraints(quality),
          audio: quality.audio
        })
        if (cancelled) {
          stopStream(stream)
          return
        }
        setPreview((old) => {
          if (old !== stream) stopStream(old)
          return stream
        })

        // Fechar a janela compartilhada encerra a track: limpar a selecao evita
        // o usuario clicar em "Iniciar" com uma fonte que ja nao existe.
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (cancelled) return
          setSelected(null)
          setPreview(null)
          setError('A janela escolhida foi fechada. Escolha outra fonte.')
          void loadSources()
        })
      } catch (err) {
        if (cancelled) return
        setError(
          `Não foi possível capturar essa fonte: ${(err as Error).message}. Tente outra janela.`
        )
        setSelected(null)
      }
    }

    void acquire()
    return () => {
      cancelled = true
    }
    // Resolucao e fps sao aplicados no efeito abaixo, sem recapturar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, quality.audio, loadSources])

  useEffect(() => {
    const track = preview?.getVideoTracks()[0]
    if (!track) return
    void track.applyConstraints(videoConstraints(quality)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, quality.fps, quality.maxHeight])

  const begin = async (): Promise<void> => {
    if (!preview || !selected) return
    setStarting(true)
    setError(null)
    handedOffRef.current = true
    const failure = await onStart(preview, selected)
    if (failure) {
      handedOffRef.current = false
      setError(failure)
      setStarting(false)
    }
  }

  const handleStartClick = (): void => {
    // O aviso do firewall aparece uma vez por instalacao; depois disso o
    // usuario decide sozinho quando quer rever.
    if (firewall && !firewall.ruleExists && !settings.firewallPromptDismissed) {
      setShowFirewall(true)
      return
    }
    void begin()
  }

  const visible = sources.filter((s) => s.kind === tab)

  return (
    <div className="screen fade-in">
      <header className="page-head">
        <IconButton label="Voltar" onClick={onBack}>
          <IconArrowLeft size={19} />
        </IconButton>
        <div>
          <div className="page-title">Compartilhar</div>
          <div className="page-sub">Escolha o que as outras pessoas vão ver.</div>
        </div>
        <div className="spacer" />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'screen' as SourceKind, label: 'Telas' },
            { value: 'window' as SourceKind, label: 'Janelas' }
          ]}
        />
        <IconButton label="Atualizar lista" onClick={() => void loadSources()}>
          <IconRefresh size={18} />
        </IconButton>
      </header>

      <div className="setup-body">
        <section className="setup-sources screen-scroll">
          {loading ? (
            <div className="empty-state">
              <span className="spinner" />
              <span>Procurando telas e janelas...</span>
            </div>
          ) : (
            <SourceGrid sources={visible} selectedId={selected?.id ?? null} onSelect={setSelected} />
          )}
        </section>

        <aside className="setup-panel">
          <div className="setup-panel-scroll screen-scroll">
            <div className="preview-frame">
              {preview ? (
                // Sempre mudo: tocar o loopback do sistema realimentaria a captura.
                <video ref={videoRef} autoPlay muted playsInline />
              ) : (
                <div className="preview-placeholder">
                  <IconBroadcast size={24} />
                  <span>Escolha uma fonte ao lado</span>
                </div>
              )}
            </div>

            {preview && quality.audio && <AudioMeter stream={preview} />}

            {selected && (
              <div className="setup-selected">
                <Badge tone="accent">{selected.kind === 'screen' ? 'Tela' : 'Janela'}</Badge>
                <span className="setup-selected-name">{selected.name}</span>
              </div>
            )}

            <div className="setup-divider" />

            <QualityPanel
              settings={quality}
              onChange={(next) => onSettingsChange({ quality: next })}
            />

            <div className="setup-divider" />

            <Toggle
              checked={settings.requirePin}
              onChange={(v) => onSettingsChange({ requirePin: v })}
              label="Pedir um código para entrar"
              hint="Recomendado em rede compartilhada, como faculdade ou trabalho."
            />

            {firewall && !firewall.ruleExists && firewall.checked && (
              <button className="setup-fw-hint" onClick={() => setShowFirewall(true)}>
                <IconAlert size={16} />
                <span>O app ainda não está liberado no firewall. Resolver agora.</span>
              </button>
            )}

            {error && (
              <div className="setup-error">
                <IconAlert size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="setup-actions">
            <NetworkPicker
              value={settings.preferredInterface}
              onChange={(preferredInterface) => onSettingsChange({ preferredInterface })}
            />
            <Button
              variant="primary"
              size="lg"
              block
              disabled={!preview || !selected}
              loading={starting}
              onClick={handleStartClick}
              icon={<IconBroadcast size={18} />}
            >
              Iniciar transmissão
            </Button>
            <p className="setup-actions-note">
              {settings.requirePin ? (
                <>
                  <IconLock size={13} /> Um código de 6 dígitos será gerado
                </>
              ) : (
                <>Qualquer pessoa na rede poderá entrar</>
              )}
              {' · '}
              até {MAX_VIEWERS} pessoas
            </p>
          </div>
        </aside>
      </div>

      <FirewallModal
        open={showFirewall}
        status={firewall}
        onDone={() => {
          setShowFirewall(false)
          void window.api.firewall.status().then(setFirewall)
          void begin()
        }}
        onSkip={() => {
          setShowFirewall(false)
          onSettingsChange({ firewallPromptDismissed: true })
          void begin()
        }}
      />
    </div>
  )
}
