import { createSocket } from 'node:dgram'
import { createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import type { NetInterface } from '@shared/ipc'

/**
 * Descoberta usa broadcast dirigido, nao multicast.
 *
 * Multicast no Windows exige addMembership por interface e falha em silencio
 * quando ha adaptadores virtuais (Hyper-V, WSL, VirtualBox) — que sao a regra,
 * nao a excecao, em PC de quem joga. Broadcast por sub-rede e chato de calcular
 * mas funciona sempre.
 */

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

function toInt(ip: string): number {
  const p = ip.split('.').map(Number)
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}

function toIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/** Endereco de broadcast da sub-rede: (endereco | ~mascara). */
export function broadcastAddress(address: string, netmask: string): string {
  return toIp((toInt(address) | (~toInt(netmask) >>> 0)) >>> 0)
}

export function sameSubnet(a: string, b: string, netmask: string): boolean {
  const m = toInt(netmask)
  return (toInt(a) & m) === (toInt(b) & m)
}

/**
 * IP da rota padrao, sem enviar pacote nenhum.
 *
 * `dgram.connect` em UDP so fixa o destino do socket — o SO resolve a rota e
 * atribui o endereco local na hora, e `address()` passa a devolve-lo. Nada
 * trafega, entao funciona mesmo offline da internet (desde que haja rota).
 */
export function preferredAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    const sock = createSocket({ type: 'udp4', reuseAddr: true })
    const done = (value: string | null): void => {
      try {
        sock.close()
      } catch {
        /* ja fechado */
      }
      resolve(value)
    }
    sock.once('error', () => done(null))
    try {
      sock.connect(53, '8.8.8.8', () => {
        try {
          done(sock.address().address)
        } catch {
          done(null)
        }
      })
    } catch {
      done(null)
    }
    setTimeout(() => done(null), 500).unref()
  })
}

/** Interfaces IPv4 utilizaveis, com a da rota padrao marcada como preferida. */
export async function listInterfaces(): Promise<NetInterface[]> {
  const preferred = await preferredAddress()
  const out: NetInterface[] = []

  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue
      if (!IPV4_RE.test(a.address) || !IPV4_RE.test(a.netmask)) continue
      out.push({
        name,
        address: a.address,
        netmask: a.netmask,
        broadcast: broadcastAddress(a.address, a.netmask),
        isPreferred: a.address === preferred
      })
    }
  }

  // A interface da rota padrao primeiro; o resto por nome, so para a lista ficar estavel.
  out.sort((x, y) => Number(y.isPreferred) - Number(x.isPreferred) || x.name.localeCompare(y.name))
  return out
}

/** Enderecos para onde mandar os pacotes de descoberta. */
export async function broadcastTargets(preferredInterface: string | null): Promise<string[]> {
  const all = await listInterfaces()
  const chosen = preferredInterface ? all.filter((i) => i.address === preferredInterface) : all
  const set = new Set<string>(chosen.map((i) => i.broadcast))
  // 255.255.255.255 cobre o caso de mascara mal reportada por adaptador virtual.
  set.add('255.255.255.255')
  return [...set]
}

/** IP local a anunciar. Respeita a escolha manual; senao usa a rota padrao. */
export async function localAddress(preferredInterface: string | null): Promise<string> {
  if (preferredInterface) return preferredInterface
  const p = await preferredAddress()
  if (p) return p
  const all = await listInterfaces()
  return all[0]?.address ?? '127.0.0.1'
}

/** Primeira porta TCP livre a partir de `start`. */
export function findFreePort(start: number, attempts = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = start
    const tryPort = (): void => {
      if (port >= start + attempts) {
        reject(new Error(`Nenhuma porta livre entre ${start} e ${start + attempts}.`))
        return
      }
      const srv = createServer()
      srv.once('error', () => {
        srv.close()
        port += 1
        tryPort()
      })
      srv.once('listening', () => {
        srv.close(() => resolve(port))
      })
      srv.listen(port, '0.0.0.0')
    }
    tryPort()
  })
}
