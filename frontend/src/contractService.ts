import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { WalletClient } from "viem";
import { CONTRACT_ADDRESS, GENLAYER_NETWORK } from "./chain";

type Hex = `0x${string}`;
type WalletProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
export type ConnectedWallet = WalletClient & {
  account: NonNullable<WalletClient["account"]>;
  transport: WalletClient["transport"] & WalletProvider;
};
const TIMEOUT_MS = 240_000;

export type Outcome = "VALID" | "INVALID" | "";

// status: 0 ESCROWED, 1 ATTESTED, 2 RECONCILED, 3 FINALISED
export interface TicketView {
  holder: string;
  merchant: string;
  merchantName: string;
  faceValue: string;
  usageProof: string;
  paymentProof: string;
  escrow: string;
  confidence: number;
  validated: string;
  slashed: string;
  status: number;
  outcome: Outcome;
  rationale: string;
  authorityOrigin: string;
  usageUrl: string;
  usageSha256: string;
  paymentUrl: string;
  paymentSha256: string;
  attestDeadline: string;
  reconcileDeadline: string;
}
export interface TicketRow extends TicketView { id: number; }
export interface Merchant { name: string; stake: string; honored: number; dishonored: number; honorScore: number; active: boolean; evidenceOrigin: string; verified: boolean; openLiabilities: number; }
export interface EvidenceAuthority { label: string; origin: string; verified: boolean; registeredBy: string; }

let _read: ReturnType<typeof createClient> | null = null;
function readClient() {
  if (!_read) _read = createClient({ chain: studionet, account: createAccount() });
  return _read;
}
function requireConnectedWallet(wallet: WalletClient | undefined): ConnectedWallet {
  if (!wallet?.account?.address) throw new Error("Connect a wallet before sending a transaction.");
  if (typeof wallet.transport?.request !== "function") {
    throw new Error("Connected wallet does not expose an EIP-1193 request signer.");
  }
  return wallet as ConnectedWallet;
}
function writeClient(wallet: WalletClient | undefined) {
  const signer = requireConnectedWallet(wallet);
  return createClient({
    chain: studionet,
    account: signer.account.address as Hex,
    provider: {
      request: (args: { method: string; params?: unknown[] }) => signer.transport.request(args),
    },
  });
}
async function waitAccepted(client: any, hash: Hex) { let timer: ReturnType<typeof setTimeout> | undefined; const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS); }); try { await Promise.race([client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }), timeout]); } finally { if (timer) clearTimeout(timer); } }
function pick(obj: any, key: string, idx: number): any { if (obj == null) return undefined; if (Array.isArray(obj)) return obj[idx]; if (typeof obj === "object" && key in obj) return obj[key]; return undefined; }
async function send(wallet: WalletClient | undefined, fn: string, args: any[], value: bigint = 0n): Promise<void> {
  const wc = writeClient(wallet);
  await wc.connect(GENLAYER_NETWORK);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: fn, args, value })) as Hex;
  await waitAccepted(wc, h);
}

export async function enrolMerchant(wallet: WalletClient | undefined, name: string, evidenceOrigin: string, stake: bigint): Promise<void> {
  if (stake <= 0n) throw new Error("Stake must be > 0");
  await send(wallet, "enrol_merchant", [name.trim(), evidenceOrigin.trim()], stake);
}
export async function verifyMerchant(wallet: WalletClient | undefined): Promise<void> { await send(wallet, "verify_merchant", []); }
export async function withdrawStake(wallet: WalletClient | undefined): Promise<void> { await send(wallet, "withdraw_stake", []); }
export async function registerAuthority(wallet: WalletClient | undefined, label: string, authorityOrigin: string): Promise<void> {
  await send(wallet, "register_authority", [label.trim(), authorityOrigin.trim()]);
}
export async function verifyAuthority(wallet: WalletClient | undefined, authorityOrigin: string): Promise<void> {
  await send(wallet, "verify_authority", [authorityOrigin.trim()]);
}
export async function escrowCoupon(wallet: WalletClient | undefined, merchant: string, faceValue: bigint, authorityOrigin: string, usageUrl: string, usageSha256: string, escrow: bigint): Promise<number> {
  if (escrow <= 0n) throw new Error("Escrow must be > 0");
  await send(wallet, "escrow_coupon", [merchant.trim(), faceValue, authorityOrigin.trim(), usageUrl.trim(), usageSha256.trim()], escrow);
  const c = await getCounts(); return c.next - 1;
}
export async function attestSettlement(wallet: WalletClient | undefined, id: number, paymentUrl: string, paymentSha256: string): Promise<void> { await send(wallet, "attest_settlement", [id, paymentUrl.trim(), paymentSha256.trim()]); }
export async function timeoutRefund(wallet: WalletClient | undefined, id: number): Promise<void> { await send(wallet, "timeout_refund", [id]); }
export async function reconcileTimeoutRefund(wallet: WalletClient | undefined, id: number): Promise<void> { await send(wallet, "reconcile_timeout_refund", [id]); }
export async function reconcile(wallet: WalletClient | undefined, id: number): Promise<void> { await send(wallet, "reconcile", [id]); }
export async function finalise(wallet: WalletClient | undefined, id: number): Promise<void> { await send(wallet, "finalise", [id]); }

