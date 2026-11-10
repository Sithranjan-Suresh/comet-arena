/** Mutable world for route-contract tests: who is signed in and how the fake database answers. */
export const world = {
  user: null as { id: string; email: string } | null,
  isAdmin: false,
  /** Every query ends with this result; set error to simulate a database outage. */
  result: {
    data: null as unknown,
    error: null as null | { message: string; code?: string },
    count: 0 as number | null,
  },
};

export function reset() {
  world.user = null;
  world.isAdmin = false;
  world.result = { data: null, error: null, count: 0 };
}
export const signedIn = (admin = false) => {
  world.user = { id: "00000000-0000-4000-8000-0000000000a1", email: "student@utdallas.edu" };
  world.isAdmin = admin;
};
export const dbDown = () => {
  world.result = {
    data: null,
    error: { message: "SECRET connection string leaked", code: "XX000" },
    count: null,
  };
};

/** Chainable stand-in for a PostgREST query builder: any chain resolves to world.result. */
function builder(table?: string): unknown {
  const self: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        // users.is_admin lookups (admin guard) answer from the signed-in world.
        const r =
          table === "users" && !world.result.error
            ? { data: { is_admin: world.isAdmin }, error: null, count: 1 }
            : world.result;
        return (res: (v: unknown) => unknown) => Promise.resolve(r).then(res);
      }
      return (...args: unknown[]) => {
        void args;
        return self;
      };
    },
  });
  return self;
}

export const supabaseMock = {
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: world.user } }) },
    from: (t: string) => builder(t),
    rpc: () => builder(),
    storage: { from: () => builder() },
  }),
};

export const adminMock = {
  createSupabaseAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: () => builder(),
    storage: { from: () => builder() },
  }),
};

export const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
export const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
export const UUID = "00000000-0000-4000-8000-0000000000c1";
