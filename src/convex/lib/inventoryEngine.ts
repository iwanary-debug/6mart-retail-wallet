import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { issueStock, receiveStock } from "../../lib/costing";
import { roundToSen } from "../../lib/money";
import type { SessionUser } from "./guards";
import { BusinessRuleError, NotFoundError } from "./guards";

export type MovementType =
  | "PURCHASE"
  | "SALE"
  | "RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "DAMAGE"
  | "LOSS";

export interface StockChange {
  productId: Id<"products">;
  quantity: number;
  /** Dipakai untuk movement masuk. */
  unitCost?: number;
  type: MovementType;
  referenceType: string;
  referenceId: string;
  note?: string;
  user: SessionUser;
}

export interface StockChangeResult {
  productId: Id<"products">;
  stockBefore: number;
  stockAfter: number;
  averageCostBefore: number;
  averageCostAfter: number;
  /** HPP yangRecognition untuk movement keluar. */
  cogs: number;
  movementId: Id<"inventoryMovements">;
}

/**
 * Satu-satunya cara mengubah stok produk (blueprint §22, §23).
 *
 * - Movement masuk (PURCHASE / ADJUSTMENT_IN / RETURN): recompute weighted
 *   average cost.
 * - Movement keluar (SALE / ADJUSTMENT_OUT / DAMAGE / LOSS): HPP =
 *   qty x average cost saat itu, persediaan berkurang.
 * - Setiap perubahan SELALU menghasilkan inventoryMovements.
 * - Stok tidak boleh menjadi negatif.
 */
export async function changeStock(
  ctx: MutationCtx,
  change: StockChange,
): Promise<StockChangeResult> {
  const product = await ctx.db.get(change.productId);
  if (!product) throw new NotFoundError("Produk tidak ditemukan");

  if (!Number.isFinite(change.quantity) || change.quantity <= 0) {
    throw new BusinessRuleError("Quantity harus lebih besar dari 0");
  }

  const stockBefore = product.stock;
  const averageCostBefore = product.averageCost;

  const isInbound = ["PURCHASE", "ADJUSTMENT_IN", "RETURN"].includes(change.type);
  const now = Date.now();

  let stockAfter: number;
  let averageCostAfter: number;
  let cogs = 0;

  if (isInbound) {
    if (!product.trackInventory) {
      throw new BusinessRuleError(`Produk "${product.name}" tidak mendukung pelacakan stok`);
    }
    const unitCost = change.unitCost ?? product.purchasePrice;
    const next = receiveStock(
      { quantity: stockBefore, averageCost: averageCostBefore },
      change.quantity,
      unitCost,
    );
    stockAfter = next.quantity;
    averageCostAfter = next.averageCost;
  } else {
    if (product.trackInventory && change.quantity > stockBefore + 1e-9) {
      throw new BusinessRuleError(
        `Stok "${product.name}" tidak mencukupi. Tersedia ${stockBefore}, diminta ${change.quantity}`,
      );
    }
    const next = issueStock(
      { quantity: stockBefore, averageCost: averageCostBefore },
      change.quantity,
    );
    stockAfter = next.quantity;
    averageCostAfter = next.averageCost;
    cogs = next.cogs;
  }

  const movementId = await ctx.db.insert("inventoryMovements", {
    productId: change.productId,
    type: change.type,
    quantity: change.quantity,
    unitCostBefore: averageCostBefore,
    unitCostAfter: averageCostAfter,
    stockBefore,
    stockAfter,
    referenceType: change.referenceType,
    referenceId: change.referenceId,
    note: change.note,
    createdBy: change.user.id,
    createdAt: now,
  });

  await ctx.db.patch(change.productId, {
    stock: stockAfter,
    averageCost: averageCostAfter,
    ...(isInbound && change.unitCost !== undefined
      ? { purchasePrice: change.unitCost }
      : {}),
    updatedAt: now,
  });

  return {
    productId: change.productId,
    stockBefore,
    stockAfter,
    averageCostBefore,
    averageCostAfter,
    cogs: roundToSen(cogs),
    movementId,
  };
}

export type { Doc };
