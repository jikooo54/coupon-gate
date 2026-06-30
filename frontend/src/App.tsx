import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { parseEther, formatEther } from "viem";
import { Ticket, Storefront, SealCheck, Scales, ArrowsClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Hero3D } from "./Hero3D";
import { BgGeo } from "./BgGeo";
import {
  enrolMerchant, escrowCoupon, attestSettlement, reconcile, finalise,
  getTicket, getMerchant, getCounts, getStakedBalance, listAll,
  TicketView, TicketRow, Merchant,
} from "./contractService";

type Hex = `0x${string}`;
const STATUS_LABEL = ["escrowed", "attested", "reconciled", "finalised"];
function shortAddr(a: string): string { return a && a.length > 12 ? `${a.slice(0, 6)}\u2026${a.slice(-4)}` : a || "-"; }
function gen(w: string): string { if (!w || w === "0") return "0"; try { const v = formatEther(BigInt(w)); const n = Number(v); return n >= 1 ? (Math.round(n * 1000) / 1000).toString() : v; } catch { return "0"; } }

export function App() {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;
  const [showEnrol, setShowEnrol] = useState(false); const [showSub, setShowSub] = useState(false);
  const [mName, setMName] = useState(""); const [mStake, setMStake] = useState("");
  const [merchant, setMerchant] = useState(""); const [merchantName, setMerchantName] = useState(""); const [amount, setAmount] = useState("100"); const [usage, setUsage] = useState(""); const [escrow, setEscrow] = useState("");
  const [paymentProof, setPaymentProof] = useState("");
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
  async function pick(id: number) { setSelId(id); setPaymentProof(""); try { const t = await getTicket(id); setSel(t); setSelM(await getMerchant(t.merchant)); } catch { setSel(null); } }
  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> { setBusy(label); setNote(""); try { return await fn(); } catch (e) { setNote(String((e as Error).message || e).slice(0, 200)); return undefined; } finally { setBusy(null); refreshAll(); } }
  async function onEnrol() { if (!acct) return; if (mName.trim().length < 2) return setNote("Merchant name required."); if (!(Number(mStake) > 0)) return setNote("Stake in GEN, e.g. 1."); await run("Enrolling merchant", () => enrolMerchant(acct!, mName, parseEther(mStake.trim()))); setMStake(""); setShowEnrol(false); }
  async function onSub() { if (!acct) return; if (!/^0x[0-9a-fA-F]{40}$/.test(merchant.trim())) return setNote("Merchant 0x address."); if (merchantName.trim().length < 2) return setNote("Merchant name."); if (!/^\d+$/.test(amount.trim())) return setNote("Coupon amount integer."); if (usage.trim().length < 30) return setNote("Usage proof >= 30 chars."); if (!(Number(escrow) > 0)) return setNote("Escrow in GEN."); const id = await run("Escrowing coupon", () => escrowCoupon(acct!, merchant, merchantName, BigInt(amount), usage, parseEther(escrow.trim()))); if (id != null) { setSelId(id); setMerchant(""); setMerchantName(""); setUsage(""); setEscrow(""); setShowSub(false); } }
  async function onAttest() { if (!acct || selId == null) return; if (paymentProof.trim().length < 30) return setNote("Payment proof >= 30 chars."); await run("Attesting settlement", () => attestSettlement(acct!, selId!, paymentProof)); setPaymentProof(""); }
  async function onReconcile() { if (acct && selId != null) await run("Reconciling (two-pass)", () => reconcile(acct!, selId!)); }
  async function onFinalise() { if (acct && selId != null) await run("Finalising", () => finalise(acct!, selId!)); }

  const isSelMerchant = !!(sel && acct && sel.merchant.toLowerCase() === acct.toLowerCase());
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
          <p className="lede">Merchants post an honour stake; a holder escrows the claim and the merchant attests settlement. A two-pass panel weighs authenticity and the validated amount, then pays the merchant or refunds the holder. A false attestation is slashed.</p>
          <p className="src">Proofs live on-chain, judged by GenLayer validators via <code>gl.nondet</code>.</p>
        </div>
      </section>

      <div className="stats">
        <div className="stat"><b>{counts.next}</b><span>coupons</span></div>
        <div className="stat"><b>{counts.valid}</b><span>valid / {counts.reconciled} ruled</span></div>
        <div className="stat"><b>{validRate}<i>%</i></b><span>honour rate</span></div>
        <div className="stat"><b>{gen(staked)}<i>GEN</i></b><span>merchant stake</span></div>
      </div>

      <div className="sec-h"><Storefront size={18} weight="bold" /><h2>Merchant desk</h2><span className="mut">{enrolled ? `enrolled \u00b7 honour ${myM!.honorScore}/1000` : "stake to accept coupons"}</span></div>
      {!showEnrol ? <button className="btn ghost" onClick={() => setShowEnrol(true)}><SealCheck size={15} weight="bold" /> {enrolled ? "Top up / rename" : "Enrol as merchant"}</button>
        : <div className="panel"><label>Merchant name</label><input value={mName} onChange={e => setMName(e.target.value)} placeholder={myM?.name || "brand / store"} /><label>Honour stake (GEN)</label><input value={mStake} onChange={e => setMStake(e.target.value)} placeholder="e.g. 1" inputMode="decimal" /><button className="btn amber" disabled={!isConnected || !!busy} onClick={onEnrol}>Stake and enrol</button></div>}

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
          {sel.usageProof && <div className="evid"><div className="l">usage proof</div><pre>{sel.usageProof}</pre></div>}
          {sel.paymentProof && <div className="evid"><div className="l">payment proof</div><pre>{sel.paymentProof}</pre></div>}
          {sel.rationale && <p className="why">{sel.rationale}</p>}
          <div className="actions">
            {sel.status === 0 && isSelMerchant && <div style={{ flex: 1 }}><label>Payment proof (30+ chars)</label><textarea value={paymentProof} onChange={e => setPaymentProof(e.target.value)} placeholder="Settlement batch, tx id, amount, matching receipt." /><button className="btn" disabled={!isConnected || !!busy} onClick={onAttest}><SealCheck size={15} weight="bold" /> Attest settlement</button></div>}
            {sel.status === 0 && !isSelMerchant && <p className="quiet">Awaiting the merchant ({shortAddr(sel.merchant)}) to attest.</p>}
            {sel.status === 1 && <button className="btn" disabled={!isConnected || !!busy} onClick={onReconcile}><Scales size={15} weight="bold" /> Reconcile (two-pass)</button>}
            {sel.status === 2 && <button className="btn amber" disabled={!isConnected || !!busy} onClick={onFinalise}><ArrowsClockwise size={15} weight="bold" /> Finalise escrow</button>}
            {sel.status === 3 && <p className="quiet"><CheckCircle size={15} weight="fill" /> Settled. {sel.outcome === "VALID" ? "Escrow paid to the merchant." : "Escrow refunded to the holder."}</p>}
          </div>
        </div>
      )}

      <div className="sec-h"><Ticket size={18} weight="bold" /><h2>Escrow a coupon</h2></div>
      {!showSub ? <button className="btn ghost" onClick={() => setShowSub(true)}><Ticket size={15} weight="bold" /> New coupon</button>
        : <div className="panel">
          <label>Merchant address</label><input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="0x... (an enrolled merchant)" />
          <label>Merchant name</label><input value={merchantName} onChange={e => setMerchantName(e.target.value)} placeholder="brand / store" />
          <label>Coupon amount (units)</label><input value={amount} onChange={e => setAmount(e.target.value)} />
          <label>Usage proof (30+ chars)</label><textarea value={usage} onChange={e => setUsage(e.target.value)} placeholder="Receipt, redemption ref, date." />
          <label>Escrow (GEN)</label><input value={escrow} onChange={e => setEscrow(e.target.value)} placeholder="e.g. 1.5" inputMode="decimal" />
          <button className="btn amber" disabled={!isConnected || !!busy} onClick={onSub}>{isConnected ? "Escrow for judgment" : "Connect a wallet"}</button>
        </div>}

      {netErr && <div className="strip"><WarningCircle size={14} weight="bold" /> Lost the studionet read; retrying every 12s.</div>}
      <div className="foot"><span>Couponwell · on studionet</span><span>{netErr ? "reconnecting" : "live"}</span></div>
      {(busy || note) && <div className="toast">{busy ? `${busy}\u2026` : note}</div>}
    </div>
  );
}
