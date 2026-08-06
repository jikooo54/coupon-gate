import { useEffect, useRef } from "react";

// Couponwell background: drifting diagonal dashed "perforation" seams + faint
// ticket notches. Amber/ink on warm paper. Canvas-2D, reduced-motion safe.
export function BgGeo() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0, t = 0;
    const resize = () => { W = window.innerWidth; H = window.innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener("resize", resize);
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const gap = 150; const off = (t * 14) % gap;
      ctx.lineCap = "round";
      // diagonal perforation seams (dashed)
      for (let d = -H; d < W + H; d += gap) {
        const x0 = d + off;
        ctx.strokeStyle = "rgba(33,29,23,0.05)"; ctx.lineWidth = 1.5; ctx.setLineDash([2, 12]);
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 - H, H); ctx.stroke();
      }
      ctx.setLineDash([]);
      // a few amber notch rings drifting
      for (let i = 0; i < 5; i++) {
        const x = ((i * 320 + t * 8) % (W + 200)) - 100;
        const y = (i * 0.21 + 0.12) * H + Math.sin(t * 0.3 + i) * 16;
        ctx.strokeStyle = "rgba(216,147,43,0.10)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.stroke();
      }
      if (!reduce) { t += 0.02; raf = requestAnimationFrame(draw); }
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="bg-geo" aria-hidden="true" />;
}
