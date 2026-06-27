"use client";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";

// Data-bound component rendering ALL FOUR states (Rule 4). Styling via tokens only (Rule 3).
export function ProjectList() {
  const query = api.project.list.useQuery();

  if (query.isLoading) {
    return (
      <ul className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </ul>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-md border border-destructive p-4 text-destructive">
        <p>Couldn’t load your projects.</p>
        <Button variant="outline" className="mt-2" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const projects = query.data ?? [];
  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
        <p>You don’t have any projects yet.</p>
        <Button className="mt-3">Create your first project</Button>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {projects.map((p) => (
        <li key={p.id} className="flex items-center justify-between rounded-md border p-3">
          <span className="font-medium">{p.name}</span>
          <time className="text-sm text-muted-foreground" dateTime={p.createdAt.toISOString()}>
            {p.createdAt.toLocaleDateString()}
          </time>
        </li>
      ))}
    </ul>
  );
}