export async function getTicket(id: number): Promise<TicketView> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_coupon", args: [id] });
  return {
    holder: String(pick(r, "holder", 0) ?? ""),
    merchant: String(pick(r, "merchant", 1) ?? ""),
    merchantName: String(pick(r, "merchant_name", 2) ?? ""),
    faceValue: String(pick(r, "face_value", 3) ?? "0"),
    usageProof: String(pick(r, "usage_proof", 4) ?? ""),
    paymentProof: String(pick(r, "payment_proof", 5) ?? ""),
    escrow: String(pick(r, "escrow", 6) ?? "0"),
    confidence: Number(pick(r, "confidence", 7) ?? 0),
    validated: String(pick(r, "validated", 8) ?? "0"),
    slashed: String(pick(r, "slashed", 9) ?? "0"),
    status: Number(pick(r, "status", 10) ?? 0),
    outcome: String(pick(r, "outcome", 11) ?? "") as Outcome,
    rationale: String(pick(r, "rationale", 12) ?? ""),
    authorityOrigin: String(pick(r, "authority_origin", 13) ?? ""),
    usageUrl: String(pick(r, "usage_url", 14) ?? ""),
    usageSha256: String(pick(r, "usage_sha256", 15) ?? ""),
    paymentUrl: String(pick(r, "payment_url", 16) ?? ""),
    paymentSha256: String(pick(r, "payment_sha256", 17) ?? ""),
    attestDeadline: String(pick(r, "attest_deadline", 18) ?? "0"),
    reconcileDeadline: String(pick(r, "reconcile_deadline", 19) ?? "0"),
  };
}
export async function getMerchant(who: string): Promise<Merchant> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_merchant", args: [who] });
  return {
    name: String(pick(r, "name", 0) ?? ""),
    stake: String(pick(r, "stake", 1) ?? "0"),
    honored: Number(pick(r, "honored", 2) ?? 0),
    dishonored: Number(pick(r, "dishonored", 3) ?? 0),
    honorScore: Number(pick(r, "honor_score", 4) ?? 0),
    active: Boolean(pick(r, "active", 5) ?? false),
    evidenceOrigin: String(pick(r, "evidence_origin", 6) ?? ""),
    verified: Boolean(pick(r, "verified", 7) ?? false),
    openLiabilities: Number(pick(r, "open_liabilities", 8) ?? 0),
  };
}
export async function getAuthority(authorityOrigin: string): Promise<EvidenceAuthority> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_authority", args: [authorityOrigin] });
  return {
    label: String(pick(r, "label", 0) ?? ""),
    origin: String(pick(r, "origin", 1) ?? ""),
    verified: Boolean(pick(r, "verified", 2) ?? false),
    registeredBy: String(pick(r, "registered_by", 3) ?? ""),
  };
}
export async function getCounts(): Promise<{ next: number; reconciled: number; valid: number; slashed: number }> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_counts", args: [] });
  const p = String(r).split("||").map((x) => Number(x) || 0);
  return { next: p[0] || 0, reconciled: p[1] || 0, valid: p[2] || 0, slashed: p[3] || 0 };
}
export async function getPoolBalance(): Promise<string> { const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_pool_balance", args: [] }); return String(r ?? "0"); }
export async function getStakedBalance(): Promise<string> { const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_staked_balance", args: [] }); return String(r ?? "0"); }
export async function listAll(maxRows = 80): Promise<TicketRow[]> {
  const { next } = await getCounts(); if (next === 0) return [];
  const ids: number[] = []; for (let i = next - 1; i >= 0 && i >= next - maxRows; i--) ids.push(i);
  const rows = await Promise.all(ids.map(async (id) => { try { const c = await getTicket(id); return { id, ...c }; } catch { return null; } }));
  return rows.filter((r): r is TicketRow => r !== null);
}
