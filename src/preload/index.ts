import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH } from '@shared/ipc'
import type {
  Api,
  AppInfo,
  AppSettings,
  FirewallStatus,
  HostStartOptions,
  HostStartResult,
  NetInterface,
  DesktopSource,
  Unsubscribe,
  ViewerClosedInfo,
  ViewerConnectOptions,
  ViewerConnectResult
} from '@shared/ipc'
import type {
  ConnectedViewer,
  DiscoveredHost,
  HostToViewer,
  ViewerToHost
} from '@shared/protocol'

/**
 * Unica ponte entre o renderer e o Node. O renderer roda com contextIsolation
 * e sandbox ligados: nao existe `require` do outro lado, so este objeto.
 */

function subscribe<A extends unknown[]>(
  channel: string,
  cb: (...args: A) => void
): Unsubscribe {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: Api = {
  app: {
    info: () => ipcRenderer.invoke(CH.appInfo) as Promise<AppInfo>,
    minimize: () => ipcRenderer.send(CH.appMinimize),
    toggleMaximize: () => ipcRenderer.send(CH.appToggleMaximize),
    close: () => ipcRenderer.send(CH.appClose),
    setAlwaysOnTop: (value) => ipcRenderer.invoke(CH.appAlwaysOnTop, value) as Promise<boolean>,
    onMaximizeChange: (cb) => subscribe<[boolean]>(CH.appMaximizeChanged, cb)
  },
  sources: {
    list: () => ipcRenderer.invoke(CH.sourcesList) as Promise<DesktopSource[]>,
    select: (sourceId, withAudio) =>
      ipcRenderer.invoke(CH.sourcesSelect, sourceId, withAudio) as Promise<void>
  },
  host: {
    start: (opts: HostStartOptions) =>
      ipcRenderer.invoke(CH.hostStart, opts) as Promise<HostStartResult>,
    stop: () => ipcRenderer.invoke(CH.hostStop) as Promise<void>,
    kick: (viewerId) => ipcRenderer.invoke(CH.hostKick, viewerId) as Promise<void>,
    send: (viewerId, msg: HostToViewer) => ipcRenderer.send(CH.hostSend, viewerId, msg),
    setViewerCount: (n) => ipcRenderer.send(CH.hostSetViewerCount, n),
    onViewers: (cb) => subscribe<[ConnectedViewer[]]>(CH.hostViewers, cb),
    onMessage: (cb) => subscribe<[string, ViewerToHost]>(CH.hostMessage, cb)
  },
  discovery: {
    start: () => ipcRenderer.invoke(CH.discoveryStart) as Promise<void>,
    stop: () => ipcRenderer.invoke(CH.discoveryStop) as Promise<void>,
    refresh: () => ipcRenderer.send(CH.discoveryRefresh),
    onHosts: (cb) => subscribe<[DiscoveredHost[]]>(CH.discoveryHosts, cb)
  },
  viewer: {
    connect: (opts: ViewerConnectOptions) =>
      ipcRenderer.invoke(CH.viewerConnect, opts) as Promise<ViewerConnectResult>,
    send: (msg: ViewerToHost) => ipcRenderer.send(CH.viewerSend, msg),
    disconnect: () => ipcRenderer.send(CH.viewerDisconnect),
    onMessage: (cb) => subscribe<[HostToViewer]>(CH.viewerMessage, cb),
    onClosed: (cb) => subscribe<[ViewerClosedInfo]>(CH.viewerClosed, cb)
  },
  net: {
    interfaces: () => ipcRenderer.invoke(CH.netInterfaces) as Promise<NetInterface[]>
  },
  firewall: {
    status: () => ipcRenderer.invoke(CH.firewallStatus) as Promise<FirewallStatus>,
    authorize: () =>
      ipcRenderer.invoke(CH.firewallAuthorize) as Promise<{ ok: boolean; error?: string }>
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet) as Promise<AppSettings>,
    set: (patch) => ipcRenderer.invoke(CH.settingsSet, patch) as Promise<AppSettings>
  }
}

contextBridge.exposeInMainWorld('api', api)
