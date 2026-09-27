import { describe, expect, test } from "bun:test";
import {
  inventoryValue,
  issueStock,
  receiveStock,
  roundQuantity,
} from "../src/lib/costing";

describe("receiveStock — rata-rata tertimbang (blueprint §23)", () => {
  test("stok awal nol memakai harga beli sebagai average cost", () => {
    const r = receiveStock({ quantity: 0, averageCost: 0 }, 10, 12_000);
    expect(r.quantity).toBe(10);
    expect(r.averageCost).toBe(12_000);
    expect(r.totalValue).toBe(120_000);
  });

  test("pembelian kedua menaikkan rata-rata secara tertimbang", () => {
    // 10 x 12.000 = 120.000 ; 10 x 15.000 = 150.000 ; total 270.000 / 20 = 13.500
    const r = receiveStock({ quantity: 10, averageCost: 12_000 }, 10, 15_000);
    expect(r.quantity).toBe(20);
    expect(r.averageCost).toBe(13_500);
    expect(r.totalValue).toBe(270_000);
  });

  test("pembelian besar menggeser rata-rata mendekati harga baru", () => {
    // 1 x 10.000 + 99 x 20.000 = 1.990.000 / 100 = 19.900
    const r = receiveStock({ quantity: 1, averageCost: 10_000 }, 99, 20_000);
    expect(r.averageCost).toBe(19_900);
  });

  test("harga jual tidak boleh negatif", () => {
    expect(() => receiveStock({ quantity: 5, averageCost: 1000 }, 5, -1)).toThrow(/negatif/);
  });

  test("quantity masuk harus lebih dari 0", () => {
    expect(() => receiveStock({ quantity: 5, averageCost: 1000 }, 0, 1000)).toThrow(
      /lebih dari 0/,
    );
  });

  test("average cost dibulatkan ke sen terdekat", () => {
    // 3 x 1000 = 3000 ; 7 x 1050 = 7350 ; total 10350 / 10 = 1035 (tepat)
    const r = receiveStock({ quantity: 3, averageCost: 1000 }, 7, 1050);
    expect(r.averageCost).toBe(1035);
  });

  test("pembagian tidak menghasilkan NaN saat stok awal nol", () => {
    const r = receiveStock({ quantity: 0, averageCost: 0 }, 1, 0);
    expect(Number.isNaN(r.averageCost)).toBe(false);
    expect(r.averageCost).toBe(0);
  });
});

describe("issueStock — HPP saat barang keluar (blueprint §23)", () => {
  test("HPP = qty keluar x average cost saat itu", () => {
    const r = issueStock({ quantity: 20, averageCost: 13_500 }, 5);
    expect(r.quantity).toBe(15);
    expect(r.averageCost).toBe(13_500);
    expect(r.cogs).toBe(67_500);
  });

  test("average cost tidak berubah saat stok keluar", () => {
    const r = issueStock({ quantity: 100, averageCost: 9_999 }, 40);
    expect(r.averageCost).toBe(9_999);
    expect(r.quantity).toBe(60);
  });

  test("stok tidak boleh keluar melebihi stok tersedia", () => {
    expect(() => issueStock({ quantity: 5, averageCost: 1000 }, 6)).toThrow(/tidak mencukupi/);
  });

  test("stok boleh keluar sampai nol", () => {
    const r = issueStock({ quantity: 5, averageCost: 1000 }, 5);
    expect(r.quantity).toBe(0);
    expect(r.cogs).toBe(5000);
  });

  test("quantity keluar harus lebih dari 0", () => {
    expect(() => issueStock({ quantity: 5, averageCost: 1000 }, 0)).toThrow(/lebih dari 0/);
  });
});

describe("inventoryValue", () => {
  test("nilai persediaan = qty x average cost", () => {
    expect(inventoryValue({ quantity: 20, averageCost: 13_500 })).toBe(270_000);
  });

  test("stok kosong bernilai nol", () => {
    expect(inventoryValue({ quantity: 0, averageCost: 12_000 })).toBe(0);
  });
});

describe("siklus terima -> keluar mempertahankan nilai", () => {
  test("nilai persediaan berkurang tepat sebesar HPP", () => {
    const start = receiveStock({ quantity: 0, averageCost: 0 }, 20, 10_000);
    expect(start.totalValue).toBe(200_000);

    const out = issueStock({ quantity: start.quantity, averageCost: start.averageCost }, 8);
    const remaining = start.totalValue - out.cogs;

    expect(out.cogs).toBe(80_000);
    expect(remaining).toBe(120_000);
    expect(inventoryValue({ quantity: out.quantity, averageCost: out.averageCost })).toBe(
      120_000,
    );
  });
});

describe("roundQuantity", () => {
  test("membulatkan kuantitas ke 3 desimal (barang timbang)", () => {
    expect(roundQuantity(1.23456)).toBe(1.235);
    expect(roundQuantity(10)).toBe(10);
  });
});
