import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  icon?: LucideIcon
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, icon: Icon, actions }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-900 via-amber-800 to-orange-700 px-7 py-5 shadow-md mb-6">
      <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
      <div className="absolute right-24 -bottom-6 w-24 h-24 rounded-full bg-white/5" />
      <div className="relative flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2.5 rounded-xl bg-white/10 border border-white/20">
              <Icon className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
            {subtitle && <p className="text-amber-200 text-sm mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  )
}
