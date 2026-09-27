/**
 * Aturan akuntansi 6Mart (blueprint §16, §18, §19, §28, §30, §31, §62).
 *
 * PRINSIP KHUSUS 6MART:
 *  - TOP UP BUKAN REVENUE. Top up adalah pertukaran aset (Bank) dengan
 *    kewajiban (Student Wallet Liability).
 *  - PURCHASE ADALAH REVENUE. Pembelian dengan wallet recognition
 *    pendapatan + HPP.
 *  - Student Wallet selalu LIABILITY, bukan pendapatan.
 *
 * Modul ini murni (tanpa database) sehingga dapat diuji secara unit.
 */

import { roundToSen } from "./money";

export const COA = {
  CASH: "1000",
  BANK: "1010",
  INVENTORY: "1100",
  STUDENT_WALLET_LIABILITY: "2000",
  SUPPLIER_PAYABLE: "2100",
  OWNER_EQUITY: "3000",
  RETAIL_SALES: "4000",
  LAUNDRY_REVENUE: "4010",
  BARBERSHOP_REVENUE: "4020",
  JASTIP_REVENUE: "4030",
  PPOB_REVENUE: "4040",
  RETAIL_COGS: "5000",
  LAUNDRY_COGS: "5010",
  JASTIP_COGS: "5020",
  SALARY_EXPENSE: "6000",
  ELECTRICITY_EXPENSE: "6010",
  INTERNET_EXPENSE: "6020",
  RENT_EXPENSE: "6030",
  SUPPLIES_EXPENSE: "6040",
  MAINTENANCE_EXPENSE: "6050",
  OTHER_EXPENSE: "6060",
} as const;

export type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "COGS"
  | "EXPENSE";

export interface AccountDefinition {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: "DEBIT" | "CREDIT";
}

export const CHART_OF_ACCOUNTS: AccountDefinition[] = [
  { code: COA.CASH, name: "Kas", type: "ASSET", normalBalance: "DEBIT" },
  { code: COA.BANK, name: "Bank", type: "ASSET", normalBalance: "DEBIT" },
  { code: COA.INVENTORY, name: "Persediaan", type: "ASSET", normalBalance: "DEBIT" },
  {
    code: COA.STUDENT_WALLET_LIABILITY,
    name: "Kewajiban Wallet Santri",
    type: "LIABILITY",
    normalBalance: "CREDIT",
  },
  {
    code: COA.SUPPLIER_PAYABLE,
    name: "Hutang Supplier",
    type: "LIABILITY",
    normalBalance: "CREDIT",
  },
  { code: COA.OWNER_EQUITY, name: "Modal Pemilik", type: "EQUITY", normalBalance: "CREDIT" },
  { code: COA.RETAIL_SALES, name: "Pendapatan Retail", type: "REVENUE", normalBalance: "CREDIT" },
  { code: COA.LAUNDRY_REVENUE, name: "Pendapatan Laundry", type: "REVENUE", normalBalance: "CREDIT" },
  {
    code: COA.BARBERSHOP_REVENUE,
    name: "Pendapatan Barbershop",
    type: "REVENUE",
    normalBalance: "CREDIT",
  },
  { code: COA.JASTIP_REVENUE, name: "Pendapatan Jastip", type: "REVENUE", normalBalance: "CREDIT" },
  { code: COA.PPOB_REVENUE, name: "Pendapatan PPOB", type: "REVENUE", normalBalance: "CREDIT" },
  { code: COA.RETAIL_COGS, name: "HPP Retail", type: "COGS", normalBalance: "DEBIT" },
  { code: COA.LAUNDRY_COGS, name: "HPP Laundry", type: "COGS", normalBalance: "DEBIT" },
  { code: COA.JASTIP_COGS, name: "HPP Jastip", type: "COGS", normalBalance: "DEBIT" },
  { code: COA.SALARY_EXPENSE, name: "Beban Gaji", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: COA.ELECTRICITY_EXPENSE, name: "Beban Listrik", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: COA.INTERNET_EXPENSE, name: "Beban Internet", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: COA.RENT_EXPENSE, name: "Beban Sewa", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: COA.SUPPLIES_EXPENSE, name: "Beban Perlengkapan", type: "EXPENSE", normalBalance: "DEBIT" },
  {
    code: COA.MAINTENANCE_EXPENSE,
    name: "Beban Pemeliharaan",
    type: "EXPENSE",
    normalBalance: "DEBIT",
  },
  { code: COA.OTHER_EXPENSE, name: "Beban Lain-lain", type: "EXPENSE", normalBalance: "DEBIT" },
];

