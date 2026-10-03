import { useLocation } from 'react-router-dom'

/**
 * Generic placeholder page — renders the route name.
 * Will be replaced with actual page content in later prompts.
 */
export function PlaceholderPage({ title }: { title?: string }) {
  const location = useLocation()
  const displayTitle = title ?? location.pathname

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
        <span className="text-2xl">🚧</span>
      </div>
      <h1 className="text-xl font-bold text-text-primary mb-2">{displayTitle}</h1>
      <p className="text-sm text-text-secondary max-w-sm">
        This page is a placeholder. Content will be built in upcoming prompts.
      </p>
    </div>
  )
}
