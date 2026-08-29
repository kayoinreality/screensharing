import { randomInt, randomUUID } from 'node:crypto'
import { app, ipcMain } from 'electron'
import { CH } from '@shared/ipc'
import type {
  AppInfo,
  AppSettings,
  HostStartOptions,
  HostStartResult,
  ViewerConnectOptions
} from '@shared/ipc'
import { MAX_VIEWERS, type HostToViewer, type ViewerToHost } from '@shared/protocol'
import { hostname } from 'node:os'
import { Discovery } from './discovery'
import { SignalingClient, SignalingServer } from './signaling'
import { armSource, disarmSource, listSources } from './capture'
import { findFreePort, listInterfaces, localAddress } from './net'
import { authorize as firewallAuthorize, status as firewallStatus } from './firewall'
import { getSettings, setSettings } from './store'
import { getMainWindow } from './window'
import { SIGNALING_PORT } from '@shared/protocol'

const discovery = new Discovery()
const server = new SignalingServer()
const client = new SignalingClient()

function toRenderer(channel: string, ...args: unknown[]): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

function makePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

// Eventos vindos da rede sao empurrados para o renderer, que e quem fala WebRTC.
discovery.onHosts = (hosts) => toRenderer(CH.discoveryHosts, hosts)

server.onViewers = (viewers) => {
  discovery.patchAnnounce({ viewers: viewers.length })
  toRenderer(CH.hostViewers, viewers)
}
server.onMessage = (viewerId, msg) => toRenderer(CH.hostMessage, viewerId, msg)

client.onMessage = (msg) => toRenderer(CH.viewerMessage, msg)
client.onClosed = (info) => toRenderer(CH.viewerClosed, info)

/**
 * Derruba tudo que a transmissao segura.
 *
 * Roda incondicionalmente: se `server.start()` funciona e o announce falha logo
 * depois, o caminho de erro precisa fechar o servidor mesmo sem a sessao ter se
 * completado — senao a porta fica escutando para sempre. As duas chamadas sao
 * seguras quando nao ha nada rodando.
 */
async function stopHosting(): Promise<void> {
  await discovery.stopAnnouncing()
  await server.stop()
  disarmSource()
}

export function registerIpc(): void {
  // ------------------------------------------------------------------- app
  ipcMain.handle(CH.appInfo, (): AppInfo => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      hostname: hostname(),
      isPackaged: app.isPackaged
    }
  })

  ipcMain.on(CH.appMinimize, () => getMainWindow()?.minimize())
  ipcMain.on(CH.appToggleMaximize, () => {
    const win = getMainWindow()
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(CH.appClose, () => getMainWindow()?.close())
  ipcMain.handle(CH.appAlwaysOnTop, (_e, value: boolean) => {
    const win = getMainWindow()
    if (!win) return false
    win.setAlwaysOnTop(value)
    return win.isAlwaysOnTop()
  })

  // --------------------------------------------------------------- fontes
  ipcMain.handle(CH.sourcesList, () => listSources())
  ipcMain.handle(CH.sourcesSelect, (_e, sourceId: string, withAudio: boolean) => {
    armSource(sourceId, withAudio)
  })

  // ------------------------------------------------------------------ host
  ipcMain.handle(CH.hostStart, async (_e, opts: HostStartOptions): Promise<HostStartResult> => {
    try {
      await stopHosting()

      const settings = getSettings()
      const pin = opts.requirePin ? makePin() : null
      const port = await findFreePort(SIGNALING_PORT)
      const ip = await localAddress(settings.preferredInterface)
      const sessionId = randomUUID()
      const maxViewers = Math.min(Math.max(1, opts.maxViewers), MAX_VIEWERS)

      await server.start(port, {
        hostName: opts.hostName,
        sourceName: opts.sourceName,
        sourceKind: opts.sourceKind,
        pin,
        maxViewers
      })

      discovery.preferredInterface = settings.preferredInterface
      await discovery.startAnnouncing({
        id: sessionId,
        name: opts.hostName,
        ip,
        port,
        requiresPin: pin !== null,
        sourceName: opts.sourceName,
        sourceKind: opts.sourceKind,
        viewers: 0,
        maxViewers,
        startedAt: Date.now()
      })

      return { ok: true, sessionId, ip, port, pin }
    } catch (err) {
      await stopHosting()
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CH.hostStop, () => stopHosting())

  ipcMain.handle(CH.hostKick, (_e, viewerId: string) => {
    server.kick(viewerId)
  })

  ipcMain.on(CH.hostSend, (_e, viewerId: string, msg: HostToViewer) => {
    server.send(viewerId, msg)
  })

  ipcMain.on(CH.hostSetViewerCount, (_e, n: number) => {
    discovery.patchAnnounce({ viewers: n })
  })

  // ------------------------------------------------------------ descoberta
  ipcMain.handle(CH.discoveryStart, async () => {
    discovery.preferredInterface = getSettings().preferredInterface
    await discovery.startBrowsing()
  })
  ipcMain.handle(CH.discoveryStop, () => {
    discovery.stopBrowsing()
  })
  ipcMain.on(CH.discoveryRefresh, () => discovery.refresh())

  // ------------------------------------------------------------ espectador
  ipcMain.handle(CH.viewerConnect, (_e, opts: ViewerConnectOptions) => client.connect(opts))
  ipcMain.on(CH.viewerSend, (_e, msg: ViewerToHost) => client.send(msg))
  ipcMain.on(CH.viewerDisconnect, () => client.disconnect())

  // ------------------------------------------------------------------ rede
  ipcMain.handle(CH.netInterfaces, () => listInterfaces())

  // -------------------------------------------------------------- firewall
  ipcMain.handle(CH.firewallStatus, () => firewallStatus())
  ipcMain.handle(CH.firewallAuthorize, () => firewallAuthorize())

  // --------------------------------------------------------- preferencias
  ipcMain.handle(CH.settingsGet, () => getSettings())
  ipcMain.handle(CH.settingsSet, (_e, patch: Partial<AppSettings>) => {
    const next = setSettings(patch)
    // A troca de interface vale para o proximo announce, sem reiniciar nada.
    discovery.preferredInterface = next.preferredInterface
    return next
  })
}

/** Derruba tudo que segura socket, antes do processo sair. */
export async function shutdown(): Promise<void> {
  client.disconnect()
  await stopHosting()
  await discovery.dispose()
}
