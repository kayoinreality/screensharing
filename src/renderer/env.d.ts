/// <reference types="vite/client" />

import type { Api } from '@shared/ipc'

declare global {
  interface Window {
    /** Exposto pelo preload via contextBridge. Unica via de acesso ao Node. */
    api: Api
  }
}

export {}
