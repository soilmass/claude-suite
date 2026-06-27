# The four-state component (inviolable rule 4)

Every data-bound component renders all four. Happy-path-only is incomplete, not done.

```tsx
function ThingList() {
  const q = api.things.list.useQuery();

  if (q.isLoading) return <ThingListSkeleton />;          // 1. loading
  if (q.error)     return <ErrorState onRetry={q.refetch} message={q.error.message} />; // 2. error
  if (q.data.length === 0) return <EmptyState cta="Create your first thing" />;         // 3. empty
  return (                                                 // 4. success
    <ul>{q.data.map((t) => <ThingRow key={t.id} thing={t} />)}</ul>
  );
}
```

- **Loading:** a skeleton matching the success layout's shape, not a bare spinner, where
  the layout is known — avoids layout shift (helps CLS, rule-audit/perf budget).
- **Empty:** distinguish "no data yet" from "no results for this filter." The empty state
  usually wants a CTA; flag it if copy is missing.
- **Error:** show a recoverable action (retry) where possible; never a raw stack trace.
- **Success:** the actual content.

Interactive behavior inside any state (menus, dialogs, comboboxes) composes shadcn/Radix
primitives — never hand-built focus traps or keyboard handlers.
