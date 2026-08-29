import { useEffect, useRef, useState } from 'react'
import { IconVolume, IconVolumeOff } from './Icons'
import './AudioMeter.css'

/**
 * Medidor do audio capturado.
 *
 * Existe porque a previa de video e obrigatoriamente muda: tocar o loopback do
 * sistema realimentaria a propria captura. Sem este medidor nao haveria como
 * conferir que o audio esta entrando antes de comecar a transmitir.
 *
 * O AnalyserNode nunca e ligado ao destination — ele so le, nao reproduz.
 */
export function AudioMeter({ stream }: { stream: MediaStream | null }): React.JSX.Element {
  const [level, setLevel] = useState(0)
  const [hasAudio, setHasAudio] = useState(false)
  const peakRef = useRef(0)

  useEffect(() => {
    const track = stream?.getAudioTracks()[0]
    if (!stream || !track) {
      setHasAudio(false)
      setLevel(0)
      return
    }
    setHasAudio(true)

    const context = new AudioContext()
    const source = context.createMediaStreamSource(new MediaStream([track]))
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.75
    source.connect(analyser)

    const buffer = new Uint8Array(analyser.fftSize)
    let raf = 0

    const tick = (): void => {
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (const sample of buffer) {
        const centered = (sample - 128) / 128
        sum += centered * centered
      }
      const rms = Math.sqrt(sum / buffer.length)
      // Escala perceptual: em linear o medidor mal sai do zero em volume normal.
      const scaled = Math.min(1, Math.sqrt(rms) * 1.9)
      // Queda suave: o pico segura um instante para o movimento ficar legivel.
      peakRef.current = Math.max(scaled, peakRef.current * 0.9)
      setLevel(peakRef.current)
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      source.disconnect()
      void context.close()
    }
  }, [stream])

  return (
    <div className={`audio-meter ${hasAudio ? '' : 'is-silent'}`}>
      {hasAudio ? <IconVolume size={15} /> : <IconVolumeOff size={15} />}
      <div className="meter-track">
        <div className="meter-fill" style={{ transform: `scaleX(${level})` }} />
      </div>
      <span className="meter-label">
        {hasAudio ? 'Áudio do sistema' : 'Sem áudio'}
      </span>
    </div>
  )
}
