/**
 * Stub `convex/react` untuk check render terautentikasi.
 *
 * Yang penting di sini bukan nilai yang dikembalikan, tapi PERILAKU
 * subscription-nya. Pada Convex sungguhan, satu call site `useQuery` punya
 * satu observer:
 *
 *   1. setiap render, args dibandingkan dengan args sebelumnya;
 *   2. kalau berbeda, subscription dipasang ulang — yang berarti satu
 *      putaran ke server;
 *   3. hasilnya tiba sebagai snapshot baru, memicu render lagi.
 *
 * Kalau args dihitung dari nilai yang berubah tiap render (mis.
 * `Date.now()`), langkah 1-3 berulang tanpa akhir dan React akhirnya
 * melempar "Too many re-renders". Stub ini meniru langkah-langkahnya,
 * termasuk jeda waktu nyata hasil putaran ke server.
 */

import {
  useRef,
  useSyncExternalStore,
  useCallback,
} from "react";

type Listener = () => void;

/** Batas agar call site yang benar-benar loop tidak menggantung runner. */
const MAX_DELIVERIES = 25;

export const stats = {
  renders: new Map<string, number>(),
  resubscribes: 0,
  byQuery: new Map<string, number>(),
};

function bumpRender(name: string) {
  stats.renders.set(name, (stats.renders.get(name) ?? 0) + 1);
}

/** Serialisasi args supaya perbandingan setara dengan milik Convex. */
function keyOf(args: unknown): string {
  if (args === "skip") return "skip";
  if (args === undefined) return "none";
  try {
    const keys = Object.keys(args as object).sort();
    return JSON.stringify(args, keys);
  } catch {
    return JSON.stringify(args) ?? "unserializable";
  }
}

/** Nama fungsi; datang dari stub `api`, bukan dari reference asli. */
function nameOf(reference: unknown): string {
  const named = (reference as { __qname?: unknown })?.__qname;
  if (typeof named === "string") return named;
  const legacy = (reference as { _exportName?: unknown })?._exportName;
  return typeof legacy === "string" ? legacy : "query";
}

/**
 * Satu observer per call site. `getSnapshot` mengembalikan "kotak" yang
 * identitasnya baru setiap hasil tiba — itulah yang memaksa React render
 * ulang, sama seperti snapshot baru dari server.
 */
class Observer {
  private listeners = new Set<Listener>();
  private cachedKey: string;
  private version = 0;
  private box: { value: unknown };
  private deliveries = 0;

  constructor(
    private readonly name: string,
    args: unknown,
    private readonly value: unknown,
  ) {
    this.cachedKey = keyOf(args);
    // Seperti Convex sungguhan, hasil query TIDAK tersedia pada render
    // pertama. Nilai sebenarnya tiba satu putaran kemudian. Tanpa ini,
    // halaman yang memakai hook setelah early return tidak akan pernah
    // mengalami perubahan jumlah hook, dan bug-nya lolos dari pemeriksaan.
    this.box = { value: undefined };
  }

  subscribe = (cb: Listener) => {
    this.listeners.add(cb);
    // Hasil pertama selalu datang setelah mount, tidak sinkron — inilah yang
    // membuat komponen render ulang dan menghitung ulang args-nya.
    this.schedule();
    return () => this.listeners.delete(cb);
  };

  getSnapshot = () => this.box;

  private schedule() {
    if (this.deliveries >= MAX_DELIVERIES) return;
    this.deliveries += 1;
    setTimeout(() => {
      this.version += 1;
      this.box = { value: this.value };
      for (const cb of this.listeners) cb();
    }, 0);
  }

  /** Dipanggil useQuery tiap render; di sinilah args dibandingkan. */
  sync(args: unknown) {
    const key = keyOf(args);
    if (key === this.cachedKey) return;
    this.cachedKey = key;
    stats.resubscribes += 1;
    stats.byQuery.set(this.name, (stats.byQuery.get(this.name) ?? 0) + 1);
    this.schedule();
  }
}

export function useQuery(reference: unknown, args?: unknown): unknown {
  const name = nameOf(reference);
  bumpRender(`useQuery:${name}`);

  const ref = useRef<Observer | null>(null);
  if (ref.current === null) ref.current = new Observer(name, args, values.get(name));
  const observer = ref.current;

  const subscribe = useCallback((cb: Listener) => observer.subscribe(cb), [observer]);
  const getSnapshot = useCallback(() => observer.getSnapshot(), [observer]);
  const box = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as {
    value: unknown;
  };

  observer.sync(args);
  return box.value;
}

const values = new Map<string, unknown>();

/** Nilai yang dikembalikan stub untuk sebuah query. */
export function setQueryValue(name: string, value: unknown) {
  values.set(name, value);
}

export function useMutation() {
  return useCallback(async () => {
    throw new Error("useMutation tidak tersedia di check render");
  }, []);
}

export function useAction() {
  return useMutation();
}

export function ConvexProvider({ children }: { children: unknown }) {
  return children as never;
}

export class ConvexReactClient {
  constructor(public url?: string) {}
}
