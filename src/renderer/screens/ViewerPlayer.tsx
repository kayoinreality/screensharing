import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, IconButton, StatPill } from '@/components/ui'
import {
  IconActivity,
  IconArrowLeft,
  IconFullscreen,
  IconPin,
  IconVolume,
  IconVolumeOff
} from '@/components/Icons'
import { formatBitrate } from '@/rtc/stats'
import type { ViewerStream } from '@/hooks/useViewerStream'
import './ViewerPlayer.css'

const IDLE_MS = 2600

const STATE_LABEL: Record<string, string> = {
  conectando: 'Conectando',
  recebendo: 'Ao vivo',
  instavel: 'Reconectando',
  encerrado: 'Encerrado'
}

export function ViewerPlayer({
  viewer,
  onLeave
}: {
  viewer: ViewerStream
  onLeave: () => void
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<number>(0)

  const [controlsVisible, setControlsVisible] = useState(true)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [onTop, setOnTop] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const { stream, state, stats, connection } = viewer

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = muted
    video.volume = volume
  }, [muted, volume])

  /** Os controles somem sozinhos; qualquer movimento do mouse os traz de volta. */
  const wake = useCallback((): void => {
    setControlsVisible(true)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setControlsVisible(false), IDLE_MS)
  }, [])

  useEffect(() => {
    wake()
    return () => window.clearTimeout(idleTimer.current)
  }, [wake])

  const toggleFullscreen = useCallback((): void => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shellRef.current?.requestFullscreen()
  }, [])

  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      else if (e.key === 'm' || e.key === 'M') setMuted((m) => !m)
      else if (e.key === 'Escape' && !document.fullscreenElement) onLeave()
      wake()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen, onLeave, wake])

  const toggleOnTop = async (): Promise<void> => {
    setOnTop(await window.api.app.setAlwaysOnTop(!onTop))
  }

  const waiting = !stream || state === 'conectando'

  return (
    <div
      ref={shellRef}
      className={`player ${controlsVisible ? '' : 'is-idle'}`}
      onMouseMove={wake}
      onDoubleClick={toggleFullscreen}
    >
      <video ref={videoRef} autoPlay playsInline />

      {waiting && (
        <div className="player-waiting">
          <span className="spinner" />
          <span>Negociando a conexão com {connection?.hostName ?? 'o host'}...</span>
        </div>
      )}

      {state === 'instavel' && (
        <div className="player-banner">A conexão oscilou. Tentando recuperar...</div>
      )}

      <div className="player-top">
        <IconButton label="Sair da transmissão" onClick={onLeave}>
          <IconArrowLeft size={19} />
        </IconButton>
        <div className="player-title">
          <span className="player-host">{connection?.hostName ?? '—'}</span>
          <span className="player-source">{connection?.sourceName ?? ''}</span>
        </div>
        <Badge tone={state === 'recebendo' ? 'live' : state === 'instavel' ? 'warning' : 'neutral'}>
          {STATE_LABEL[state] ?? state}
        </Badge>
      </div>

      <div className="player-bottom">
        <div className="player-volume">
          <IconButton
            label={muted ? 'Ativar som' : 'Silenciar'}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? <IconVolumeOff size={18} /> : <IconVolume size={18} />}
          </IconButton>
          <input
            className="slider volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            style={{ ['--fill' as string]: `${(muted ? 0 : volume) * 100}%` }}
            onChange={(e) => {
              const v = Number(e.target.value)
              setVolume(v)
              setMuted(v === 0)
            }}
            aria-label="Volume"
          />
        </div>

        <div className="spacer" />

        <IconButton
          label="Estatísticas"
          active={showStats}
          onClick={() => setShowStats((s) => !s)}
        >
          <IconActivity size={18} />
        </IconButton>
        <IconButton label="Manter sempre visível" active={onTop} onClick={() => void toggleOnTop()}>
          <IconPin size={18} />
        </IconButton>
        <IconButton
          label={fullscreen ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}
          onClick={toggleFullscreen}
        >
          <IconFullscreen size={18} />
        </IconButton>
      </div>

      {showStats && (
        <div className="player-stats fade-in">
          <StatPill label="Chegando" value={formatBitrate(stats.bitrateKbps)} />
          <StatPill label="FPS" value={String(stats.fps)} />
          <StatPill
            label="Resolução"
            value={stats.width ? `${stats.width}x${stats.height}` : '—'}
          />
          <StatPill label="Codec" value={stats.codec} />
          <StatPill
            label="Latência"
            value={stats.rttMs === null ? '—' : `${stats.rttMs}ms`}
            tone={stats.rttMs === null ? 'neutral' : stats.rttMs > 120 ? 'warn' : 'good'}
          />
          <StatPill
            label="Perda"
            value={`${stats.lossPct.toFixed(1)}%`}
            tone={stats.lossPct > 3 ? 'bad' : stats.lossPct > 0.8 ? 'warn' : 'good'}
          />
          <StatPill label="Áudio" value={formatBitrate(stats.audioBitrateKbps)} />
          <StatPill label="Descartados" value={String(stats.framesDropped)} />
        </div>
      )}
    </div>
  )
}
