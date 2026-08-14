import { useEffect, useState, useRef } from "react"
import hologramGif from "@/imports/hologram_head.gif"

// ── Phase flow ──────────────────────────────────────────────────────
// dunbar → dunbar-hold → dunbar-out → dark → symbol → name → hold → out → loading
type Phase = "dunbar" | "dunbar-hold" | "dunbar-out" | "dark" | "symbol" | "name" | "hold" | "out" | "loading"

const LOAD_STEPS = [
  "Warming up…",
  "Loading your space…",
  "Connecting…",
  "Almost ready…",
  "Welcome.",
]

export default function Boot({ onDone }: { onDone: () => void }) {
  const [phase, setPhase]     = useState<Phase>("dunbar")
  const [progress, setProgress] = useState(0)
  const [step, setStep]       = useState(0)
  const canvasRef             = useRef<HTMLCanvasElement>(null)
  const glitchRef             = useRef<ReturnType<typeof setInterval> | null>(null)
  const [glitchOffset, setGlitchOffset] = useState(0)

  // ── Timing chain ──────────────────────────────────────────────────
  useEffect(() => {
    const t = (ms: number, fn: () => void) => setTimeout(fn, ms)
    const ids = [
      t(200,  () => setPhase("dunbar")),
      t(1200, () => setPhase("dunbar-hold")),
      t(3800, () => setPhase("dunbar-out")),
      t(4600, () => setPhase("dark")),
      t(5100, () => setPhase("symbol")),
      t(6100, () => setPhase("name")),
      t(7200, () => setPhase("hold")),
      t(8200, () => setPhase("out")),
      t(9000, () => setPhase("loading")),
    ]
    return () => ids.forEach(clearTimeout)
  }, [])

  // ── Glitch text animation during Dunbar phase ─────────────────────
  useEffect(() => {
    if (phase === "dunbar" || phase === "dunbar-hold") {
      glitchRef.current = setInterval(() => {
        setGlitchOffset(Math.random() > .85 ? (Math.random() - .5) * 8 : 0)
      }, 80)
    } else {
      if (glitchRef.current) clearInterval(glitchRef.current)
      setGlitchOffset(0)
    }
    return () => { if (glitchRef.current) clearInterval(glitchRef.current) }
  }, [phase])

  // ── Particle canvas (TBR boot phase) ─────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    let raf = 0
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener("resize", resize)

    const particles: Array<{ x:number; y:number; vx:number; vy:number; r:number; alpha:number }> = []
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
        vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
        r: Math.random() * 1.5 + .3, alpha: Math.random() * .4 + .1,
      })
    }
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(100,180,255,${p.alpha})`; ctx.fill()
      })
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx*dx + dy*dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(80,160,255,${.12*(1-dist/120)})`
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

  // ── Progress bar ──────────────────────────────────────────────────
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

  const isDunbar   = phase === "dunbar" || phase === "dunbar-hold"
  const dunbarOut  = phase === "dunbar-out"
  const tbrFading  = phase === "out"
  const logoVis    = phase === "symbol" || phase === "name" || phase === "hold"
  const nameVis    = phase === "name" || phase === "hold"

  return (
    <>
      {/* ── DUNBAR INTERPRISE INTRO ─────────────────────────────── */}
      <div className={`dunbar-screen ${isDunbar ? "dunbar-screen--in" : ""} ${dunbarOut ? "dunbar-screen--out" : ""}`}>
        {/* Scanline overlay */}
        <div className="dunbar-scanlines" />

        {/* Corner brackets */}
        <div className="dunbar-bracket dunbar-bracket--tl" />
        <div className="dunbar-bracket dunbar-bracket--tr" />
        <div className="dunbar-bracket dunbar-bracket--bl" />
        <div className="dunbar-bracket dunbar-bracket--br" />

        {/* Hologram face */}
        <div className={`dunbar-holo-wrap ${isDunbar ? "dunbar-holo--in" : ""}`}>
          <img
            src={hologramGif as string}
            alt="Dunbar"
            className="dunbar-holo-img"
            draggable={false}
          />
          <div className="dunbar-holo-ring" />
        </div>

        {/* Corp name */}
        <div
          className={`dunbar-corp-name ${isDunbar ? "dunbar-corp--in" : ""}`}
          style={{ transform: `translate(${glitchOffset}px, 0)` }}
        >
          DUNBAR INTERPRISE
        </div>

        {/* Tagline */}
        <div className={`dunbar-tagline ${phase === "dunbar-hold" ? "dunbar-tagline--in" : ""}`}>
          PRIVATE OPERATING SYSTEM ·  EST. 2024
        </div>

        {/* Status line */}
        <div className="dunbar-status-line">
          {phase === "dunbar-hold" ? "SYSTEM INITIALIZED ▮" : "BOOTING ▮"}
        </div>
      </div>

      {/* ── THE BACK ROOM BOOT ───────────────────────────────────── */}
      <div className={`boot ${tbrFading ? "boot--out" : ""} ${isDunbar || dunbarOut ? "boot--hidden" : ""}`}>
        <canvas ref={canvasRef} className="boot-canvas" />
        <div className={`boot-glow ${logoVis ? "boot-glow--on" : ""}`} />

        {phase !== "loading" ? (
          <div className="boot-center">
            <div className={`boot-symbol ${logoVis ? "boot-symbol--in" : ""}`}>
              <TBRSymbol />
            </div>
            <div className={`boot-wordmark ${nameVis ? "boot-wordmark--in" : ""}`}>
              <span className="boot-wm-the">the</span>
              <span className="boot-wm-main">Back Room</span>
            </div>
            <div className={`boot-corp ${nameVis ? "boot-corp--in" : ""}`}>
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
    </>
  )
}

/* ── The Back Room Symbol ─────────────────────────────────────────── */
export function TBRSymbol({ size = 80 }: { size?: number }) {
  const s = size, cx = s / 2, cy = s / 2, R = s * 0.44
  const hex = (r: number) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30)
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
  }).join(" ")
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" className="tbr-symbol-svg">
      <polygon points={hex(R)} stroke="currentColor" strokeWidth={s*.025} opacity=".25" />
      <polygon points={hex(R*.76)} stroke="currentColor" strokeWidth={s*.02} opacity=".5" />
      <rect x={cx-s*.14} y={cy-s*.22} width={s*.28} height={s*.38} rx={s*.025} stroke="currentColor" strokeWidth={s*.022} opacity=".7" />
      <circle cx={cx} cy={cy-s*.05} r={s*.072} fill="currentColor" opacity=".9" />
      <path d={`M ${cx-s*.045} ${cy-s*.04} L ${cx-s*.06} ${cy+s*.12} L ${cx+s*.06} ${cy+s*.12} L ${cx+s*.045} ${cy-s*.04}`} fill="currentColor" opacity=".9" />
      {[0,1,2,3].map(i => {
        const a = (Math.PI/180)*(90*i+45), r1=R*1.12, r2=R*1.22
        return <line key={i} x1={cx+r1*Math.cos(a)} y1={cy+r1*Math.sin(a)} x2={cx+r2*Math.cos(a)} y2={cy+r2*Math.sin(a)} stroke="currentColor" strokeWidth={s*.018} opacity=".35" strokeLinecap="round" />
      })}
    </svg>
  )
}
