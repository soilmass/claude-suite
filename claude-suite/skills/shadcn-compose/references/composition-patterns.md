Purpose: copy-correct composition skeletons for the common shadcn primitives, with controlled-state and four-state wiring.

# Composition patterns

All imports come from `@/components/ui/*` (added via the CLI). Styling shown is token-based
only (Rule 3); real variant/spacing decisions belong to `tailwind-v4-component-style`.

## Alert-dialog: destructive confirm, parent-controlled, pending state

Use when the dialog must close on a tRPC mutation success and disable its action while pending
(Rule 4 — the action's loading state).

```tsx
"use client";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

export function DeleteProject({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const del = api.project.delete.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this project?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. All tasks in the project are removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {del.isError && (
          <p role="alert" className="text-destructive text-sm">
            Couldn’t delete. Try again.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={del.isPending}
            onClick={(e) => {
              e.preventDefault(); // keep open until the mutation resolves
              del.mutate({ id: projectId });
            }}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Key points: `asChild` keeps semantics on a real `<button>`; `AlertDialogTitle` is required for
the labelling contract; `e.preventDefault()` stops the default auto-close so the pending state
is visible.

## Dialog with a form: controlled open, close on success

```tsx
const [open, setOpen] = useState(false);
const create = api.thing.create.useMutation({ onSuccess: () => setOpen(false) });

<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><Button>New</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>New thing</DialogTitle>
      <DialogDescription>…</DialogDescription>
    </DialogHeader>
    {/* RHF form from vertical-slice goes here; submit calls create.mutate(values) */}
  </DialogContent>
</Dialog>
```

If the dialog has only a visual title image/icon, wrap a `DialogTitle` in shadcn's
`VisuallyHidden` rather than omitting it — omission breaks screen-reader labelling.

## Dropdown menu

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" aria-label="Open actions">
      <MoreHorizontal className="size-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={() => …}>Edit</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={() => …} className="text-destructive">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

The icon-only trigger needs an `aria-label`. Roving focus, typeahead, and arrow navigation are
provided by Radix — do not add `onKeyDown`.

## Combobox (popover + command), data-driven, four states (Rule 4)

```tsx
"use client";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { useState } from "react";

export function CustomerCombobox({ onSelect }: { onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // server-side filter — never fetch-all-then-filter-in-a-loop (Rule 7)
  const { data, isLoading, isError } = api.customer.search.useQuery({ q });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}>
          Select customer…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search customers…" />
          <CommandList>
            {isLoading && <div className="text-muted-foreground p-2 text-sm">Loading…</div>}
            {isError && <div role="alert" className="text-destructive p-2 text-sm">Search failed.</div>}
            {!isLoading && !isError && <CommandEmpty>No customers found.</CommandEmpty>}
            {data && (
              <CommandGroup>
                {data.map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={(id) => { onSelect(id); setOpen(false); }}>
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

`shouldFilter={false}` hands filtering to the server query (`q` is Zod-parsed in the procedure,
Rule 8). The four states are loading / error / empty (`CommandEmpty`) / results. `cmdk`
supplies `aria-activedescendant` and arrow navigation.

## Sheet (side panel)

Same contract as `dialog`; pass `side="right"`. `SheetTitle` is still required.

```tsx
<Sheet>
  <SheetTrigger asChild><Button variant="outline">Filters</Button></SheetTrigger>
  <SheetContent side="right">
    <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
    {/* … */}
  </SheetContent>
</Sheet>
```

## Controlled vs. uncontrolled

- Default to **uncontrolled** (`defaultOpen`) — Radix manages it.
- Lift to **controlled** (`open` + `onOpenChange`) only when the parent must drive open/close
  (close on mutation success, open from a row action elsewhere). Don't mix both.
