import { useEffect, useRef } from "react";
import Zdog from "zdog";

// A 3D coupon ticket: rounded card, a perforation seam, two cut notches and a
// teal check. Tilts and rotates gently. Meant to bleed out of the hero, no box.
const INK = "#211d17";
const AMBER = "#d8932b";
const TEAL = "#1f7a6d";
const PAPER = "#f6f1e7";

export function Hero3D() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const illo = new Zdog.Illustration({ element: el, zoom: 1, resize: true });
    const card = new Zdog.Anchor({ addTo: illo, rotate: { x: -0.5, y: -0.6 } });
    new Zdog.RoundedRect({ addTo: card, width: 240, height: 150, cornerRadius: 18, stroke: 10, color: AMBER });
    new Zdog.RoundedRect({ addTo: card, width: 240, height: 150, cornerRadius: 18, stroke: 2, color: INK, translate: { z: -14 } });
    // perforation seam
    for (let y = -56; y <= 56; y += 16) new Zdog.Shape({ addTo: card, path: [{}], stroke: 7, color: INK, translate: { x: 36, y } });
    // cut notches (paper-coloured to read as removed)
    new Zdog.Shape({ addTo: card, path: [{}], stroke: 34, color: PAPER, translate: { x: 36, y: -78 } });
    new Zdog.Shape({ addTo: card, path: [{}], stroke: 34, color: PAPER, translate: { x: 36, y: 78 } });
    // teal check on the stub
    const ck = new Zdog.Anchor({ addTo: card, translate: { x: -52, y: 6, z: 8 } });
    new Zdog.Shape({ addTo: ck, path: [{ x: -16, y: 0 }, { x: -4, y: 14 }, { x: 22, y: -18 }], stroke: 9, color: TEAL, closed: false });

    illo.rotate.x = -0.2;
    let raf = 0; let t = 0;
    const tick = () => {
      t += 0.02; illo.rotate.y = Math.sin(t) * 0.5; card.rotate.z = Math.sin(t * 0.7) * 0.06;
      illo.updateRenderGraph();
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="hero3d" aria-hidden="true" />;
}
