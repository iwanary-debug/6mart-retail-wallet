import { useCallback, useMemo, useState } from "react";

const DAY_MS = 86_400_000;

export interface DateRange {
  from: number;
  to: number;
}

/**
 * Rentang tanggal untuk argumen query Convex.
 *
 * JANGAN menulis `Date.now()` langsung di dalam args query. Nilai itu
 * berbeda pada setiap render, sehingga Convex melihat args baru, memasang
 * ulang subscription, memicu render lagi, dan seterusnya — React akhirnya
 * menghentikan render dengan "Too many re-renders".
 *
 * Hook ini mengikat `now` ke satu nilai tetap per mount, jadi args-nya
 * stabil. Panggil `refresh()` ketika pengguna menekan tombol segarkan atau
 * setelah periode perlu digeser.
 */
export function useDateRange(days = 30): DateRange & { refresh: () => void } {
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => setNow(Date.now()), []);
  const range = useMemo<DateRange>(
    () => ({ from: now - days * DAY_MS, to: now }),
    [now, days],
  );

  return { ...range, refresh };
}
