import { useState } from 'react'
import { Input } from '@/components/ui/input'

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValueChange: (value: number) => void
}

const intFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** Formats a number the way it's shown while typing: "$ 1.000.000,5". */
function format(value: number): string {
  if (!value) return ''
  const [int, dec] = String(value).split('.')
  return `$ ${intFormatter.format(Number(int))}${dec ? `,${dec}` : ''}`
}

/** Turns raw typed text into a display string + number. Dots/spaces/"$" are
 * ignored; a comma starts the decimals (max 2). Keeps a trailing "," so the
 * user can keep typing decimals. */
function parse(raw: string): { text: string; value: number } {
  const cleaned = raw.replace(/[^\d,]/g, '')
  const [intPart, ...rest] = cleaned.split(',')
  const decimals = rest.join('').slice(0, 2)
  const hasComma = rest.length > 0
  if (!intPart && !hasComma) return { text: '', value: 0 }
  const intNum = Number(intPart || '0')
  const text = `$ ${intFormatter.format(intNum)}${hasComma ? `,${decimals}` : ''}`
  return { text, value: Number(`${intNum}${decimals ? `.${decimals}` : ''}`) }
}

/** Money input that shows thousands separators as you type ("$ 1.000.000"),
 * so 100 mil vs 1 millón is obvious at a glance. Emits a plain number. */
export function CurrencyInput({ value, onValueChange, ...props }: Props) {
  const [text, setText] = useState(() => format(value))
  const [lastValue, setLastValue] = useState(value)

  // Re-sync when the parent changes the value from outside (e.g. opening the
  // dialog for another product), but not for our own edits.
  if (value !== lastValue) {
    setLastValue(value)
    setText(format(value))
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      placeholder={props.placeholder ?? '$ 0'}
      value={text}
      onChange={(event) => {
        const parsed = parse(event.target.value)
        setText(parsed.text)
        setLastValue(parsed.value)
        onValueChange(parsed.value)
      }}
    />
  )
}
