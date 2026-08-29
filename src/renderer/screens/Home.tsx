import { useDiscovery } from '@/hooks/useDiscovery'
import { Badge } from '@/components/ui'
import { IconBroadcast, IconEye, IconUsers, IconWifi } from '@/components/Icons'
import './Home.css'

/**
 * A descoberta ja roda aqui: saber que existe alguem transmitindo antes de
 * clicar em "Assistir" evita a tela vazia mais frustrante do app.
 */
export function Home({
  onShare,
  onWatch
}: {
  onShare: () => void
  onWatch: () => void
}): React.JSX.Element {
  const { hosts } = useDiscovery(true)

  return (
    <div className="screen home fade-in">
      <div className="home-inner">
        <header className="home-head">
          <h1 className="home-title">O que você quer fazer?</h1>
          <p className="home-sub">
            Tudo acontece dentro da sua rede local. Nada sai para a internet.
          </p>
        </header>

        <div className="home-cards">
          <button className="home-card home-card-share" onClick={onShare}>
            <span className="home-card-icon">
              <IconBroadcast size={26} />
            </span>
            <span className="home-card-title">Compartilhar</span>
            <span className="home-card-desc">
              Escolha uma tela ou uma janela e deixe até 4 pessoas assistirem.
            </span>
            <span className="home-card-foot">
              <Badge tone="accent">Vídeo + áudio do sistema</Badge>
            </span>
          </button>

          <button className="home-card home-card-watch" onClick={onWatch}>
            <span className="home-card-icon">
              <IconEye size={26} />
            </span>
            <span className="home-card-title">Assistir</span>
            <span className="home-card-desc">
              Entre na transmissão de alguém que está na mesma rede que você.
            </span>
            <span className="home-card-foot">
              {hosts.length > 0 ? (
                <Badge tone="live" icon={<IconUsers />}>
                  {hosts.length === 1
                    ? '1 transmissão agora'
                    : `${hosts.length} transmissões agora`}
                </Badge>
              ) : (
                <Badge tone="neutral" icon={<IconWifi />}>
                  Procurando na rede
                </Badge>
              )}
            </span>
          </button>
        </div>

        <p className="home-note">
          Este app só mostra a imagem. Ninguém controla o seu mouse ou teclado.
        </p>
      </div>
    </div>
  )
}
