import { describe, expect, test } from "bun:test";
import {
  MoneyError,
  assertRupiah,
  parseRupiah,
  roundToSen,
  formatRupiah,
  formatRupiahShort,
  formatNumber,
  sumRupiah,
  distributeRupiah,
  safeRatio,
} from "../src/lib/money";

describe("assertRupiah (blueprint §40)", () => {
  test("menerima bilangan bulat rupiah yang valid", () => {
    expect(() => assertRupiah(0)).not.toThrow();
    expect(() => assertRupiah(15_000)).not.toThrow();
    expect(() => assertRupiah(999_999_999_999)).not.toThrow();
  });

  test("menolak pecahan (float) untuk uang", () => {
    expect(() => assertRupiah(1500.5)).toThrow(MoneyError);
    expect(() => assertRupiah(0.1 + 0.2)).toThrow(/bilangan bulat/);
  });

  test("menolak nilai negatif, NaN, Infinity, dan non-number", () => {
    expect(() => assertRupiah(-1)).toThrow(/tidak boleh negatif/);
    expect(() => assertRupiah(Number.NaN)).toThrow(MoneyError);
    expect(() => assertRupiah(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => assertRupiah("15000" as unknown)).toThrow(/harus berupa angka/);
  });

  test("menolak nilai melebihi batas aman", () => {
    expect(() => assertRupiah(1_000_000_000_001)).toThrow(/maksimum/);
  });
});

describe("parseRupiah", () => {
  test("membuang pemisah ribuan dari input teks", () => {
    expect(parseRupiah("10.000")).toBe(10_000);
    expect(parseRupiah("Rp 25.500")).toBe(25_500);
    expect(parseRupiah("15000")).toBe(15_000);
  });

  test("membulatkan input number", () => {
    expect(parseRupiah(1500.4)).toBe(1500);
    expect(parseRupiah(1500.6)).toBe(1501);
  });

  test("menolak input kosong", () => {
    expect(() => parseRupiah("")).toThrow(MoneyError);
    expect(() => parseRupiah("abc")).toThrow(MoneyError);
  });
});

describe("roundToSen", () => {
  test("membulatkan ke sen terdekat tanpa akumulasi error float", () => {
    expect(roundToSen(1000.005)).toBe(1000.01);
    expect(roundToSen(0.1 + 0.2)).toBe(0.3);
    expect(roundToSen(1234.567)).toBe(1234.57);
  });
});

describe("formatRupiah", () => {
  test("memformat dengan pemisah ribuan gaya Indonesia", () => {
    expect(formatRupiah(15_000)).toBe("Rp15.000");
    expect(formatRupiah(1_500_000)).toBe("Rp1.500.000");
    expect(formatRupiah(-2_500)).toBe("-Rp2.500");
    expect(formatRupiah(15_000, false)).toBe("15.000");
  });

  test("formatRupiahShort meringkas untuk kartu statistik", () => {
    expect(formatRupiahShort(1_500_000)).toBe("Rp1,5 jt");
    expect(formatRupiahShort(2_000_000_000)).toBe("Rp2,0 M");
    expect(formatRupiahShort(15_000)).toBe("Rp15 rb");
    expect(formatRupiahShort(500)).toBe("Rp500");
  });
});

describe("formatNumber", () => {
  test("memformat qty/berat dengan desimal sesuai kebutuhan", () => {
    expect(formatNumber(2.5, 1)).toBe("2,5");
    expect(formatNumber(12, 0)).toBe("12");
  });
});

describe("sumRupiah", () => {
  test("menjumlahkan tanpa kehilangan presisi", () => {
    expect(sumRupiah([100, 250, 650])).toBe(1000);
    expect(sumRupiah([0.1 * 3].map((v) => Math.round(v)))).toBe(0);
    expect(sumRupiah([])).toBe(0);
  });
});

describe("distributeRupiah", () => {
  test("membagi tanpa sisa; sisa dialokasikan ke elemen awal", () => {
    expect(distributeRupiah(1000, 3)).toEqual([334, 333, 333]);
  });

  test("total hasil bagi selalu sama dengan total", () => {
    const parts = distributeRupiah(100_003, 7);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_003);
    expect(parts.length).toBe(7);
  });

  test("mengembalikan array kosong untuk parts <= 0", () => {
    expect(distributeRupiah(1000, 0)).toEqual([]);
    expect(distributeRupiah(1000, -3)).toEqual([]);
  });
});

describe("safeRatio", () => {
  test("mengembalikan 0 untuk pembagi nol, bukan NaN/Infinity", () => {
    expect(safeRatio(100, 0)).toBe(0);
  });

  test("menghitung rasio normal", () => {
    expect(safeRatio(10, 4)).toBe(2.5);
  });
});
