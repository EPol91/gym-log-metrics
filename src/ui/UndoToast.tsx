import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { subscribeUndo, runUndo, clearUndo, type UndoAction } from '../util/undo'

/** Avviso in basso con "Annulla" dopo un'eliminazione. Sparisce da solo. */
export function UndoToast() {
  const [action, setAction] = useState<UndoAction | null>(null)
  useEffect(() => subscribeUndo(setAction), [])
  if (!action) return null

  return createPortal(
    <div style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 1100,
      width: 'min(480px, calc(100% - 24px))',
      background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12,
      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 6px 20px rgba(0,0,0,.5)',
    }}>
      <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {action.label}
      </span>
      <button className="chip on" style={{ flex: 'none' }} onClick={() => runUndo()}>Annulla</button>
      <button className="ghost small" style={{ flex: 'none', padding: '4px 8px' }} onClick={clearUndo}>✕</button>
    </div>,
    document.body,
  )
}
