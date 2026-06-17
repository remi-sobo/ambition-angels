// Minimal chainable Supabase mock for unit-testing route/helper logic without a
// database. Every builder method returns the same chainable object; terminal
// awaits (.single(), .maybeSingle(), or awaiting the builder itself) resolve to
// the next queued result, in call order. Selected method args are recorded for
// assertions.

export type QueuedResult = { data?: unknown; error?: unknown; count?: number };

export function mockSupabase(results: QueuedResult[]) {
  let i = 0;
  const next = (): QueuedResult => results[i++] ?? { data: null };
  const calls = {
    from: [] as string[],
    or: [] as string[],
    eq: [] as [unknown, unknown][],
    contains: [] as [unknown, unknown][],
    insert: [] as unknown[],
    update: [] as unknown[],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    from: (t: string) => (calls.from.push(t), builder),
    select: () => builder,
    or: (s: string) => (calls.or.push(s), builder),
    eq: (a: unknown, b: unknown) => (calls.eq.push([a, b]), builder),
    contains: (a: unknown, b: unknown) => (calls.contains.push([a, b]), builder),
    gte: () => builder,
    limit: () => builder,
    order: () => builder,
    insert: (o: unknown) => (calls.insert.push(o), builder),
    update: (o: unknown) => (calls.update.push(o), builder),
    single: () => Promise.resolve(next()),
    maybeSingle: () => Promise.resolve(next()),
    // Makes the builder itself awaitable (chains that end at .limit()/.eq()).
    then: (resolve: (v: QueuedResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject),
  };
  return { client: builder, calls };
}
