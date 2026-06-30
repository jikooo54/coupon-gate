import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./chain";

type Hex = `0x${string}`;
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
}
export interface TicketRow extends TicketView { id: number; }
export interface Merchant { name: string; stake: string; honored: number; dishonored: number; honorScore: number; active: boolean; }

function readClient() { return createClient({ chain: studionet, account: createAccount() }); }
function writeClient(account: Hex) { return createClient({ chain: studionet, account }); }
async function waitAccepted(client: any, hash: Hex) { let timer: ReturnType<typeof setTimeout> | undefined; const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS); }); try { await Promise.race([client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }), timeout]); } finally { if (timer) clearTimeout(timer); } }
function pick(obj: any, key: string, idx: number): any { if (obj == null) return undefined; if (Array.isArray(obj)) return obj[idx]; if (typeof obj === "object" && key in obj) return obj[key]; return undefined; }
async function send(account: Hex, fn: string, args: any[], value: bigint = 0n): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: fn, args, value })) as Hex;
  await waitAccepted(wc, h);
}

export async function enrolMerchant(account: Hex, name: string, stake: bigint): Promise<void> {
  if (stake <= 0n) throw new Error("Stake must be > 0");
  await send(account, "enrol_merchant", [name.trim()], stake);
}
export async function escrowCoupon(account: Hex, merchant: string, merchantName: string, faceValue: bigint, usageProof: string, escrow: bigint): Promise<number> {
  if (escrow <= 0n) throw new Error("Escrow must be > 0");
  await send(account, "escrow_coupon", [merchant.trim(), merchantName.trim(), faceValue, usageProof.trim()], escrow);
  const c = await getCounts(); return c.next - 1;
}
export async function attestSettlement(account: Hex, id: number, paymentProof: string): Promise<void> { await send(account, "attest_settlement", [id, paymentProof.trim()]); }
export async function reconcile(account: Hex, id: number): Promise<void> { await send(account, "reconcile", [id]); }
export async function finalise(account: Hex, id: number): Promise<void> { await send(account, "finalise", [id]); }

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
