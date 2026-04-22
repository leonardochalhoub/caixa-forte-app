import { ArrowDown, ArrowUp } from "lucide-react"

type Category = {
  id: string
  name: string
  parent_id: string | null
  is_income: boolean
  sort_order: number
  archived_at: string | null
}

export function CategoriesTree({ categories }: { categories: Category[] }) {
  const parents = categories
    .filter((c) => !c.parent_id && !c.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order)
  const childrenByParent = new Map<string, Category[]>()
  for (const c of categories) {
    if (c.parent_id && !c.archived_at) {
      const list = childrenByParent.get(c.parent_id) ?? []
      list.push(c)
      childrenByParent.set(c.parent_id, list)
    }
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {parents.map((parent) => {
        const children = (childrenByParent.get(parent.id) ?? []).sort(
          (a, b) => a.sort_order - b.sort_order,
        )
        return (
          <li key={parent.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              {parent.is_income ? (
                <ArrowUp className="h-4 w-4 text-income" aria-hidden />
              ) : (
                <ArrowDown className="h-4 w-4 text-expense" aria-hidden />
              )}
              <span className="text-sm font-medium text-strong">{parent.name}</span>
            </div>
            {children.length > 0 && (
              <ul className="mt-2 space-y-1 pl-6 text-sm text-body">
                {children.map((child) => (
                  <li key={child.id}>· {child.name}</li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
