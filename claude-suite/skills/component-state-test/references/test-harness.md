Purpose: Vitest + jsdom + Testing Library setup, the QueryClientProvider wrapper with retries off, mocking the tRPC/React Query hook, and stubbing Clerk auth — the shared rig the four state tests run on.

# Test harness for component-state tests

Stand this up once per project. The state tests in `rtl-state-tests.md` import
`renderWithProviders` and `mockQuery` from here.

## Vitest config (jsdom)

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(() => cleanup());
```

Note: these tests run in jsdom and target CLIENT components. Edge-runtime concerns
(`edge-runtime-constraints`) do not apply in the test process; you are testing render logic,
not the deployment target.

## Retries OFF — this is what makes the error state reachable

React Query's default retry means a rejected query is retried before it ever sets `isError`,
so an error test will hang or time out. Disable retries in the test QueryClient:

```tsx
// test-utils.tsx
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

function makeTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(ui: ReactElement) {
  const client = makeTestClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
```

## Mocking the tRPC hook by faking status

The deterministic approach: mock the `~/trpc/react` module so each `useQuery()` returns a
status object you control. Faking status (not intercepting `fetch`) is what lets you force
loading, empty, error, and success cleanly.

```tsx
// test-utils.tsx (continued)
import { vi } from "vitest";

type QueryState<T> =
  | { isPending: true; isError?: false; data?: undefined; error?: undefined }
  | { isPending?: false; isError: true; error: Error; data?: undefined }
  | { isPending: false; isError?: false; data: T; error?: undefined };

// One controllable registry keyed by "router.procedure".
const states = new Map<string, QueryState<unknown>>();

export function mockQuery<T>(path: string, state: QueryState<T>) {
  states.set(path, state as QueryState<unknown>);
}

vi.mock("~/trpc/react", () => {
  const make = (path: string) => ({
    useQuery: () => states.get(path) ?? { isPending: true },
  });
  return {
    api: {
      invoice: { list: make("invoice.list") },
      // add procedures the component under test calls
    },
  };
});
```

The `QueryState<T>` union keeps the mock typed (Rule 1): a success mock requires `data: T`,
an error mock requires `error: Error`. There is no `any` and no place to pass a malformed shape.

For components that call mutations, extend the mock with
`useMutation: () => ({ mutate: vi.fn(), isPending: false })` and assert the handler is wired,
but state-render coverage is about the queries.

## Stubbing Clerk auth

If the component reads Clerk hooks, stub them so the component mounts without a real session:

```tsx
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "user_test_123" }),
  useUser: () => ({ isLoaded: true, user: { id: "user_test_123", fullName: "Test User" } }),
}));
```

Ownership (Rule 2) is enforced server-side in the tRPC procedure, not in the component — these
tests do not assert ownership. They assert the four renders. Procedure-level ownership is
covered by `trpc-middleware` tests and `security-pass`.

## Reachable loading vs. settled success

A loading test must assert BEFORE the query resolves. With the status-mock approach above the
state is fixed (it returns `isPending: true` and never settles), so a synchronous
`getByRole("status")` is correct. If you instead use a real client with a deferred promise,
assert loading synchronously, then `await` the resolution and assert success — never assert
loading after an `await`, or the data will have raced past it.
