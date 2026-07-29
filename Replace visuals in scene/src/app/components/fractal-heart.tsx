// ============================================================
// The star of the show: a persistent, luminous fractal-string
// heart with cyan (left) / pink (right) volumetric lighting and
// rolling mist along the bottom — rendered to a 2D canvas.
// ============================================================

const CYAN = "0,255,196";
const PINK = "255,90,190";

// Parametric heart curve, upright, normalized to roughly [-1,1].
function heartPoint(t: number): [number, number] {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  return [x / 16, y / 16];
}

export interface HeartEnergy {
  p1: number; // 0..1 cyan intensity (player 1 activity)
  p2: number; // 0..1 pink intensity (player 2 activity)
  pulse: number; // 0..1 transient burst on chord change
}

// ---- Rolling volumetric mist along the bottom ----
type Mist = { x: number; y: number; r: number; cyan: boolean; vx: number; vy: number; a: number };
let mists: Mist[] = [];

export function initMist(w: number, h: number) {
  mists = [];
  for (let i = 0; i < 16; i++) {
    mists.push({
      x: Math.random() * w,
      y: h - 30 - Math.random() * 90,
      r: 140 + Math.random() * 120,
      cyan: i % 2 === 0,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.12,
      a: 0.1 + Math.random() * 0.06,
    });
  }
}

function drawMist(ctx: CanvasRenderingContext2D, w: number, h: number, energy: HeartEnergy) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const m of mists) {
    m.x += m.vx;
    m.y += m.vy;
    if (m.x < -m.r) m.x = w + m.r;
    if (m.x > w + m.r) m.x = -m.r;
    if (m.y < h * 0.62) m.vy = Math.abs(m.vy);
    if (m.y > h) m.vy = -Math.abs(m.vy);
    const boost = m.cyan ? energy.p1 : energy.p2;
    const alpha = m.a * (0.6 + boost * 0.9);
    const color = m.cyan ? CYAN : PINK;
    const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- Side light beams (cyan from left, pink from right) ----
function drawBeams(ctx: CanvasRenderingContext2D, w: number, h: number, energy: HeartEnergy) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const left = ctx.createLinearGradient(0, 0, w * 0.55, 0);
  left.addColorStop(0, `rgba(${CYAN},${0.16 + energy.p1 * 0.22})`);
  left.addColorStop(1, `rgba(${CYAN},0)`);
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, w, h);

  const right = ctx.createLinearGradient(w, 0, w * 0.45, 0);
  right.addColorStop(0, `rgba(${PINK},${0.16 + energy.p2 * 0.22})`);
  right.addColorStop(1, `rgba(${PINK},0)`);
  ctx.fillStyle = right;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---- The fractal string heart ----
export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  energy: HeartEnergy
) {
  drawBeams(ctx, w, h, energy);

  const cx = w / 2;
  const cy = h * 0.47;
  const activity = 0.5 + 0.5 * Math.max(energy.p1, energy.p2);
  const breathe = 1 + Math.sin(time * 1.4) * 0.02 + energy.pulse * 0.08;
  const scale = Math.min(w, h) * 0.24 * breathe;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = "lighter";

  // Soft core halo
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 2.1);
  halo.addColorStop(0, `rgba(255,255,255,${0.12 + energy.pulse * 0.2})`);
  halo.addColorStop(0.35, `rgba(${CYAN},${0.06 + energy.p1 * 0.08})`);
  halo.addColorStop(0.65, `rgba(${PINK},${0.06 + energy.p2 * 0.08})`);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, scale * 2.1, 0, Math.PI * 2);
  ctx.fill();

  // Left→right cyan-to-pink gradient stroke shared by the strands
  const grad = ctx.createLinearGradient(-scale, 0, scale, 0);
  grad.addColorStop(0, `rgba(${CYAN},0.9)`);
  grad.addColorStop(0.5, `rgba(220,255,255,0.85)`);
  grad.addColorStop(1, `rgba(${PINK},0.9)`);

  const LAYERS = 16;
  const STEPS = 220;
  for (let layer = 0; layer < LAYERS; layer++) {
    const f = layer / (LAYERS - 1); // 0 outer .. 1 inner
    const s = scale * (1 - f * 0.82);
    const rot = Math.sin(time * 0.5 + layer * 0.6) * 0.05 * (1 - f);
    const wobble = 1 + Math.sin(time * 2 + layer) * 0.015;
    const lineAlpha = (0.10 + (1 - f) * 0.35) * activity;

    ctx.save();
    ctx.rotate(rot);
    ctx.lineWidth = (0.6 + (1 - f) * 2.4) * breathe;
    ctx.strokeStyle = grad;
    ctx.globalAlpha = lineAlpha;
    ctx.shadowBlur = 18 + (1 - f) * 26;
    ctx.shadowColor = layer % 2 === 0 ? `rgba(${CYAN},0.9)` : `rgba(${PINK},0.9)`;

    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const t = (i / STEPS) * Math.PI * 2;
      const [hx, hy] = heartPoint(t);
      // Filament shimmer distortion for the "energy strings" look
      const noise = Math.sin(t * 7 + time * 3 + layer * 1.3) * 0.012 * (1 - f);
      const px = (hx + noise) * s * wobble;
      const py = (hy + noise) * s * wobble;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Flowing spark particles travelling along the heart outline
  const SPARKS = 46;
  for (let i = 0; i < SPARKS; i++) {
    const prog = (i / SPARKS + time * 0.12) % 1;
    const t = prog * Math.PI * 2;
    const [hx, hy] = heartPoint(t);
    const ring = 0.82 + ((i * 0.37) % 0.18);
    const px = hx * scale * ring;
    const py = hy * scale * ring;
    const sparkA = (0.4 + 0.6 * Math.sin(time * 4 + i)) * activity;
    const isCyan = hx < 0;
    const color = isCyan ? CYAN : PINK;
    ctx.globalAlpha = sparkA;
    ctx.shadowBlur = 12;
    ctx.shadowColor = `rgba(${color},1)`;
    ctx.fillStyle = `rgba(255,255,255,0.95)`;
    ctx.beginPath();
    ctx.arc(px, py, 1.4 + Math.sin(time * 5 + i) * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  drawMist(ctx, w, h, energy);
}
