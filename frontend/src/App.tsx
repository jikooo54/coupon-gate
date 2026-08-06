import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient } from "wagmi";
import { parseEther, formatEther } from "viem";
import { Ticket, Storefront, SealCheck, Scales, ArrowsClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Hero3D } from "./Hero3D";
import { BgGeo } from "./BgGeo";
import {
  enrolMerchant, verifyMerchant, withdrawStake, registerAuthority, verifyAuthority, escrowCoupon, attestSettlement, timeoutRefund, reconcileTimeoutRefund, reconcile, finalise,
  getTicket, getMerchant, getCounts, getStakedBalance, listAll,
  TicketView, TicketRow, Merchant,
} from "./contractService";

type Hex = `0x${string}`;
const STATUS_LABEL = ["escrowed", "attested", "reconciled", "finalised"];
function shortAddr(a: string): string { return a && a.length > 12 ? `${a.slice(0, 6)}\u2026${a.slice(-4)}` : a || "-"; }
function gen(w: string): string { if (!w || w === "0") return "0"; try { const v = formatEther(BigInt(w)); const n = Number(v); return n >= 1 ? (Math.round(n * 1000) / 1000).toString() : v; } catch { return "0"; } }

export function App() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const acct = address as Hex | undefined;
  const [showEnrol, setShowEnrol] = useState(false); const [showSub, setShowSub] = useState(false);
  const [mName, setMName] = useState(""); const [mStake, setMStake] = useState(""); const [mOrigin, setMOrigin] = useState("");
  const [authLabel, setAuthLabel] = useState(""); const [authOrigin, setAuthOrigin] = useState("");
  const [merchant, setMerchant] = useState(""); const [amount, setAmount] = useState("100"); const [authorityOrigin, setAuthorityOrigin] = useState(""); const [usageUrl, setUsageUrl] = useState(""); const [usageHash, setUsageHash] = useState(""); const [escrow, setEscrow] = useState("");
  const [paymentUrl, setPaymentUrl] = useState(""); const [paymentHash, setPaymentHash] = useState("");
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [counts, setCounts] = useState({ next: 0, reconciled: 0, valid: 0, slashed: 0 });
  const [staked, setStaked] = useState("0");
  const [myM, setMyM] = useState<Merchant | null>(null);
  const [selId, setSelId] = useState<number | null>(null); const [sel, setSel] = useState<TicketView | null>(null); const [selM, setSelM] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<string | null>(null); const [note, setNote] = useState(""); const [netErr, setNetErr] = useState(false);

  async function refreshAll() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const [c, s, l] = await Promise.all([getCounts(), getStakedBalance(), listAll(80)]);
      setCounts(c); setStaked(s); setRows(l);
      if (acct) { try { setMyM(await getMerchant(acct)); } catch {} }
      if (selId != null) { try { const t = await getTicket(selId); setSel(t); setSelM(await getMerchant(t.merchant)); } catch {} }
      setNetErr(false);
    } catch { setNetErr(true); } finally { setLoading(false); }
  }
  useEffect(() => { refreshAll(); const t = setInterval(refreshAll, 12000); const onVis = () => { if (!document.hidden) refreshAll(); }; document.addEventListener("visibilitychange", onVis); return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct]);
  async function pick(id: number) { setSelId(id); setPaymentUrl(""); setPaymentHash(""); try { const t = await getTicket(id); setSel(t); setSelM(await getMerchant(t.merchant)); } catch { setSel(null); } }
  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> { setBusy(label); setNote(""); try { return await fn(); } catch (e) { setNote(String((e as Error).message || e).slice(0, 200)); return undefined; } finally { setBusy(null); refreshAll(); } }
  async function onEnrol() { if (!walletClient) return; if (mName.trim().length < 2) return setNote("Merchant name required."); if (!mOrigin.startsWith("https://")) return setNote("HTTPS evidence origin required."); if (!(Number(mStake) > 0)) return setNote("Stake in GEN, e.g. 1."); await run("Enrolling merchant", () => enrolMerchant(walletClient, mName, mOrigin, parseEther(mStake.trim()))); setMStake(""); setShowEnrol(false); }
  async function onVerify() { if (walletClient) await run("Verifying merchant domain", () => verifyMerchant(walletClient)); }
  async function onWithdraw() { if (walletClient) await run("Withdrawing unlocked stake", () => withdrawStake(walletClient)); }
  async function onRegisterAuthority() { if (!walletClient) return; if (authLabel.trim().length < 2) return setNote("Authority label required."); if (!authOrigin.startsWith("https://")) return setNote("HTTPS authority origin required."); await run("Registering independent authority", () => registerAuthority(walletClient, authLabel, authOrigin)); }
  async function onVerifyAuthority() { if (!walletClient) return; if (!authOrigin.startsWith("https://")) return setNote("HTTPS authority origin required."); await run("Verifying independent authority", () => verifyAuthority(walletClient, authOrigin)); }
  async function onSub() { if (!walletClient) return; if (!/^0x[0-9a-fA-F]{40}$/.test(merchant.trim())) return setNote("Merchant 0x address."); if (!/^\d+$/.test(amount.trim())) return setNote("Coupon amount integer."); if (!authorityOrigin.startsWith("https://")) return setNote("Independent authority origin required."); if (!usageUrl.startsWith("https://") || !/^[0-9a-fA-F]{64}$/.test(usageHash.trim())) return setNote("Usage evidence needs HTTPS URL and SHA-256."); if (!(Number(escrow) > 0)) return setNote("Escrow in GEN."); const id = await run("Escrowing authenticated coupon", () => escrowCoupon(walletClient, merchant, BigInt(amount), authorityOrigin, usageUrl, usageHash, parseEther(escrow.trim()))); if (id != null) { setSelId(id); setMerchant(""); setAuthorityOrigin(""); setUsageUrl(""); setUsageHash(""); setEscrow(""); setShowSub(false); } }
  async function onAttest() { if (!walletClient || selId == null) return; if (!paymentUrl.startsWith("https://") || !/^[0-9a-fA-F]{64}$/.test(paymentHash.trim())) return setNote("Payment evidence needs HTTPS URL and SHA-256."); await run("Attesting authenticated settlement", () => attestSettlement(walletClient, selId!, paymentUrl, paymentHash)); setPaymentUrl(""); setPaymentHash(""); }
  async function onTimeout() { if (walletClient && selId != null) await run("Recovering expired escrow", () => timeoutRefund(walletClient, selId)); }
  async function onReconcileTimeout() { if (walletClient && selId != null) await run("Recovering stalled attestation", () => reconcileTimeoutRefund(walletClient, selId)); }
  async function onReconcile() { if (walletClient && selId != null) await run("Reconciling (two-pass)", () => reconcile(walletClient, selId!)); }
  async function onFinalise() { if (walletClient && selId != null) await run("Finalising", () => finalise(walletClient, selId!)); }

  const isSelMerchant = !!(sel && acct && sel.merchant.toLowerCase() === acct.toLowerCase());
  const isSelHolder = !!(sel && acct && sel.holder.toLowerCase() === acct.toLowerCase());
  const enrolled = !!(myM && myM.name);
  const validRate = useMemo(() => counts.reconciled > 0 ? Math.round((counts.valid / counts.reconciled) * 100) : 0, [counts]);

  return (
    <div className="fs">
      <BgGeo />
      <div className="top">
        <div className="brand"><b>Couponwell</b><span>honour escrow</span></div>
        <div className="top-r"><span className={`live ${netErr ? "off" : ""}`}><i />{netErr ? "reconnecting" : "studionet"}</span><ConnectButton showBalance={false} chainStatus="none" accountStatus="address" /></div>
      </div>

      <section className="hero">
        <Hero3D />
        <div className="hero-in">
          <p className="eyebrow">staked coupon escrow</p>
          <h1>Did the merchant<br /><em>honour the coupon?</em></h1>
          <p className="lede">Merchants lock an honour stake and verify their domain, but settlement evidence must come from a separate verified issuer or acquirer authority. Hash-pinned coupon and payment records are fetched by validators before escrow can be finalised.</p>
          <p className="src">Authenticated proofs fetched via <code>gl.nondet.web</code>, then reconciled by GenLayer validators.</p>
        </div>
      </section>

      <div className="stats">
        <div className="stat"><b>{counts.next}</b><span>coupons</span></div>
        <div className="stat"><b>{counts.valid}</b><span>valid / {counts.reconciled} ruled</span></div>
        <div className="stat"><b>{validRate}<i>%</i></b><span>honour rate</span></div>
        <div className="stat"><b>{gen(staked)}<i>GEN</i></b><span>merchant stake</span></div>
      </div>

      <div className="sec-h"><Storefront size={18} weight="bold" /><h2>Merchant desk</h2><span className="mut">{enrolled ? `enrolled \u00b7 honour ${myM!.honorScore}/1000` : "stake to accept coupons"}</span></div>
      {!showEnrol ? <button className="btn ghost" onClick={() => setShowEnrol(true)}><SealCheck size={15} weight="bold" /> {enrolled ? "Top up / manage" : "Enrol as merchant"}</button>
        : <div className="panel"><label>Merchant name</label><input value={mName} onChange={e => setMName(e.target.value)} placeholder={myM?.name || "brand / store"} /><label>Verified evidence origin</label><input value={mOrigin} onChange={e => setMOrigin(e.target.value)} placeholder="https://merchant.example" /><label>Honour stake (GEN)</label><input value={mStake} onChange={e => setMStake(e.target.value)} placeholder="e.g. 1" inputMode="decimal" /><button className="btn amber" disabled={!isConnected || !walletClient || !!busy} onClick={onEnrol}>Stake and enrol</button><button className="btn ghost" disabled={!isConnected || !walletClient || !!busy} onClick={onVerify}>Verify domain file</button><button className="btn ghost" disabled={!isConnected || !walletClient || !!busy || !!myM?.openLiabilities} onClick={onWithdraw}>Withdraw stake ({myM?.openLiabilities || 0} open liabilities)</button></div>}

      <div className="sec-h"><SealCheck size={18} weight="bold" /><h2>Independent authority</h2><span className="mut">issuer / acquirer evidence source</span></div>
      <div className="panel">
        <label>Authority label</label><input value={authLabel} onChange={e => setAuthLabel(e.target.value)} placeholder="Issuer registry / payment acquirer" />
        <label>Authority origin</label><input value={authOrigin} onChange={e => setAuthOrigin(e.target.value)} placeholder="https://issuer.example" />
        <button className="btn ghost" disabled={!isConnected || !walletClient || !!busy} onClick={onRegisterAuthority}>Register authority</button>
        <button className="btn ghost" disabled={!isConnected || !walletClient || !!busy} onClick={onVerifyAuthority}>Verify authority file</button>
      </div>

      <div className="sec-h"><Ticket size={18} weight="bold" /><h2>Coupons</h2><span className="mut">escrow / attest / reconcile / finalise</span></div>
      {loading ? <div className="skel">{[0, 1, 2].map(i => <div key={i} className="sk" />)}</div>
        : rows.length === 0 ? <div className="empty">No coupons escrowed yet.</div>
          : <div className="mkts">{rows.map(r => (
            <button key={r.id} className={`mkt ${selId === r.id ? "on" : ""}`} onClick={() => pick(r.id)}>
              <div className="mkt-h"><span className="mkt-q">{r.merchantName} · coupon #{r.id}</span><span className={`tag ${r.outcome || "pend"}`}>{r.outcome || STATUS_LABEL[r.status]}</span></div>
              <div className="mkt-meta"><span className="mono">face {r.faceValue}</span><span className="mono">escrow {gen(r.escrow)} GEN</span>{Number(r.validated) > 0 ? <span className="mono">validated {r.validated}</span> : null}{r.confidence > 0 ? <span className="mono">conf {r.confidence}%</span> : null}</div>
            </button>))}</div>}

      {sel && selId != null && (
        <div className="panel">
          <div className="sec-h" style={{ marginTop: 0 }}><Scales size={17} weight="bold" /><h2>{sel.merchantName}</h2><span className={`tag ${sel.outcome || "pend"}`}>{sel.outcome || STATUS_LABEL[sel.status]}</span></div>
          <div className="kv"><span>holder</span><b className="mono">{shortAddr(sel.holder)}</b></div>
          <div className="kv"><span>merchant</span><b className="mono">{shortAddr(sel.merchant)}{selM && selM.name ? ` \u00b7 honour ${selM.honorScore}/1000` : ""}</b></div>
          <div className="kv"><span>coupon face / validated</span><b className="mono">{sel.faceValue} / {sel.validated}</b></div>
          <div className="kv"><span>confidence</span><b className="mono">{sel.confidence}%</b></div>
          <div className="kv"><span>escrow</span><b className="mono">{gen(sel.escrow)} GEN</b></div>
          {Number(sel.slashed) > 0 && <div className="kv"><span>stake slashed</span><b className="mono">{gen(sel.slashed)} GEN</b></div>}
          {sel.authorityOrigin && <div className="kv"><span>independent authority</span><b className="mono">{sel.authorityOrigin}</b></div>}
          {sel.usageUrl && <div className="evid"><div className="l">hash-pinned issuer usage evidence</div><pre>{sel.usageUrl}{"\n"}sha256 {sel.usageSha256}</pre></div>}
          {sel.paymentUrl && <div className="evid"><div className="l">hash-pinned acquirer payment evidence</div><pre>{sel.paymentUrl}{"\n"}sha256 {sel.paymentSha256}</pre></div>}
          {sel.rationale && <p className="why">{sel.rationale}</p>}
          <div className="actions">
            {sel.status === 0 && isSelMerchant && <div style={{ flex: 1 }}><label>Payment evidence URL</label><input value={paymentUrl} onChange={e => setPaymentUrl(e.target.value)} placeholder={`${sel.authorityOrigin || "https://issuer.example"}/records/payment.json`} /><label>Payment evidence SHA-256</label><input value={paymentHash} onChange={e => setPaymentHash(e.target.value)} placeholder="64 hexadecimal characters" /><button className="btn" disabled={!isConnected || !walletClient || !!busy} onClick={onAttest}><SealCheck size={15} weight="bold" /> Attest settlement</button></div>}
            {sel.status === 0 && !isSelMerchant && <p className="quiet">Awaiting the merchant ({shortAddr(sel.merchant)}) to attest before deadline.</p>}
            {sel.status === 0 && isSelHolder && <button className="btn ghost" disabled={!isConnected || !walletClient || !!busy} onClick={onTimeout}>Recover after attestation deadline</button>}
            {sel.status === 1 && <button className="btn" disabled={!isConnected || !walletClient || !!busy} onClick={onReconcile}><Scales size={15} weight="bold" /> Reconcile (two-pass)</button>}
            {sel.status === 1 && isSelHolder && <button className="btn ghost" disabled={!isConnected || !walletClient || !!busy} onClick={onReconcileTimeout}>Recover after stalled reconciliation</button>}
            {sel.status === 2 && <button className="btn amber" disabled={!isConnected || !walletClient || !!busy} onClick={onFinalise}><ArrowsClockwise size={15} weight="bold" /> Finalise escrow</button>}
            {sel.status === 3 && <p className="quiet"><CheckCircle size={15} weight="fill" /> Settled. {sel.outcome === "VALID" ? "Escrow paid to the merchant." : "Escrow refunded to the holder."}</p>}
          </div>
        </div>
      )}

      <div className="sec-h"><Ticket size={18} weight="bold" /><h2>Escrow a coupon</h2></div>
      {!showSub ? <button className="btn ghost" onClick={() => setShowSub(true)}><Ticket size={15} weight="bold" /> New coupon</button>
        : <div className="panel">
          <label>Merchant address</label><input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="0x... (an enrolled merchant)" />
          <label>Coupon amount (units)</label><input value={amount} onChange={e => setAmount(e.target.value)} />
          <label>Independent authority origin</label><input value={authorityOrigin} onChange={e => setAuthorityOrigin(e.target.value)} placeholder="https://issuer.example" />
          <label>Usage evidence URL</label><input value={usageUrl} onChange={e => setUsageUrl(e.target.value)} placeholder="https://issuer.example/records/coupon.json" />
          <label>Usage evidence SHA-256</label><input value={usageHash} onChange={e => setUsageHash(e.target.value)} placeholder="64 hexadecimal characters" />
          <label>Escrow (GEN)</label><input value={escrow} onChange={e => setEscrow(e.target.value)} placeholder="e.g. 1.5" inputMode="decimal" />
          <button className="btn amber" disabled={!isConnected || !walletClient || !!busy} onClick={onSub}>{isConnected ? "Escrow for judgment" : "Connect a wallet"}</button>
        </div>}

      {netErr && <div className="strip"><WarningCircle size={14} weight="bold" /> Lost the studionet read; retrying every 12s.</div>}
      <div className="foot"><span>Couponwell · on studionet</span><span>{netErr ? "reconnecting" : "live"}</span></div>
      {(busy || note) && <div className="toast">{busy ? `${busy}\u2026` : note}</div>}
    </div>
  );
}
