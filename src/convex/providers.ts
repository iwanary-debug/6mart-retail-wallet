/**
 * Provider Abstractions 6Mart (blueprint §30).
 *
 * Semua integrasi eksternal (payment, PPOB, notifikasi, RFID gateway)
 * didefinisikan sebagai interface. Implementasi SANDBOX/uuid tersedia
 * sehingga aplikasi tetap dapat dijalankan & diuji tanpa credential.
 *
 * Implementasi production hanya perlu ditambahkan sebagai class baru —
 * tidak ada perubahan pada modul bisnis.
 */

export type ProviderEnvironment = "SANDBOX" | "PRODUCTION";

export interface ProviderResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  reference?: string;
}

// ------------------------------------------------------------- PAYMENT ----

export interface VirtualAccountRequest {
  walletId: string;
  studentId: string;
  studentName: string;
  amount: number;
  expiresAt: number;
}

export interface VirtualAccountResponse {
  accountNumber: string;
  bankCode: string;
  expiresAt: number;
  amount: number;
}

export interface PaymentProvider {
  readonly name: string;
  readonly environment: ProviderEnvironment;
  isAvailable(): boolean;
  createVirtualAccount(req: VirtualAccountRequest): Promise<ProviderResult<VirtualAccountResponse>>;
  verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean>;
  parseWebhook(headers: Record<string, string>, body: string): Promise<WebhookEvent>;
}

export interface WebhookEvent {
  provider: string;
  eventId: string;
  eventType: string;
  accountNumber?: string;
  amount?: number;
  paidAt?: number;
  status: "PAID" | "FAILED" | "EXPIRED" | "UNKNOWN";
  raw: string;
}

/**
 * SandboxPaymentProvider — simulasi bank/VA.
 * JANGAN dipakai di production; ditandai jelas via `environment`.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = "SANDBOX_BANK";
  readonly environment: ProviderEnvironment = "SANDBOX";

  isAvailable(): boolean {
    return true;
  }

  async createVirtualAccount(
    req: VirtualAccountRequest,
  ): Promise<ProviderResult<VirtualAccountResponse>> {
    // Nomor VA deterministik dari wallet agar mudah dites & dicocokkan.
    const digits = req.walletId.replace(/[^0-9]/g, "").padStart(8, "0").slice(-8);
    return {
      ok: true,
      reference: `VA-${Date.now()}`,
      data: {
        accountNumber: `8808${digits}`,
        bankCode: "SANDBOX",
        expiresAt: req.expiresAt,
        amount: req.amount,
      },
    };
  }

  async verifyWebhook(headers: Record<string, string>, _body: string): Promise<boolean> {
    // Sandbox: signature selalu "sandbox-secret".
    return headers["x-sandbox-signature"] === "sandbox-secret";
  }

  async parseWebhook(
    _headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    const payload = JSON.parse(body) as Record<string, unknown>;
    return {
      provider: this.name,
      eventId: String(payload.eventId ?? ""),
      eventType: String(payload.eventType ?? "unknown"),
      accountNumber: payload.accountNumber ? String(payload.accountNumber) : undefined,
      amount: typeof payload.amount === "number" ? payload.amount : undefined,
      paidAt: typeof payload.paidAt === "number" ? payload.paidAt : Date.now(),
      status: (payload.status as WebhookEvent["status"]) ?? "UNKNOWN",
      raw: body,
    };
  }
}

// ---------------------------------------------------------------- PPOB ----

export type PpobCategory = "PULSA" | "PLN" | "DATA" | "GAME" | "E_WALLET" | "OTHER";

export interface PpobProduct {
  code: string;
  name: string;
  category: PpobCategory;
  price: number;
  costPrice: number;
}

export interface PpobRequest {
  code: string;
  customerIdentifier: string;
  product: PpobProduct;
  referenceId: string;
}

export interface PpobResponse {
  status: "PENDING" | "SUCCESS" | "FAILED";
  message: string;
  providerReference: string;
  serialNumber?: string;
  balance?: number;
}

export interface PPOBProvider {
  readonly name: string;
  readonly environment: ProviderEnvironment;
  listProducts(): Promise<PpobProduct[]>;
  charge(req: PpobRequest): Promise<PpobResponse>;
  checkStatus(providerReference: string): Promise<PpobResponse>;
}

/**
 * SandboxPpobProvider — mensimulasikan alur PPOB.
 * Fokus: arsitektur, bukan koneksi provider nyata.
 */
export class SandboxPpobProvider implements PPOBProvider {
  readonly name = "SANDBOX_PPOB";
  readonly environment: ProviderEnvironment = "SANDBOX";

