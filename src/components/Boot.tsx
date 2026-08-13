import { useEffect, useState, useRef } from "react"

type Phase = "dark" | "symbol" | "name" | "hold" | "out" | "loading"

const LOAD_STEPS = [
  "Initializing environment…",
  "Loading your space…",
  "Connecting…",
  "Almost ready…",
  "Welcome.",
]

export default function Boot({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("dark")
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const t = (ms: number, fn: () => void) => setTimeout(fn, ms)
    const ids = [
      t(400,  () => setPhase("symbol")),
      t(1400, () => setPhase("name")),
      t(3000, () => setPhase("hold")),
      t(4000, () => setPhase("out")),
      t(4800, () => setPhase("loading")),
    ]
    return () => ids.forEach(clearTimeout)
  }, [])

  // Particle canvas for boot screen
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    let raf = 0

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const particles: Array<{ x: number; y: number; vx: number; vy: number; r: number; alpha: number }> = []
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - .5) * .4,
        vy: (Math.random() - .5) * .4,
        r: Math.random() * 1.5 + .3,
        alpha: Math.random() * .4 + .1,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(100,180,255,${p.alpha})`
        ctx.fill()
      })
      // draw faint connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(80,160,255,${.12 * (1 - dist / 120)})`
            ctx.lineWidth = .6
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(raf) }
  }, [])

  // Progress bar
  useEffect(() => {
    if (phase !== "loading") return
    let p = 0
    const tick = setInterval(() => {
      p += Math.random() * 14 + 4
      if (p >= 100) { p = 100; clearInterval(tick); setTimeout(onDone, 600) }
      setProgress(Math.floor(p))
      setStep(Math.min(LOAD_STEPS.length - 1, Math.floor((p / 100) * LOAD_STEPS.length)))
    }, 200)
    return () => clearInterval(tick)
  }, [phase, onDone])

  const logoVisible  = phase === "symbol" || phase === "name" || phase === "hold"
  const nameVisible  = phase === "name"   || phase === "hold"
  const fading       = phase === "out"

  return (
    <div className={`boot ${fading ? "boot--out" : ""}`}>
      <canvas ref={canvasRef} className="boot-canvas" />

      {/* Ambient radial glow */}
      <div className={`boot-glow ${logoVisible ? "boot-glow--on" : ""}`} />

      {phase !== "loading" ? (
        <div className="boot-center">
          {/* Logo symbol */}
          <div className={`boot-symbol ${logoVisible ? "boot-symbol--in" : ""}`}>
            <TBRSymbol />
          </div>

          {/* Wordmark */}
          <div className={`boot-wordmark ${nameVisible ? "boot-wordmark--in" : ""}`}>
            <span className="boot-wm-the">the</span>
            <span className="boot-wm-main">Back Room</span>
          </div>

          <div className={`boot-corp ${nameVisible ? "boot-corp--in" : ""}`}>
            DUNBAR INTERPRISE
          </div>
        </div>
      ) : (
        <div className="boot-loading">
          <div className="boot-load-symbol"><TBRSymbol size={52} /></div>
          <div className="boot-load-title">The Back Room</div>
          <div className="boot-load-sub">DUNBAR INTERPRISE</div>
          <div className="boot-load-bar-wrap">
            <div className="boot-load-bar">
              <div className="boot-load-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="boot-load-pct">{progress}%</span>
          </div>
          <div className="boot-load-step">{LOAD_STEPS[step]}</div>
        </div>
      )}
    </div>
  )
}

/* ── The Back Room Symbol ────────────────────────────────────────────
   A stylised keyhole inside a hexagon frame — chill, geometric, iconic
──────────────────────────────────────────────────────────────────── */
export function TBRSymbol({ size = 80 }: { size?: number }) {
  const s = size
  const cx = s / 2, cy = s / 2
  const R = s * 0.44   // outer hex radius
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30)
    return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`
  }).join(" ")

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" className="tbr-symbol-svg">
      {/* Outer hex ring */}
      <polygon points={pts} stroke="currentColor" strokeWidth={s * .025} opacity=".25" />
      {/* Inner hex */}
      <polygon points={
        Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 180) * (60 * i - 30)
          const r = R * .76
          return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
        }).join(" ")
      } stroke="currentColor" strokeWidth={s * .02} opacity=".5" />

      {/* Door silhouette */}
      <rect
        x={cx - s * .14} y={cy - s * .22}
        width={s * .28} height={s * .38}
        rx={s * .025}
        stroke="currentColor" strokeWidth={s * .022} opacity=".7"
      />

      {/* Keyhole circle */}
      <circle cx={cx} cy={cy - s * .05} r={s * .072} fill="currentColor" opacity=".9" />
      {/* Keyhole slot */}
      <path
        d={`M ${cx - s * .045} ${cy - s * .04} L ${cx - s * .06} ${cy + s * .12} L ${cx + s * .06} ${cy + s * .12} L ${cx + s * .045} ${cy - s * .04}`}
        fill="currentColor" opacity=".9"
      />

      {/* Corner tick marks */}
      {[0, 1, 2, 3].map(i => {
        const a = (Math.PI / 180) * (90 * i + 45)
        const r1 = R * 1.12, r2 = R * 1.22
        return (
          <line key={i}
            x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)}
            x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)}
            stroke="currentColor" strokeWidth={s * .018} opacity=".35"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}