export function accountByCode(code: string): AccountDefinition | undefined {
  return CHART_OF_ACCOUNTS.find((a) => a.code === code);
}

export function accountName(code: string): string {
  return accountByCode(code)?.name ?? code;
}

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  memo?: string;
}

export interface JournalLine extends Required<Omit<JournalLineInput, "memo">> {
  memo?: string;
}

export class UnbalancedJournalError extends Error {
  constructor(
    public totalDebit: number,
    public totalCredit: number,
  ) {
    super(
      `Jurnal tidak balance: Debit ${totalDebit} vs Credit ${totalCredit} (selisih ${roundToSen(totalDebit - totalCredit)})`,
    );
    this.name = "UnbalancedJournalError";
  }
}

/**
 * Membangun baris jurnal dari input mentah, memvalidasi:
 *  - setiap baris hanya boleh debit ATAU credit (tidak keduanya)
 *  - nominal harus non-negatif
 *  - total debit WAJIB sama dengan total credit
 */
export function buildJournalLines(lines: JournalLineInput[]): JournalLine[] {
  if (lines.length < 2) {
    throw new Error("Jurnal minimal memiliki 2 baris");
  }

  const built: JournalLine[] = lines.map((line, index) => {
    const debit = roundToSen(line.debit ?? 0);
    const credit = roundToSen(line.credit ?? 0);
    if (debit < 0 || credit < 0) {
      throw new Error(`Baris jurnal ${index + 1} tidak boleh memiliki nominal negatif`);
    }
    if (debit > 0 && credit > 0) {
      throw new Error(`Baris jurnal ${index + 1} tidak boleh punya debit dan credit sekaligus`);
    }
    if (debit === 0 && credit === 0) {
      throw new Error(`Baris jurnal ${index + 1} memiliki nominal nol`);
    }
    if (!accountByCode(line.accountCode)) {
      throw new Error(`Akun tidak dikenal: ${line.accountCode}`);
    }
    return { accountCode: line.accountCode, debit, credit, memo: line.memo };
  });

  const totalDebit = roundToSen(built.reduce((s, l) => s + l.debit, 0));
  const totalCredit = roundToSen(built.reduce((s, l) => s + l.credit, 0));

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new UnbalancedJournalError(totalDebit, totalCredit);
  }
  if (totalDebit === 0) {
    throw new Error("Total jurnal tidak boleh nol");
  }

  return built;
}

export function journalTotals(lines: JournalLine[]): { debit: number; credit: number } {
  return {
    debit: roundToSen(lines.reduce((s, l) => s + l.debit, 0)),
    credit: roundToSen(lines.reduce((s, l) => s + l.credit, 0)),
  };
}

// ---------------------------------------------------------------- JURNAL ----

/**
 * TOP UP — BUKAN REVENUE (blueprint §16).
 * DR Bank / CR Student Wallet Liability
 */
export function topUpJournal(amount: number, method: "CASH" | "BANK") {
  const debitAccount = method === "CASH" ? COA.CASH : COA.BANK;
  return buildJournalLines([
    { accountCode: debitAccount, debit: amount, memo: "Setoran dana santri" },
    {
      accountCode: COA.STUDENT_WALLET_LIABILITY,
      credit: amount,
      memo: "Top up wallet santri (bukan pendapatan)",
    },
  ]);
}

/**
 * PURCHASE dengan pembayaran wallet (blueprint §18).
 * DR Student Wallet Liability / CR Retail Sales Revenue
 */
export function walletPurchaseJournal(total: number) {
  return buildJournalLines([
    { accountCode: COA.STUDENT_WALLET_LIABILITY, debit: total, memo: "Pembelian dengan wallet" },
    { accountCode: COA.RETAIL_SALES, credit: total, memo: "Pendapatan penjualan retail" },
  ]);
}

