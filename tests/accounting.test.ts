import { describe, expect, test } from "bun:test";
import {
  CHART_OF_ACCOUNTS,
  COA,
  UnbalancedJournalError,
  accountByCode,
  accountName,
  buildJournalLines,
  cashRefundJournal,
  cashSaleJournal,
  cogsJournal,
  computeProfitAndLoss,
  expenseJournal,
  journalTotals,
  ppobCogsJournal,
  purchaseCreditJournal,
  purchasePaidJournal,
  returnInventoryJournal,
  serviceCashJournal,
  serviceWalletJournal,
  topUpJournal,
  trialBalance,
  walletPurchaseJournal,
  walletRefundJournal,
  withdrawalJournal,
} from "../src/lib/accounting";

describe("Chart of Accounts (blueprint §28)", () => {
  test("semua kode akun COA terdaftar di CHART_OF_ACCOUNTS", () => {
    for (const code of Object.values(COA)) {
      expect(accountByCode(code)).toBeDefined();
    }
  });

  test("kode akun unik dan tidak berduplikasi", () => {
    const codes = CHART_OF_ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("accountByCode mengembalikan null untuk kode tak dikenal", () => {
    expect(accountByCode("9999")).toBeUndefined();
  });

  test("akun kewajiban wallet bertipe LIABILITY dan saldo normal KREDIT", () => {
    const wallet = accountByCode(COA.STUDENT_WALLET_LIABILITY)!;
    expect(wallet.type).toBe("LIABILITY");
    expect(wallet.normalBalance).toBe("CREDIT");
  });

  test("akun pendapatan bertipe REVENUE dan tidak pernah jadi akun debit top up", () => {
    for (const code of [
      COA.RETAIL_SALES,
      COA.LAUNDRY_REVENUE,
      COA.BARBERSHOP_REVENUE,
      COA.JASTIP_REVENUE,
      COA.PPOB_REVENUE,
    ]) {
      expect(accountByCode(code)!.type).toBe("REVENUE");
    }
  });

  test("accountName mengembalikan nama akun", () => {
    expect(accountName(COA.CASH).length).toBeGreaterThan(0);
  });
});

describe("buildJournalLines (blueprint §29)", () => {
  test("jurnal harus minimal 2 baris", () => {
    expect(() => buildJournalLines([{ accountCode: COA.CASH, debit: 100 }])).toThrow(
      /minimal memiliki 2 baris/,
    );
  });

  test("jurnal tidak seimbang ditolak", () => {
    expect(() =>
      buildJournalLines([
        { accountCode: COA.CASH, debit: 1000 },
        { accountCode: COA.BANK, credit: 900 },
      ]),
    ).toThrow(UnbalancedJournalError);
  });

  test("baris tidak boleh punya debit dan credit sekaligus", () => {
    expect(() =>
      buildJournalLines([
        { accountCode: COA.CASH, debit: 1000, credit: 1000 },
        { accountCode: COA.BANK, credit: 1000 },
      ]),
    ).toThrow(/sekaligus/);
  });

  test("baris tidak boleh bernilai nol", () => {
    expect(() =>
      buildJournalLines([
        { accountCode: COA.CASH, debit: 1000 },
        { accountCode: COA.BANK, credit: 0 },
      ]),
    ).toThrow(/nominal nol/);
  });

  test("nominal negatif ditolak", () => {
    expect(() =>
      buildJournalLines([
        { accountCode: COA.CASH, debit: -1000 },
        { accountCode: COA.BANK, credit: -1000 },
      ]),
    ).toThrow(/negatif/);
  });

  test("akun tak dikenal ditolak", () => {
    expect(() =>
      buildJournalLines([
        { accountCode: "9999", debit: 1000 },
        { accountCode: COA.CASH, credit: 1000 },
      ]),
    ).toThrow(/Akun tidak dikenal/);
  });

  test("jurnal seimbang diterima", () => {
    const lines = buildJournalLines([
      { accountCode: COA.CASH, debit: 1000 },
      { accountCode: COA.BANK, credit: 1000 },
    ]);
    expect(journalTotals(lines)).toEqual({ debit: 1000, credit: 1000 });
  });
});

describe("topUpJournal — TOPUP BUKAN REVENUE (blueprint §16, §31)", () => {
  test("top up via bank: Debit Bank, Kredit Kewajiban Wallet", () => {
    const lines = topUpJournal(500_000, "BANK");
    expect(journalTotals(lines)).toEqual({ debit: 500_000, credit: 500_000 });
    expect(lines[0].accountCode).toBe(COA.BANK);
    expect(lines[0].debit).toBe(500_000);
    expect(lines[1].accountCode).toBe(COA.STUDENT_WALLET_LIABILITY);
    expect(lines[1].credit).toBe(500_000);
  });

  test("top up via tunai: Debit Kas, Kredit Kewajiban Wallet", () => {
    const lines = topUpJournal(50_000, "CASH");
    expect(lines[0].accountCode).toBe(COA.CASH);
    expect(lines[1].accountCode).toBe(COA.STUDENT_WALLET_LIABILITY);
  });

  test("TIDAK ADA akun pendapatan yang tersentuh saat top up", () => {
    for (const method of ["CASH", "BANK"] as const) {
      const codes = topUpJournal(100_000, method).map((l) => l.accountCode);
      expect(codes).not.toContain(COA.RETAIL_SALES);
      expect(codes).not.toContain(COA.LAUNDRY_REVENUE);
      expect(codes).not.toContain(COA.PPOB_REVENUE);
    }
  });
});

describe("jurnal penjualan (blueprint §18)", () => {
  test("penjualan via wallet: Debit Kewajiban Wallet, Kredit Pendapatan", () => {
    const lines = walletPurchaseJournal(25_000);
    expect(journalTotals(lines)).toEqual({ debit: 25_000, credit: 25_000 });
    expect(lines[0].accountCode).toBe(COA.STUDENT_WALLET_LIABILITY);
    expect(lines[1].accountCode).toBe(COA.RETAIL_SALES);
  });

  test("penjualan tunai: Debit Kas, Kredit Pendapatan", () => {
    const lines = cashSaleJournal(25_000);
    expect(journalTotals(lines)).toEqual({ debit: 25_000, credit: 25_000 });
    const cash = lines.find((l) => l.accountCode === COA.CASH)!;
    const revenue = lines.find((l) => l.accountCode === COA.RETAIL_SALES)!;
    expect(cash.debit).toBe(25_000);
    expect(revenue.credit).toBe(25_000);
  });

  test("HPP penjualan: Debit COGS, Kredit Persediaan", () => {
    const lines = cogsJournal(18_750);
    expect(journalTotals(lines)).toEqual({ debit: 18_750, credit: 18_750 });
    expect(lines[0].accountCode).toBe(COA.RETAIL_COGS);
    expect(lines[1].accountCode).toBe(COA.INVENTORY);
  });

  test("jurnal penjualan + HPP menghasilkan laba kotor yang benar", () => {
    const sale = walletPurchaseJournal(25_000);
    const cogs = cogsJournal(18_750);
    const all = [...sale, ...cogs];
    const t = journalTotals(all);
    expect(t.debit).toBe(t.credit);
  });
});

describe("jurnal penarikan & retur (blueprint §19, §20)", () => {
  test("penarikan: Debit Kewajiban Wallet, Kredit Kas", () => {
    const lines = withdrawalJournal(75_000);
    expect(journalTotals(lines)).toEqual({ debit: 75_000, credit: 75_000 });
    expect(lines[0].accountCode).toBe(COA.STUDENT_WALLET_LIABILITY);
    expect(lines[1].accountCode).toBe(COA.CASH);
  });

  test("retur wallet: Debit Pendapatan, Kredit Kewajiban Wallet", () => {
    const lines = walletRefundJournal(10_000);
    expect(lines[0].accountCode).toBe(COA.RETAIL_SALES);
    expect(lines[0].debit).toBe(10_000);
    expect(lines[1].accountCode).toBe(COA.STUDENT_WALLET_LIABILITY);
    expect(journalTotals(lines)).toEqual({ debit: 10_000, credit: 10_000 });
  });

  test("retur tunai: Debit Pendapatan, Kredit Kas", () => {
    const lines = cashRefundJournal(10_000);
    expect(lines[1].accountCode).toBe(COA.CASH);
  });

  test("retur barang: Debit Persediaan, Kredit HPP", () => {
    const lines = returnInventoryJournal(7_500);
    expect(lines[0].accountCode).toBe(COA.INVENTORY);
    expect(lines[1].accountCode).toBe(COA.RETAIL_COGS);
  });
});

describe("jurnal pembelian (blueprint §18)", () => {
  test("pembelian kredit: Debit Persediaan, Kredit Hutang Supplier", () => {
    const lines = purchaseCreditJournal(3_000_000);
    expect(lines[0].accountCode).toBe(COA.INVENTORY);
    expect(lines[1].accountCode).toBe(COA.SUPPLIER_PAYABLE);
  });

  test("pembelian tunai: Debit Persediaan, Kredit Kas", () => {
    const lines = purchasePaidJournal(3_000_000, "CASH");
    expect(lines[1].accountCode).toBe(COA.CASH);
  });

  test("pembelian via bank: Kredit Bank", () => {
    const lines = purchasePaidJournal(3_000_000, "BANK");
    expect(lines[1].accountCode).toBe(COA.BANK);
  });
});

describe("jurnal beban & jasa", () => {
  test("beban operasional: Debit Beban, Kredit Kas", () => {
    const lines = expenseJournal(COA.ELECTRICITY_EXPENSE, 450_000);
    expect(lines[0].accountCode).toBe(COA.ELECTRICITY_EXPENSE);
    expect(lines[1].accountCode).toBe(COA.CASH);
    expect(journalTotals(lines)).toEqual({ debit: 450_000, credit: 450_000 });
  });

  test("jasa via wallet: Debit Kewajiban Wallet, Kredit Pendapatan Jasa", () => {
    const lines = serviceWalletJournal(COA.LAUNDRY_REVENUE, 20_000);
    expect(lines[0].accountCode).toBe(COA.STUDENT_WALLET_LIABILITY);
    expect(lines[1].accountCode).toBe(COA.LAUNDRY_REVENUE);
  });

  test("jasa tunai: Debit Kas, Kredit Pendapatan Jasa", () => {
    const lines = serviceCashJournal(COA.BARBERSHOP_REVENUE, 35_000);
    const cash = lines.find((l) => l.accountCode === COA.CASH)!;
    const revenue = lines.find((l) => l.accountCode === COA.BARBERSHOP_REVENUE)!;
    expect(cash.debit).toBe(35_000);
    expect(revenue.credit).toBe(35_000);
  });

  test("HPP PPOB: Debit COGS, Kredit Kas (harga beli provider)", () => {
    const lines = ppobCogsJournal(49_000);
    expect(lines[0].accountCode).toBe(COA.RETAIL_COGS);
    expect(lines[1].accountCode).toBe(COA.CASH);
  });
});

describe("computeProfitAndLoss (blueprint §30)", () => {
  test("laba rugi dihitung dari pendapatan dikurangi HPP dan beban", () => {
    const pnl = computeProfitAndLoss({
      revenueByCode: { [COA.RETAIL_SALES]: 5_000_000, [COA.LAUNDRY_REVENUE]: 500_000 },
      cogsByCode: { [COA.RETAIL_COGS]: 3_000_000 },
      expenseByCode: { [COA.ELECTRICITY_EXPENSE]: 500_000, [COA.INTERNET_EXPENSE]: 200_000 },
    });
    expect(pnl.totalRevenue).toBe(5_500_000);
    expect(pnl.totalCogs).toBe(3_000_000);
    expect(pnl.grossProfit).toBe(2_500_000);
    expect(pnl.totalOperatingExpense).toBe(700_000);
    expect(pnl.netProfit).toBe(1_800_000);
    expect(pnl.isProfit).toBe(true);
  });

  test("dana top up siswa TIDAK PERNAH masuk pendapatan", () => {
    // Kewajiban wallet 2000 tidak boleh muncul di revenueByCode
    const withLiability = computeProfitAndLoss({
      revenueByCode: { [COA.STUDENT_WALLET_LIABILITY]: 9_000_000 },
      cogsByCode: {},
      expenseByCode: {},
    });
    expect(withLiability.totalRevenue).toBe(0);
    expect(withLiability.revenueRetail).toBe(0);
  });

  test("akun pendapatan yang tidak dikenal tidak ikut dijumlahkan", () => {
    const pnl = computeProfitAndLoss({
      revenueByCode: { [COA.JASTIP_REVENUE]: 100_000, "9999": 5_000_000 },
      cogsByCode: {},
      expenseByCode: {},
    });
    expect(pnl.totalRevenue).toBe(100_000);
  });

  test("rugi dilaporkan dengan isProfit false", () => {
    const pnl = computeProfitAndLoss({
      revenueByCode: { [COA.RETAIL_SALES]: 100_000 },
      cogsByCode: { [COA.RETAIL_COGS]: 150_000 },
      expenseByCode: {},
    });
    expect(pnl.grossProfit).toBe(-50_000);
    expect(pnl.netProfit).toBe(-50_000);
    expect(pnl.isProfit).toBe(false);
  });

  test("laba nol dianggap impas (isProfit true)", () => {
    const pnl = computeProfitAndLoss({
      revenueByCode: { [COA.RETAIL_SALES]: 1000 },
      cogsByCode: {},
      expenseByCode: {},
    });
    expect(pnl.netProfit).toBe(1000);
    expect(pnl.isProfit).toBe(true);
  });
});

describe("trialBalance (blueprint §29)", () => {
  test("jurnal yang seimbang menghasilkan trial balance seimbang", () => {
    const lines = [
      ...topUpJournal(1_000_000, "BANK"),
      ...walletPurchaseJournal(250_000),
      ...cogsJournal(180_000),
      ...expenseJournal(COA.ELECTRICITY_EXPENSE, 120_000),
    ];
    const tb = trialBalance(lines);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.rows.length).toBeGreaterThan(0);
  });

  test("baris diurutkan berdasarkan kode akun", () => {
    const tb = trialBalance([...topUpJournal(1_000, "BANK")]);
    const codes = tb.rows.map((r) => r.accountCode);
    expect([...codes].sort()).toEqual(codes);
  });

  test("akun kewajiban wallet menampilkan saldo kredit", () => {
    const tb = trialBalance([...topUpJournal(500_000, "BANK")]);
    const wallet = tb.rows.find((r) => r.accountCode === COA.STUDENT_WALLET_LIABILITY)!;
    expect(wallet.credit).toBe(500_000);
    expect(wallet.debit).toBe(0);
  });

  test("persediaan yang berkurang tampil sebagai saldo kredit", () => {
    const tb = trialBalance([...cogsJournal(75_000)]);
    const inv = tb.rows.find((r) => r.accountCode === COA.INVENTORY)!;
    expect(inv.debit).toBe(0);
    expect(inv.credit).toBe(75_000);
  });

  test("persediaan bertambah tampil sebagai saldo debit", () => {
    const tb = trialBalance([...purchaseCreditJournal(3_000_000)]);
    const inv = tb.rows.find((r) => r.accountCode === COA.INVENTORY)!;
    expect(inv.debit).toBe(3_000_000);
    expect(inv.credit).toBe(0);
  });
});

describe("skenario end-to-end: 1 top up + 1 pembelian", () => {
  test("saldo kewajiban wallet naik lalu turun, pendapatan naik, laba kotor benar", () => {
    // Santri top up 1.000.000 via bank
    const topup = topUpJournal(1_000_000, "BANK");
    // Belanja 300.000 via wallet, HPP 210.000
    const sale = walletPurchaseJournal(300_000);
    const cogs = cogsJournal(210_000);
    const all = [...topup, ...sale, ...cogs];

    const tb = trialBalance(all);
    expect(tb.isBalanced).toBe(true);

    const walletRow = tb.rows.find((r) => r.accountCode === COA.STUDENT_WALLET_LIABILITY)!;
    // 1.000.000liability dari top up, dikurangi 300.000 saat belanja
    expect(walletRow.credit).toBe(700_000);

    const pnl = computeProfitAndLoss({
      revenueByCode: { [COA.RETAIL_SALES]: 300_000 },
      cogsByCode: { [COA.RETAIL_COGS]: 210_000 },
      expenseByCode: {},
    });
    expect(pnl.totalRevenue).toBe(300_000);
    expect(pnl.grossProfit).toBe(90_000);
  });
});
