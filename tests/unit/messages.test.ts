import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("message catalogues", () => {
  it("English and Arabic have exactly the same keys", () => {
    const e = new Set(keys(en));
    const a = new Set(keys(ar));
    expect([...e].filter((k) => !a.has(k)), "missing in ar").toEqual([]);
    expect([...a].filter((k) => !e.has(k)), "missing in en").toEqual([]);
  });

  it("every ICU placeholder in English exists in Arabic", () => {
    const flat = (o: Record<string, unknown>) =>
      Object.fromEntries(keys(o).map((k) => [k, k.split(".").reduce<unknown>((x, p) => (x as Record<string, unknown>)[p], o)]));
    const fe = flat(en) as Record<string, string>;
    const fa = flat(ar) as Record<string, string>;
    const args = (s: string) => new Set([...s.matchAll(/\{([a-z]\w*)(?=[,}])/g)].map((m) => m[1]));
    for (const k of Object.keys(fe)) {
      for (const arg of args(fe[k])) expect(args(fa[k]).has(arg), `${k} {${arg}}`).toBe(true);
    }
  });
});