/** Jurnal HPP penjualan: DR COGS / CR Inventory (blueprint §18). */
export function cogsJournal(cogs: number) {
  return buildJournalLines([
    { accountCode: COA.RETAIL_COGS, debit: cogs, memo: "HPP penjualan" },
    { accountCode: COA.INVENTORY, credit: cogs, memo: "Pengurangan persediaan" },
  ]);
}

/** Pembayaran tunai ke kasir: DR Revenue / CR Cash. */
export function cashSaleJournal(total: number) {
  return buildJournalLines([
    { accountCode: COA.RETAIL_SALES, credit: total, memo: "Pendapatan penjualan tunai" },
    { accountCode: COA.CASH, debit: total, memo: "Penerimaan kas" },
  ]);
}

/** WITHDRAWAL (blueprint §19). DR Wallet Liability / CR Cash. */
export function withdrawalJournal(amount: number) {
  return buildJournalLines([
    { accountCode: COA.STUDENT_WALLET_LIABILITY, debit: amount, memo: "Penarikan dana santri" },
    { accountCode: COA.CASH, credit: amount, memo: "Kas keluar untuk penarikan" },
  ]);
}

/** REFUND penjualan wallet: DR Revenue / CR Wallet Liability. */
export function walletRefundJournal(amount: number) {
  return buildJournalLines([
    { accountCode: COA.RETAIL_SALES, debit: amount, memo: "Retur penjualan (wallet)" },
    { accountCode: COA.STUDENT_WALLET_LIABILITY, credit: amount, memo: "Pengembalian ke wallet" },
  ]);
}

/** REFUND penjualan tunai: DR Revenue / CR Cash. */
export function cashRefundJournal(amount: number) {
  return buildJournalLines([
    { accountCode: COA.RETAIL_SALES, debit: amount, memo: "Retur penjualan (tunai)" },
    { accountCode: COA.CASH, credit: amount, memo: "Kas keluar untuk retur" },
  ]);
}

/** Retur barang ke persediaan: DR Inventory / CR COGS. */
export function returnInventoryJournal(cogs: number) {
  return buildJournalLines([
    { accountCode: COA.INVENTORY, debit: cogs, memo: "Retur barang ke persediaan" },
    { accountCode: COA.RETAIL_COGS, credit: cogs, memo: "Pembatalan HPP" },
  ]);
}

/** Pembelian persediaan secara kredit: DR Inventory / CR Supplier Payable. */
export function purchaseCreditJournal(amount: number) {
  return buildJournalLines([
    { accountCode: COA.INVENTORY, debit: amount, memo: "Pembelian persediaan" },
    { accountCode: COA.SUPPLIER_PAYABLE, credit: amount, memo: "Hutang ke supplier" },
  ]);
}

/** Pembelian persediaan dibayar tunai/bank: DR Inventory / CR Cash|Bank. */
export function purchasePaidJournal(amount: number, method: "CASH" | "BANK") {
  return buildJournalLines([
    { accountCode: COA.INVENTORY, debit: amount, memo: "Pembelian persediaan" },
    {
      accountCode: method === "CASH" ? COA.CASH : COA.BANK,
      credit: amount,
      memo: "Pembayaran pembelian",
    },
  ]);
}

/** Beban operasional: DR Expense / CR Cash. */
export function expenseJournal(accountCode: string, amount: number) {
  return buildJournalLines([
    { accountCode, debit: amount, memo: accountName(accountCode) },
    { accountCode: COA.CASH, credit: amount, memo: "Pembayaran beban" },
  ]);
}

/** Penjualan jasa (laundry/barbershop/jastip/PPOB) via wallet. */
export function serviceWalletJournal(revenueCode: string, amount: number) {
  return buildJournalLines([
    { accountCode: COA.STUDENT_WALLET_LIABILITY, debit: amount, memo: "Pembayaran jasa via wallet" },
    { accountCode: revenueCode, credit: amount, memo: accountName(revenueCode) },
  ]);
}

/** Penjualan jasa via tunai. */
export function serviceCashJournal(revenueCode: string, amount: number) {
  return buildJournalLines([
    { accountCode: revenueCode, credit: amount, memo: accountName(revenueCode) },
    { accountCode: COA.CASH, debit: amount, memo: "Penerimaan kas jasa" },
  ]);
}

