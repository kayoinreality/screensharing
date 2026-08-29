import { desktopCapturer, session } from 'electron'
import type { DesktopSource } from '@shared/ipc'

/**
 * Selecao de fonte e captura.
 *
 * O fluxo e: o renderer chama `sources.select(id)` -> isso "arma" o handler
 * abaixo -> o renderer chama getDisplayMedia() -> o handler devolve a fonte
 * escolhida sem abrir o seletor nativo do Windows. Sem armar antes, o pedido
 * e negado de proposito: nenhuma pagina consegue capturar a tela sozinha.
 */

interface ArmedSource {
  sourceId: string
  withAudio: boolean
}

let armed: ArmedSource | null = null

/** Titulo da janela do proprio app, para nao aparecer na lista (efeito espelho). */
let ownWindowTitle = ''

export function setOwnWindowTitle(title: string): void {
  ownWindowTitle = title
}

export function armSource(sourceId: string, withAudio: boolean): void {
  armed = { sourceId, withAudio }
}

export function disarmSource(): void {
  armed = null
}

export function installDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      const current = armed
      if (!current) {
        // Nega: nada foi selecionado pela UI do app.
        callback({})
        return
      }

      desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const source = sources.find((s) => s.id === current.sourceId)
          if (!source) {
            callback({})
            return
          }
          callback({
            video: source,
            // 'loopback' captura o audio do sistema inteiro (WASAPI loopback).
            // Nao usar 'loopbackWithMute': ela silencia o host, e ele quer ouvir junto.
            audio: current.withAudio ? 'loopback' : undefined
          })
        })
        .catch((err) => {
          console.error('[capture] getSources falhou:', err)
          callback({})
        })
    },
    // Seletor proprio: a grade de miniaturas do app e parte da interface.
    { useSystemPicker: false }
  )
}

export async function listSources(): Promise<DesktopSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 400, height: 240 },
    fetchWindowIcons: true
  })

  const out: DesktopSource[] = []
  for (const s of sources) {
    const kind: DesktopSource['kind'] = s.id.startsWith('screen:') ? 'screen' : 'window'
    const name = s.name?.trim() ?? ''

    // Janelas sem titulo sao quase sempre superficies invisiveis do sistema.
    if (kind === 'window' && !name) continue
    // A propria janela do app: capturar ela gera o efeito de espelho infinito.
    if (kind === 'window' && ownWindowTitle && name === ownWindowTitle) continue

    out.push({
      id: s.id,
      name: kind === 'screen' && !name ? 'Tela' : name,
      kind,
      thumbnail: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
      appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
      displayId: s.display_id ?? ''
    })
  }

  // Telas primeiro, depois janelas em ordem alfabetica.
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'screen' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return out
}
