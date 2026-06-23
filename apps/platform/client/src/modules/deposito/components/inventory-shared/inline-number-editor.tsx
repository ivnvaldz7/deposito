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

  if (!editing) {
    return (
      <div className="inline-flex items-center gap-1 group">
        <span className="font-body text-on-surface tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => { setDraft(String(value)); setEditing(true) }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-on-surface"
          title={`Editar ${label}`}
          aria-label={`Editar ${label}`}
        >
          <Pencil size={12} strokeWidth={1.5} />
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
        className="w-16 font-body text-sm text-on-surface bg-surface-high rounded px-1.5 py-0.5 tabular-nums text-center"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setSaving(true)
            onSave(Number(draft)).finally(() => setSaving(false))
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        disabled={saving}
        aria-label={label}
      />
      <button
        type="button"
        onClick={() => {
          setSaving(true)
          onSave(Number(draft)).finally(() => setSaving(false))
        }}
        disabled={saving}
        className="text-accent hover:text-accent/80 transition-colors disabled:opacity-40"
        title="Guardar"
        aria-label="Guardar"
      >
        <Check size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
        title="Cancelar"
        aria-label="Cancelar"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  )
}
