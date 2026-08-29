import { useEffect, type ReactNode } from 'react'
import { IconButton } from './ui'
import { IconClose } from './Icons'
import './Modal.css'

export function Modal({
  open,
  title,
  description,
  icon,
  onClose,
  children,
  footer,
  width = 460
}: {
  open: boolean
  title: string
  description?: ReactNode
  icon?: ReactNode
  onClose?: () => void
  children?: ReactNode
  footer?: ReactNode
  width?: number
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open || !onClose) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          {icon && <div className="modal-icon">{icon}</div>}
          <div className="modal-heading">
            <h2 className="modal-title">{title}</h2>
            {description && <div className="modal-desc">{description}</div>}
          </div>
          {onClose && (
            <IconButton label="Fechar" onClick={onClose}>
              <IconClose size={17} />
            </IconButton>
          )}
        </div>

        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
