import { useState } from 'react'
import { Check, X, Pencil } from 'lucide-react'

interface InlineNumberEditorProps {
  value: number
  label: string
  onSave: (nextValue: number) => Promise<void>
}

export function InlineNumberEditor({ value, label, onSave }: InlineNumberEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)

  const handleSave = () => {
    const parsed = Number(draft)
    if (draft.trim() === '' || isNaN(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      setDraft(String(value))
      setEditing(false)
      return
    }
    
    setSaving(true)
    onSave(parsed)
      .then(() => {
        setEditing(false)
      })
      .catch(() => {
        setDraft(String(value))
        setEditing(false)
      })
      .finally(() => {
        setSaving(false)
      })
  }

  const handleCancel = () => {
    setDraft(String(value))
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="inline-flex items-center gap-1 group">
        <span className="font-body text-on-surface tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => { setDraft(String(value)); setEditing(true) }}
          className="inline-flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-bright hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:opacity-60 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          title={`Editar ${label}`}
          aria-label={`Editar ${label}`}
        >
          <Pencil size={14} strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-16 font-body text-sm text-on-surface bg-surface-high rounded px-1.5 py-1 tabular-nums text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleSave()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            handleCancel()
          }
        }}
        disabled={saving}
        aria-label={label}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex size-9 items-center justify-center rounded-lg text-accent transition-colors hover:bg-surface-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
        title="Guardar"
        aria-label="Guardar"
      >
        <Check size={18} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={handleCancel}
        disabled={saving}
        className="inline-flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-bright hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
        title="Cancelar"
        aria-label="Cancelar"
      >
        <X size={18} strokeWidth={1.5} />
      </button>
    </div>
  )
}