/** HPP PPOB (harga beli pulsa/token dari provider): DR COGS / CR Cash. */
export function ppobCogsJournal(cost: number) {
  return buildJournalLines([
    { accountCode: COA.RETAIL_COGS, debit: cost, memo: "HPP PPOB (harga beli provider)" },
    { accountCode: COA.CASH, credit: cost, memo: "Pembayaran ke provider PPOB" },
  ]);
}

// --------------------------------------------------------------- LAPORAN ----

export interface ProfitAndLoss {
  revenueRetail: number;
  revenueLaundry: number;
  revenueBarbershop: number;
  revenueJastip: number;
  revenuePpob: number;
  totalRevenue: number;
  cogsRetail: number;
  cogsLaundry: number;
  cogsJastip: number;
  totalCogs: number;
  grossProfit: number;
  totalOperatingExpense: number;
  netProfit: number;
  isProfit: boolean;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debit: number;
  credit: number;
}

/** Hitung P&L dari akun-akun yang ber movements. */
export function computeProfitAndLoss(input: {
  revenueByCode: Record<string, number>;
  cogsByCode: Record<string, number>;
  expenseByCode: Record<string, number>;
}): ProfitAndLoss {
  const revenueRetail = roundToSen(input.revenueByCode[COA.RETAIL_SALES] ?? 0);
  const revenueLaundry = roundToSen(input.revenueByCode[COA.LAUNDRY_REVENUE] ?? 0);
  const revenueBarbershop = roundToSen(input.revenueByCode[COA.BARBERSHOP_REVENUE] ?? 0);
  const revenueJastip = roundToSen(input.revenueByCode[COA.JASTIP_REVENUE] ?? 0);
  const revenuePpob = roundToSen(input.revenueByCode[COA.PPOB_REVENUE] ?? 0);
  const totalRevenue = roundToSen(
    revenueRetail + revenueLaundry + revenueBarbershop + revenueJastip + revenuePpob,
  );

  const cogsRetail = roundToSen(input.cogsByCode[COA.RETAIL_COGS] ?? 0);
  const cogsLaundry = roundToSen(input.cogsByCode[COA.LAUNDRY_COGS] ?? 0);
  const cogsJastip = roundToSen(input.cogsByCode[COA.JASTIP_COGS] ?? 0);
  const totalCogs = roundToSen(cogsRetail + cogsLaundry + cogsJastip);

  const grossProfit = roundToSen(totalRevenue - totalCogs);
  const totalOperatingExpense = roundToSen(
    Object.values(input.expenseByCode).reduce((s, v) => s + v, 0),
  );
  const netProfit = roundToSen(grossProfit - totalOperatingExpense);

  return {
    revenueRetail,
    revenueLaundry,
    revenueBarbershop,
    revenueJastip,
    revenuePpob,
    totalRevenue,
    cogsRetail,
    cogsLaundry,
    cogsJastip,
    totalCogs,
    grossProfit,
    totalOperatingExpense,
    netProfit,
    isProfit: netProfit >= 0,
  };
}

/**
 * Menghitung saldo per akun dari journal lines.
 * Normal balance menentukan tampilan: debit positif untuk ASSET/EXPENSE/COGS,
 * credit positif untuk LIABILITY/EQUITY/REVENUE.
 */
export function trialBalance(lines: { accountCode: string; debit: number; credit: number }[]) {
  const map = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const entry = map.get(line.accountCode) ?? { debit: 0, credit: 0 };
    entry.debit = roundToSen(entry.debit + line.debit);
    entry.credit = roundToSen(entry.credit + line.credit);
    map.set(line.accountCode, entry);
  }

  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const [accountCode, value] of map.entries()) {
    const def = accountByCode(accountCode);
    if (!def) continue;
    // Netting: selisih debit - credit ditampilkan pada sisi yang sesuai,
    // sehingga total debit selalu sama dengan total credit.
    const net = roundToSen(value.debit - value.credit);
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    totalDebit = roundToSen(totalDebit + debit);
    totalCredit = roundToSen(totalCredit + credit);
    rows.push({
      accountCode,
      accountName: def.name,
      accountType: def.type,
      debit: roundToSen(debit),
      credit: roundToSen(credit),
    });
  }

  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  return { rows, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}
