# LAN ScreenShare

[![Validar o app](https://github.com/kayoinreality/screensharing/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/kayoinreality/screensharing/actions/workflows/ci-cd.yml)

Site de apresentação: [kayoinreality.github.io/screensharing](https://kayoinreality.github.io/screensharing/)

Compartilhamento de tela dentro da rede local, sem servidor na internet e **sem
controle remoto** — quem entra só assiste.

Feito para dois casos: assistir vídeo em conjunto (áudio do sistema junto,
sincronizado) e mostrar um jogo rodando (60fps com pouco impacto de CPU no
computador que transmite).

---

## Como usar

Abra o app e escolha um dos dois lados.

**Compartilhar** — escolha uma tela ou uma janela na grade, ajuste a qualidade,
clique em *Iniciar transmissão*. Aparece um código de 6 dígitos: passe para quem
vai assistir. Você vê quem entrou, o ping de cada um e pode remover qualquer
pessoa a qualquer momento.

**Assistir** — quem estiver transmitindo na mesma rede aparece na lista sozinho,
sem precisar digitar endereço. Clique, informe o código e pronto. Se não aparecer,
use **Conectar por IP** e digite o endereço que está na tela de quem transmite —
é a saída para redes onde o broadcast não circula.

No player: `F` alterna tela cheia, `M` corta o som, `Esc` sai. Os controles
somem sozinhos e voltam ao mover o mouse.

### Presets de qualidade

| Preset | Resolução | FPS | Taxa | Prioriza |
|---|---|---|---|---|
| Leve | 720p | 30 | 3 Mb/s | equilíbrio |
| Filme | 1080p | 30 | 8 Mb/s | nitidez |
| Jogo | 1080p | 60 | 12 Mb/s | fluidez |
| Máxima | nativa | 60 | 25 Mb/s | fluidez |

*Personalizado* abre resolução, fps, taxa, comportamento sob rede ruim e codec.
Tudo isso pode ser mudado **durante** a transmissão, sem derrubar ninguém — só o
áudio não, porque ligar ou desligar exige refazer a captura.

As taxas são altas de propósito: em rede local a banda sobra e o gargalo real é
o encoder, não a rede.

---

## Firewall do Windows

**Só quem transmite precisa mexer nisso.** Quem assiste faz conexão de saída, que
o Windows já permite.

Quem transmite roda um servidor (descoberta em UDP, sinalização em WebSocket e o
tráfego do WebRTC), e o Windows bloqueia isso por padrão. Na primeira vez que
você clicar em *Iniciar transmissão*, o app oferece criar a regra — é um clique
e uma confirmação do Windows.

A regra é criada com `profile=any`, cobrindo também o perfil **Pública** — é o
perfil em que o Windows costuma colocar adaptadores de VPN, justamente o caminho
usado para assistir com alguém de outra casa. Restringir a `private` faria a
regra existir e a conexão falhar mesmo assim.

O que protege a transmissão é o código de acesso, não o perfil de rede. Numa rede
Pública de verdade (cafeteria, faculdade), qualquer pessoa vê sua transmissão na
lista — mas não entra sem o código.

Para fazer manualmente, no Prompt de Comando **como administrador**:

```bash
netsh advfirewall firewall add rule name="LAN ScreenShare" dir=in action=allow program="CAMINHO\DO\LAN ScreenShare.exe" enable=yes profile=any
```

---

## Se os dois computadores não se enxergarem

Na ordem de probabilidade:

1. **Firewall** no lado de quem transmite — veja acima.
2. **Placa de rede errada no lado de quem transmite** — o endereço mostrado na
   tela dele precisa ser um que você alcance.
3. **Várias placas ativas.** Com Radmin VPN, Hyper-V, WSL ou VirtualBox
   instalados, a detecção automática pode escolher a placa virtual. Use o seletor
   **Rede** (embaixo do painel de qualidade, e no rodapé da tela de Assistir) para
   apontar a que os dois realmente compartilham.
4. **Isolamento de clientes no Wi-Fi.** Alguns roteadores — e quase todo Wi-Fi de
   hotel, faculdade e cafeteria — bloqueiam tráfego entre dispositivos. Não há
   como contornar pelo app; teste com os dois no cabo ou em outra rede.
5. **Broadcast que não circula.** VPNs e redes segmentadas às vezes entregam
   tráfego normal mas descartam broadcast — a descoberta falha e o resto
   funcionaria. Use **Conectar por IP** com o endereço que aparece na tela de
   quem transmite.

---

## Assistir com alguém de outra casa

O app é LAN de verdade: ele não funciona pela internet aberta. Para isso, os dois
precisam entrar numa **rede virtual** que faça as máquinas se enxergarem como se
estivessem no mesmo roteador — Radmin VPN, ZeroTier ou Tailscale servem.

Depois de conectados na rede virtual, dos dois lados:

1. Abra o seletor **Rede** e escolha o adaptador da VPN em vez de *Automática*.
   Sem isso, quem transmite anuncia o IP da placa de casa, que não serve para o
   outro, e a busca sai pela rede errada.
2. Quem transmite libera o firewall (a regra já cobre o perfil Pública, que é
   como o Windows classifica adaptadores de VPN).
3. Se mesmo assim não aparecer na lista, use **Conectar por IP** com o endereço
   mostrado na tela de quem transmite. Nem toda VPN repassa broadcast.

**Ajuste a qualidade.** Em rede local a banda sobra; pela internet, não. O gargalo
passa a ser a sua **velocidade de upload**: o preset *Filme* pede 8 Mb/s de
subida, o que a maior parte das conexões domésticas não tem. Comece no **Leve**
(3 Mb/s) e suba se estiver folgado. O WebRTC reduz sozinho quando falta banda,
mas começar acima do teto causa engasgo até ele se ajustar.

---

## Desenvolvimento

```bash
npm install
```

```bash
npm run dev
```

Para testar as duas pontas em um PC só, com o `npm run dev` já rodando, abra uma
segunda instância em outro terminal:

```bash
ELECTRON_RENDERER_URL=http://localhost:5173 ./node_modules/.bin/electron .
```

As duas instâncias se enxergam: o socket UDP usa `reuseAddr`, e o Windows entrega
localmente o broadcast que a própria máquina emitiu.

Verificação de tipos e build do `.exe` portátil:

```bash
npm run typecheck
```

```bash
npm run dist
```

O resultado sai em `dist/LAN-ScreenShare-1.0.0.exe`.

### Publicar uma versão

O GitHub gera o executável portátil e cria a release automaticamente sempre que
uma tag que começa com `v` é enviada. A tag deve acompanhar a versão no
`package.json`:

```bash
npm version patch
git push --follow-tags
```

Para uma versão menor ou maior, troque `patch` por `minor` ou `major`.

---

## Como funciona

```
       HOST                                        ESPECTADOR
┌────────────────────┐                        ┌────────────────────┐
│ main (Node)        │                        │ main (Node)        │
│  • descoberta UDP ─┼── anuncia a cada 2s ──▶│  • descoberta UDP  │
│  • ws server :41235│◀───── conecta TCP ─────┼── ws client        │
│  • desktopCapturer │      (SDP + ICE)       │                    │
└─────────┬──────────┘                        └─────────┬──────────┘
          │ IPC                                         │ IPC
┌─────────┴──────────┐                        ┌─────────┴──────────┐
│ renderer (React)   │═════ WebRTC P2P ══════▶│ renderer (React)   │
│  4× RTCPeerConn    │   vídeo H.264 + Opus   │  1× RTCPeerConn    │
└────────────────────┘  (nunca passa pelo ws) └────────────────────┘
```

O WebRTC roda no renderer (é API de browser) e o servidor roda no main (é Node).
O main só repassa SDP e ICE por IPC — **a imagem nunca passa por ele**.

**Descoberta** usa broadcast UDP dirigido por sub-rede, não multicast: multicast
no Windows exige `addMembership` por placa e falha em silêncio quando há
adaptadores virtuais, que são a regra em PC de quem joga.

**Uma conexão WebRTC por espectador** (malha, até 4). Todas recebem os tracks do
mesmo `MediaStream`, o que é justamente o que faz o Chromium sincronizar áudio e
vídeo por RTCP em cada uma.

**H.264 por padrão**, via `setCodecPreferences`. É o único com encode por
hardware garantido em NVIDIA, Intel e AMD — e é isso que decide se dá para jogar
enquanto transmite. VP9 e AV1 ficam como opção avançada.

### Detalhes que não são óbvios no código

- `disable-features=WebRtcHideLocalIpsWithMdns` em `src/main/index.ts`: sem isso
  o Chromium troca os IPs locais por nomes `.local` e o ICE não fecha na LAN.
- O SDP é editado à mão para pedir Opus estéreo a 192kbps
  (`src/renderer/rtc/sdp.ts`). O padrão é mono em ~64kbps, o que arruína a
  trilha de um filme, e não existe API para isso além do texto do SDP.
- A prévia no lado de quem transmite é **sempre muda**: reproduzir o loopback do
  sistema realimentaria a própria captura. Daí existir o medidor de áudio — é a
  única forma de conferir que o som está entrando.
- O build portátil fixa `unpackDirName`. Sem isso o `.exe` se extrai em
  `%TEMP%\<uuid>` diferente a cada versão, e a regra de firewall (indexada por
  caminho do executável) precisaria ser recriada sempre.

---

## Limites conhecidos

- **Até 4 espectadores.** É malha: cada espectador é mais um encode no host.
- **Jogo em tela cheia exclusiva** pode não ser capturado. Use *fullscreen sem
  bordas* / janela.
- **Sem controle remoto, por decisão de projeto.** Não existe canal de dados nem
  qualquer via de entrada — o espectador só consegue enviar sinalização.
- **Só Windows.** O áudio loopback depende do WASAPI.
- **O executável não é assinado.** Na primeira execução o Windows mostra
  *"O Windows protegeu o seu computador"* — é preciso clicar em **Mais
  informações → Executar assim mesmo**. Assinar exige um certificado pago.
