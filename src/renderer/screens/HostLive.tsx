import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings } from '@shared/ipc'
import { MAX_VIEWERS } from '@shared/protocol'
import type { QualitySettings } from '@shared/quality'
import { Badge, Button, IconButton, StatPill } from '@/components/ui'
import { QualityPanel } from '@/components/QualityPanel'
import { AudioMeter } from '@/components/AudioMeter'
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconExit,
  IconLock,
  IconStop,
  IconUsers
} from '@/components/Icons'
import { LIMITATION_LABEL, formatBitrate } from '@/rtc/stats'
import type { HostBroadcast } from '@/hooks/useHostBroadcast'
import './HostLive.css'

const STATE_TONE = {
  conectando: 'neutral',
  conectado: 'live',
  instavel: 'warning',
  encerrado: 'danger'
} as const

// Os valores de PeerState sao chaves internas; o texto na tela vem daqui.
const STATE_LABEL = {
  conectando: 'conectando',
  conectado: 'conectado',
  instavel: 'instável',
  encerrado: 'encerrado'
} as const

export function HostLive({
  broadcast,
  stream,
  sourceName,
  settings,
  onSettingsChange,
  onStop
}: {
  broadcast: HostBroadcast
  stream: MediaStream | null
  sourceName: string
  settings: AppSettings
  onSettingsChange: (patch: Partial<AppSettings>) => void
  onStop: () => void
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const applyTimer = useRef<number>(0)
  const [copied, setCopied] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const { info, viewers, states, stats } = broadcast

  /**
   * O painel responde na hora, mas o encoder so e reconfigurado depois que o
   * usuario para de arrastar. Cada passo do slider chamaria setParameters e
   * applyConstraints em todas as conexoes — dezenas de vezes em um arrasto,
   * com engasgo visivel para quem esta assistindo.
   */
  const applyLive = (next: QualitySettings): void => {
    window.clearTimeout(applyTimer.current)
    applyTimer.current = window.setTimeout(() => broadcast.updateSettings(next), 180)
  }

  useEffect(() => () => window.clearTimeout(applyTimer.current), [])

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  /**
   * Resolucao, fps e codec sao iguais para todos (um encode so, replicado), mas
   * a taxa e por conexao — o que interessa ao host e a soma, que e o que sai
   * pela placa de rede. Perda e limitacao mostram sempre o pior caso.
   */
  const summary = useMemo(() => {
    const all = [...stats.values()]
    if (all.length === 0) {
      return { bitrate: 0, fps: 0, resolution: '—', codec: '—', loss: 0, limited: 'none' as const }
    }
    const best = all.reduce((a, b) => (b.fps > a.fps ? b : a))
    return {
      bitrate: all.reduce((sum, s) => sum + s.bitrateKbps + s.audioBitrateKbps, 0),
      fps: best.fps,
      resolution: best.width ? `${best.width}x${best.height}` : '—',
      codec: best.codec,
      loss: Math.max(...all.map((s) => s.lossPct)),
      limited: all.find((s) => s.limitedBy !== 'none')?.limitedBy ?? ('none' as const)
    }
  }, [stats])

  const copyCode = async (): Promise<void> => {
    if (!info?.pin) return
    await navigator.clipboard.writeText(info.pin)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // O endereco e a saida quando a descoberta automatica nao chega na outra
  // ponta — por VPN, Wi-Fi com isolamento de clientes ou sub-redes separadas.
  const copyAddress = async (): Promise<void> => {
    if (!info) return
    await navigator.clipboard.writeText(`${info.ip}:${info.port}`)
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 1800)
  }

  return (
    <div className="screen fade-in">
      <header className="page-head">
        <div className="live-dot" aria-hidden="true" />
        <div>
          <div className="page-title">Transmitindo</div>
          <div className="page-sub">{sourceName}</div>
        </div>
        <div className="spacer" />
        <Badge tone="live" icon={<IconUsers />}>
          {viewers.length} de {MAX_VIEWERS}
        </Badge>
        <Button variant="danger" onClick={onStop} icon={<IconStop size={16} />}>
          Parar
        </Button>
      </header>

      <div className="live-body">
        <section className="live-main">
          <div className="live-preview">
            {/* Mudo por obrigacao: reproduzir o loopback realimentaria a captura. */}
            <video ref={videoRef} autoPlay muted playsInline />
          </div>

          <div className="live-stats">
            <StatPill label="Saindo" value={formatBitrate(summary.bitrate)} />
            <StatPill label="FPS" value={String(summary.fps)} />
            <StatPill label="Resolução" value={summary.resolution} />
            <StatPill label="Codec" value={summary.codec} />
            <StatPill
              label="Perda"
              value={`${summary.loss.toFixed(1)}%`}
              tone={summary.loss > 3 ? 'bad' : summary.loss > 0.8 ? 'warn' : 'good'}
            />
          </div>

          {summary.limited !== 'none' && (
            <div className="live-warning">
              <IconAlert size={16} />
              <span>
                {LIMITATION_LABEL[summary.limited]}.{' '}
                {summary.limited === 'cpu'
                  ? 'Baixe o preset ou troque o codec para H.264.'
                  : 'Reduza a taxa máxima ou use cabo em vez de Wi-Fi.'}
              </span>
            </div>
          )}

          {stream && settings.quality.audio && <AudioMeter stream={stream} />}
        </section>

        <aside className="live-side screen-scroll">
          {info?.pin ? (
            <div className="code-card">
              <span className="code-label">
                <IconLock size={13} /> Código de acesso
              </span>
              <div className="code-digits mono selectable">
                {info.pin.slice(0, 3)}
                <span className="code-gap" />
                {info.pin.slice(3)}
              </div>
              <Button
                size="sm"
                variant="subtle"
                onClick={copyCode}
                icon={copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
              >
                {copied ? 'Copiado' : 'Copiar código'}
              </Button>
            </div>
          ) : (
            <div className="code-card code-card-open">
              <span className="code-label">Entrada livre</span>
              <p className="code-open-text">
                Qualquer pessoa na rede pode entrar sem código. Você continua podendo
                remover quem quiser da lista abaixo.
              </p>
            </div>
          )}

          <button
            className="live-address"
            onClick={() => void copyAddress()}
            disabled={!info}
            title="Copiar endereço"
          >
            <span className="live-address-line">
              <span className="mono">{info ? `${info.ip}:${info.port}` : '—'}</span>
              {copiedAddress ? <IconCheck size={13} /> : <IconCopy size={13} />}
            </span>
            <span className="live-address-hint">
              {copiedAddress ? 'copiado' : 'se não te acharem sozinhos, passe este endereço'}
            </span>
          </button>

          <div className="viewers">
            <div className="viewers-head">
              <span className="viewers-title">Assistindo agora</span>
            </div>

            {viewers.length === 0 ? (
              <div className="viewers-empty">
                <span className="spinner" />
                <span>
                  Esperando alguém entrar. Peça para abrirem o app e clicarem em
                  &ldquo;Assistir&rdquo;.
                </span>
              </div>
            ) : (
              <ul className="viewer-list">
                {viewers.map((viewer) => {
                  const state = states[viewer.id] ?? 'conectando'
                  return (
                    <li key={viewer.id} className="viewer-row">
                      <div className="viewer-info">
                        <span className="viewer-name">{viewer.name}</span>
                        <span className="viewer-meta mono">
                          {viewer.address}
                          {viewer.pingMs !== null && ` · ${viewer.pingMs}ms`}
                        </span>
                      </div>
                      <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
                      <IconButton
                        label={`Remover ${viewer.name}`}
                        variant="danger"
                        onClick={() => broadcast.kick(viewer.id)}
                      >
                        <IconExit size={16} />
                      </IconButton>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="live-quality">
            <span className="live-quality-title">Qualidade</span>
            <p className="live-quality-note">
              As mudanças valem na hora, sem derrubar ninguém.
            </p>
            <QualityPanel
              audioLocked
              settings={settings.quality}
              onChange={(next) => {
                onSettingsChange({ quality: next })
                applyLive(next)
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