  async listProducts(): Promise<PpobProduct[]> {
    return [
      { code: "PULSA10", name: "Pulsa Rp10.000", category: "PULSA", price: 11000, costPrice: 9750 },
      { code: "PULSA25", name: "Pulsa Rp25.000", category: "PULSA", price: 26000, costPrice: 24375 },
      { code: "PULSA50", name: "Pulsa Rp50.000", category: "PULSA", price: 51000, costPrice: 48750 },
      { code: "PLN20", name: "Token Listrik Rp20.000", category: "PLN", price: 21500, costPrice: 20000 },
      { code: "PLN50", name: "Token Listrik Rp50.000", category: "PLN", price: 51500, costPrice: 50000 },
      { code: "PLN100", name: "Token Listrik Rp100.000", category: "PLN", price: 101500, costPrice: 100000 },
      { code: "DATA10", name: "Paket Data 1GB", category: "DATA", price: 15000, costPrice: 13000 },
    ];
  }

  async charge(req: PpobRequest): Promise<PpobResponse> {
    // Simulasi penolakan bila identifier tidak valid.
    if (!/^\d{9,15}$/.test(req.customerIdentifier.replace(/\D/g, ""))) {
      return {
        status: "FAILED",
        message: "Nomor pelanggan tidak valid",
        providerReference: `SBX-${Date.now()}`,
      };
    }
    return {
      status: "SUCCESS",
      message: "Transaksi berhasil (SANDBOX)",
      providerReference: `SBX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      serialNumber: `${Math.floor(Math.random() * 900000 + 100000)}-${Math.floor(
        Math.random() * 9000 + 1000,
      )}-${Math.floor(Math.random() * 9000 + 1000)}`,
    };
  }

  async checkStatus(providerReference: string): Promise<PpobResponse> {
    return {
      status: "SUCCESS",
      message: "Status tidak berubah (SANDBOX)",
      providerReference,
    };
  }
}

// --------------------------------------------------------- NOTIFICATION ----

export interface NotificationMessage {
  to: string;
  subject: string;
  body: string;
  channel: "EMAIL" | "WHATSAPP" | "IN_APP";
}

export interface NotificationProvider {
  readonly name: string;
  readonly environment: ProviderEnvironment;
  send(message: NotificationMessage): Promise<ProviderResult<{ id: string }>>;
}

/** Penyimpan notifikasi in-app (tanpa kredensial eksternal). */
export class InAppNotificationProvider implements NotificationProvider {
  readonly name = "IN_APP";
  readonly environment: ProviderEnvironment = "SANDBOX";

  async send(_message: NotificationMessage): Promise<ProviderResult<{ id: string }>> {
    return { ok: true, data: { id: `inapp-${Date.now()}` } };
  }
}

// ---------------------------------------------------------------- RFID ----

export interface RfidDeviceEvent {
  uid: string;
  timestamp: number;
}

export interface RFIDProvider {
  readonly name: string;
  readonly environment: ProviderEnvironment;
  isEnabled(): boolean;
  /**
   * Device reader 125 kHz biasanya mengirim keystroke ke input browser
   * (keyboard wedge). Provider ini melakukan normalisasi & validasi UID.
   */
  normalize(raw: string): string;
  validateUid(uid: string): boolean;
}

/** Normalisasi input keyboard-wedge RFID reader. */
export class KeyboardWedgeRfidProvider implements RFIDProvider {
  readonly name = "RFID_KEYBOARD_WEDGE";
  readonly environment: ProviderEnvironment = "PRODUCTION";

  isEnabled(): boolean {
    return true;
  }

  normalize(raw: string): string {
    return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 32);
  }

  validateUid(uid: string): boolean {
    return /^[A-F0-9]{4,32}$/.test(uid);
  }
}

// ------------------------------------------------------------ REGISTRY ----

let paymentProvider: PaymentProvider = new SandboxPaymentProvider();
let ppobProvider: PPOBProvider = new SandboxPpobProvider();
let notificationProvider: NotificationProvider = new InAppNotificationProvider();
let rfidProvider: RFIDProvider = new KeyboardWedgeRfidProvider();

export function getPaymentProvider(): PaymentProvider {
  return paymentProvider;
}

export function getPpobProvider(): PPOBProvider {
  return ppobProvider;
}

export function getNotificationProvider(): NotificationProvider {
  return notificationProvider;
}

export function getRfidProvider(): RFIDProvider {
  return rfidProvider;
}

/** Dipakai saat provider production ditambahkan. */
export function registerProviders(providers: {
  payment?: PaymentProvider;
  ppob?: PPOBProvider;
  notification?: NotificationProvider;
  rfid?: RFIDProvider;
}): void {
  if (providers.payment) paymentProvider = providers.payment;
  if (providers.ppob) ppobProvider = providers.ppob;
  if (providers.notification) notificationProvider = providers.notification;
  if (providers.rfid) rfidProvider = providers.rfid;
}
