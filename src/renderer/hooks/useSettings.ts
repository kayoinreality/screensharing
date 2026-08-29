import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '@shared/ipc'

export interface SettingsResult {
  settings: AppSettings | null
  update(patch: Partial<AppSettings>): void
}

/** Espera este tempo parado antes de escrever no disco. */
const FLUSH_DELAY_MS = 300

/**
 * Preferências persistidas.
 *
 * A escrita é otimista e adiada: o estado local muda na hora e o disco recebe
 * o acumulado depois que o usuário para de mexer. Sem isso, arrastar o slider
 * de taxa dispara dezenas de gravações — um IPC e um write por passo do
 * mouse — e nada disso precisa ser síncrono, são preferências de conforto.
 *
 * A resposta do main é ignorada de propósito: ela poderia chegar depois de uma
 * mudança nova e fazer o controle voltar sozinho. O estado local é a verdade
 * enquanto o usuário está mexendo.
 */
export function useSettings(): SettingsResult {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const pending = useRef<Partial<AppSettings>>({})
  const timer = useRef<number>(0)

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
  }, [])

  const flush = useCallback((): void => {
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length > 0) void window.api.settings.set(patch)
  }, [])

  // Fechar o app no meio de um ajuste nao pode perder a preferencia.
  useEffect(() => {
    const onHide = (): void => {
      window.clearTimeout(timer.current)
      flush()
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [flush])

  const update = useCallback(
    (patch: Partial<AppSettings>): void => {
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
      pending.current = { ...pending.current, ...patch }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, FLUSH_DELAY_MS)
    },
    [flush]
  )

  return { settings, update }
}
