import { useEffect, useState } from "react"

type Phase =
  | "black"        // blank
  | "logo-in"      // DUNBAR INTERPRISE fades/glitches in
  | "logo-hold"    // hold
  | "logo-out"     // fade out
  | "loading"      // loading bar
  | "done"

interface Props { onDone: () => void }

const LOADING_STEPS = [
  "Initializing secure environment…",
  "Loading network protocols…",
  "Mounting file system…",
  "Establishing encrypted tunnel…",
  "Booting The Back Room…",
]

export default function Boot({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("black")
  const [progress, setProgress]  = useState(0)
  const [stepLabel, setStepLabel] = useState(LOADING_STEPS[0])
  const [glitch, setGlitch]  = useState(false)
  const [scanline, setScanline] = useState(true)

  useEffect(() => {
    const seq: Array<[number, () => void]> = [
      [400,  () => setPhase("logo-in")],
      [800,  () => setGlitch(true)],
      [1100, () => setGlitch(false)],
      [1600, () => setGlitch(true)],
      [1900, () => setGlitch(false)],
      [2600, () => setPhase("logo-hold")],
      [3800, () => setPhase("logo-out")],
      [4600, () => { setPhase("loading"); setProgress(0) }],
    ]
    const timers = seq.map(([ms, fn]) => setTimeout(fn, ms))
    return () => timers.forEach(clearTimeout)
  }, [])

  // Loading bar animation
  useEffect(() => {
    if (phase !== "loading") return
    let p = 0
    let stepIdx = 0
    const tick = setInterval(() => {
      const jump = Math.random() * 14 + 4
      p = Math.min(100, p + jump)
      setProgress(Math.floor(p))
      const nextStep = Math.floor((p / 100) * LOADING_STEPS.length)
      if (nextStep !== stepIdx && nextStep < LOADING_STEPS.length) {
        stepIdx = nextStep
        setStepLabel(LOADING_STEPS[stepIdx])
      }
      if (p >= 100) {
        clearInterval(tick)
        setTimeout(() => setScanline(false), 300)
        setTimeout(onDone, 800)
      }
    }, 200)
    return () => clearInterval(tick)
  }, [phase, onDone])

  if (phase === "done") return null

  return (
    <div className={`boot-shell ${scanline ? "boot-scanlines" : ""}`}>
      {/* CRT scanline overlay */}
      <div className="boot-crt" />

      {/* Logo phase */}
      {(phase === "logo-in" || phase === "logo-hold" || phase === "logo-out") && (
        <div className={`boot-logo-wrap boot-logo-${phase}`}>
          <div className={`boot-corp ${glitch ? "boot-glitch" : ""}`}>
            <span className="boot-corp-text" data-text="DUNBAR INTERPRISE">
              DUNBAR INTERPRISE
            </span>
          </div>
          <div className="boot-tagline">[ SECURE SYSTEMS DIVISION ]</div>
          <div className="boot-cursor">▮</div>
        </div>
      )}

      {/* Loading phase */}
      {phase === "loading" && (
        <div className="boot-load-wrap">
          <div className="boot-tbr-logo">
            <BackRoomLogo />
          </div>
          <div className="boot-tbr-title">THE BACK ROOM</div>
          <div className="boot-tbr-sub">DUNBAR INTERPRISE  ·  v1.0.0</div>

          <div className="boot-bar-wrap">
            <div className="boot-bar-track">
              <div className="boot-bar-fill" style={{ width: `${progress}%` }} />
              <div className="boot-bar-shine" style={{ width: `${progress}%` }} />
            </div>
            <div className="boot-bar-pct">{progress}%</div>
          </div>

          <div className="boot-step">{stepLabel}</div>
        </div>
      )}
    </div>
  )
}

function BackRoomLogo() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      {/* Door frame */}
      <rect x="14" y="12" width="44" height="52" rx="2" stroke="#4af" strokeWidth="1.5" opacity="0.3"/>
      {/* Door */}
      <rect x="18" y="16" width="36" height="44" rx="1.5" fill="#0a0a14" stroke="#4af" strokeWidth="1.5"/>
      {/* Door panels */}
      <rect x="22" y="20" width="13" height="17" rx="1" stroke="#4af" strokeWidth="1" opacity="0.5"/>
      <rect x="37" y="20" width="13" height="17" rx="1" stroke="#4af" strokeWidth="1" opacity="0.5"/>
      <rect x="22" y="41" width="28" height="14" rx="1" stroke="#4af" strokeWidth="1" opacity="0.5"/>
      {/* Keyhole */}
      <circle cx="36" cy="36" r="3" fill="#4af" opacity="0.8"/>
      <path d="M34.5 36.5 L33 42 L39 42 L37.5 36.5" fill="#4af" opacity="0.8"/>
      {/* Glow */}
      <circle cx="36" cy="36" r="6" fill="rgba(68,170,255,0.15)"/>
      {/* Corner accents */}
      <path d="M14 20 L8 20 L8 14 L14 14" stroke="#4af" strokeWidth="1" opacity="0.4"/>
      <path d="M58 20 L64 20 L64 14 L58 14" stroke="#4af" strokeWidth="1" opacity="0.4"/>
      <path d="M14 56 L8 56 L8 62 L14 62" stroke="#4af" strokeWidth="1" opacity="0.4"/>
      <path d="M58 56 L64 56 L64 62 L58 62" stroke="#4af" strokeWidth="1" opacity="0.4"/>
    </svg>
  )
}
