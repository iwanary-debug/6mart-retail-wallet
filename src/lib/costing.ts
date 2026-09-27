/**
 * Perhitungan HPP (Cost of Goods Sold) 6Mart.
 *
 * BLUEPRINT §23: V1.0 memakai WEIGHTED AVERAGE COST.
 *
 * Stok masuk  -> average cost berubah ( tertimbang)
 * Stok keluar -> HPP = qty keluar x average cost saat keluar
 *
 * Semua nilai rupiah dibulatkan ke sen terdekat agar pembulatan tidak
 * menumpuk. Nilai yang disimpan ke database untuk `stock`
 * adalah integer, `averageCost` boleh 2 desimal.
 */

import { roundToSen, safeRatio } from "./money";

export interface WeightedAverageState {
  quantity: number;
  averageCost: number;
}

/**
 * Stok masuk (pembelian / adjustment in / return).
 * averageCostBaru = (nilaiLama + nilaiBaru) / qtyBaru
 */
export function receiveStock(
  current: WeightedAverageState,
  incomingQuantity: number,
  incomingUnitCost: number,
): WeightedAverageState & { totalValue: number } {
  if (incomingQuantity <= 0) {
    throw new Error("Quantity stok masuk harus lebih dari 0");
  }
  if (incomingUnitCost < 0) {
    throw new Error("Harga satuan tidak boleh negatif");
  }

  const currentValue = roundToSen(current.quantity * current.averageCost);
  const incomingValue = roundToSen(incomingQuantity * incomingUnitCost);
  const newQuantity = roundQuantity(current.quantity + incomingQuantity);
  const newTotalValue = roundToSen(currentValue + incomingValue);
  const newAverageCost = roundToSen(safeRatio(newTotalValue, newQuantity));

  return {
    quantity: newQuantity,
    averageCost: newAverageCost,
    totalValue: newTotalValue,
  };
}

/**
 * Stok keluar (penjualan / adjustment out / damage / loss).
 * Mengembalikan HPP dari stok yang exiting.
 */
export function issueStock(
  current: WeightedAverageState,
  outgoingQuantity: number,
): { quantity: number; averageCost: number; cogs: number } {
  if (outgoingQuantity <= 0) {
    throw new Error("Quantity stok keluar harus lebih dari 0");
  }
  if (outgoingQuantity > current.quantity + 1e-9) {
    throw new Error(
      `Stok tidak mencukupi. Tersedia ${current.quantity}, diminta ${outgoingQuantity}`,
    );
  }
  const cogs = roundToSen(outgoingQuantity * current.averageCost);
  return {
    quantity: roundQuantity(current.quantity - outgoingQuantity),
    averageCost: current.averageCost,
    cogs,
  };
}

/** Nilai persediaan saat ini (inventory value). */
export function inventoryValue(state: WeightedAverageState): number {
  return roundToSen(state.quantity * state.averageCost);
}

function roundQuantity(qty: number): number {
  // Kuantitas dibulatkan 3 desimal untuk accommodate barang timbang (kg).
  return Math.round(qty * 1000) / 1000;
}

export { roundQuantity };
