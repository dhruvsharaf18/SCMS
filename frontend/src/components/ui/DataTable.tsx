import { useState, useMemo, type ReactNode } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface Column<T> {
  key: string
  header: string
  /** Custom cell renderer */
  render?: (row: T) => ReactNode
  /** Enable sorting for this column */
  sortable?: boolean
  /** Width class */
  width?: string
  /** Hide on mobile */
  hideOnMobile?: boolean
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  /** Unique key extractor */
  keyExtractor: (row: T) => string | number
  className?: string
  /** On row click */
  onRowClick?: (row: T) => void
  /** Empty state message */
  emptyMessage?: string
}

type SortDir = 'asc' | 'desc' | null

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  className,
  onRowClick,
  emptyMessage = 'No data to display',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'))
      if (sortDir === 'desc') setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data
    return [...data].sort((a, b) => {
      const av = (a as any)[sortKey]
      const bv = (b as any)[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={cn('overflow-x-auto rounded-2xl', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-light bg-odoo-grey text-ink">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-left font-bold text-ink px-4 py-3 whitespace-nowrap',
                  col.width,
                  col.hideOnMobile && 'hidden md:table-cell',
                  col.sortable && 'cursor-pointer select-none hover:text-ink',
                )}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <span className="text-ink">
                      {sortKey === col.key && sortDir === 'asc' ? (
                        <ArrowUp size={14} />
                      ) : sortKey === col.key && sortDir === 'desc' ? (
                        <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} />
                      )}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white text-ink">
          {sorted.map((row) => (
            <tr
              key={keyExtractor(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border-light/50 last:border-0 transition-colors',
                onRowClick && 'cursor-pointer hover:bg-grey-tint',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-text-primary',
                    col.hideOnMobile && 'hidden md:table-cell',
                  )}
                >
                  {col.render
                    ? col.render(row)
                    : ((row as any)[col.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
