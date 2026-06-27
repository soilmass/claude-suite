Purpose: the four-test-per-component template — forcing each query status, accessible-query assertions, the empty-vs-error distinction, and typing fixtures from tRPC/Drizzle inference (Rule 4 + Rule 1).

# RTL four-state test template

The contract: every data-bound component gets one test per state. Drive the state by faking
the data hook's return, assert on user-visible output, and keep fixtures typed from inference.

## The component under test (shape)

A typical client component reads a tRPC query and branches on status:

```tsx
"use client";
import { api } from "~/trpc/react";

export function InvoiceList() {
  const q = api.invoice.list.useQuery();
  if (q.isPending) return <ul role="status" aria-label="Loading invoices" />;     // loading
  if (q.isError) return <p role="alert">Couldn’t load invoices.</p>;              // error
  if (q.data.length === 0) return <p>No invoices yet. <NewInvoiceButton /></p>;   // empty
  return (
    <ul>
      {q.data.map((inv) => (
        <li key={inv.id}>{inv.number} — {formatCents(inv.amountCents)}</li>      // success
      ))}
    </ul>
  );
}
```

Four branches → four tests. If a branch is missing, that is a Rule 4 gap to fix in
`vertical-slice`, not to skip here.

## Typing fixtures from inference (Rule 1)

Never hand-write a loose object or `as any`. Derive the row type from the procedure's inferred
output (preferred — it is exactly what the component receives) or from Drizzle `$inferSelect`:

```ts
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";

type InvoiceRow = inferProcedureOutput<AppRouter["invoice"]["list"]>[number];

const invoiceFixture = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: "0190a9d2-...-uuidv7",
  number: "INV-001",
  amountCents: 1299,            // integer minor units (Rule 5), never 12.99
  createdAt: new Date("2026-01-01T00:00:00Z"), // timestamptz/UTC (Rule 6)
  ...over,
});
```

A schema rename (`number → ref`) now fails this file at compile time — the whole point.

## The four tests

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, mockQuery } from "./test-utils"; // see test-harness.md
import { InvoiceList } from "./invoice-list";

describe("InvoiceList — all four states (Rule 4)", () => {
  it("renders LOADING before the query settles", () => {
    mockQuery("invoice.list", { isPending: true });
    renderWithProviders(<InvoiceList />);
    // assert synchronously — the skeleton must be present before resolution
    expect(screen.getByRole("status", { name: /loading invoices/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders EMPTY (zero rows) with the CTA, distinct from error", async () => {
    mockQuery("invoice.list", { data: [], isPending: false });
    renderWithProviders(<InvoiceList />);
    expect(await screen.findByText(/no invoices yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new invoice/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();        // NOT the error render
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("renders ERROR, distinct from empty", async () => {
    mockQuery("invoice.list", { isError: true, error: new Error("boom") });
    renderWithProviders(<InvoiceList />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t load/i);
    expect(screen.queryByText(/no invoices yet/i)).toBeNull(); // NOT the empty render
  });

  it("renders SUCCESS with the rows", async () => {
    mockQuery("invoice.list", {
      data: [invoiceFixture({ number: "INV-001" }), invoiceFixture({ id: "b", number: "INV-002" })],
      isPending: false,
    });
    renderWithProviders(<InvoiceList />);
    expect(await screen.findByText(/INV-001/)).toBeInTheDocument();
    expect(screen.getByText(/INV-002/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
```

## The empty-vs-error rule

The single most common Rule 4 regression is empty and error rendering identically. Each of the
two tests above asserts the OTHER state's marker is absent (`queryByRole("alert")` is null in
empty; the empty CTA text is null in error). That cross-assertion is what catches a collapsed
error boundary reading as "empty."

## Query selection priority

Assert on what the user perceives, in this order: `getByRole` (with `name`), `getByLabelText`,
`getByText`. Reach for `getByTestId` only when nothing visible/semantic identifies the node.
Use `findBy*` (async) for anything that appears after a tick; `queryBy*` (returns null) only for
absence assertions. Never assert on class names — Rule 3 tokens can change without the render
changing meaning.

## Multiple queries in one component

When a component reads two queries, mock each independently and test the combined state matrix
that matters: e.g. user-loaded + tasks-pending → loading region for tasks but header present;
user-loaded + tasks-empty → empty-tasks CTA with header present. You do not need the full
Cartesian product — cover the combinations the component actually branches on.
