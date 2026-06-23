import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`w-full border-collapse ${className ?? ''}`} {...props}>
      {children}
    </table>
  )
}

export function TableHeader({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`border-b border-outline-variant/15 ${className ?? ''}`} {...props}>
      {children}
    </thead>
  )
}

export function TableBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className ?? ''} {...props}>
      {children}
    </tbody>
  )
}

export function TableRow({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`border-b border-outline-variant/10 transition-colors hover:bg-surface-bright/20 ${className ?? ''}`}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TableHead({ className, children, ...props }: ThHTMLAttributes<HTMLTableHeaderCellElement>) {
  return (
    <th
      className={`px-4 py-3 text-left font-body text-xs font-medium uppercase tracking-widest text-on-surface-variant ${className ?? ''}`}
      {...props}
    >
      {children}
    </th>
  )
}

export function TableCell({ className, children, ...props }: TdHTMLAttributes<HTMLTableDataCellElement>) {
  return (
    <td className={`px-4 py-3 font-body text-sm ${className ?? ''}`} {...props}>
      {children}
    </td>
  )
}
