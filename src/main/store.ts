import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { defaultSettings, DEFAULT_PRESET_ID } from '@shared/quality'
import type { AppSettings } from '@shared/ipc'

/**
 * Preferencias em JSON no userData.
 *
 * Mesmo no build portatil o userData fica em %APPDATA%, entao as configuracoes
 * sobrevivem entre execucoes e entre versoes do exe.
 */

let cached: AppSettings | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function friendlyName(): string {
  try {
    const user = userInfo().username
    return user ? `PC de ${user}` : hostname()
  } catch {
    return hostname()
  }
}

function fresh(): AppSettings {
  const name = friendlyName()
  return {
    hostName: name,
    viewerName: name,
    quality: defaultSettings(),
    presetId: DEFAULT_PRESET_ID,
    requirePin: true,
    preferredInterface: null,
    firewallPromptDismissed: false
  }
}

/** Merge raso com os padroes: campos novos de versoes futuras nao quebram o arquivo antigo. */
function normalize(raw: unknown): AppSettings {
  const base = fresh()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<AppSettings>
  return {
    ...base,
    ...input,
    quality: { ...base.quality, ...(input.quality ?? {}) }
  }
}

export function getSettings(): AppSettings {
  if (cached) return cached
  try {
    cached = normalize(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    cached = fresh()
  }
  return cached
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = normalize({ ...getSettings(), ...patch })
  cached = next
  try {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.warn('[store] nao foi possivel salvar as preferencias:', (err as Error).message)
  }
  return next
}
