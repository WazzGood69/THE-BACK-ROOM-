import { useEffect, useState } from "react"

type Phase = "dark" | "line" | "text" | "hold" | "fade" | "loading" | "done"

const STEPS = [
  "Warming up…",
  "Loading your space…",
  "Almost there…",
  "Welcome back.",
]

export default function Boot({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("dark")
  const [progress, setProgress] = useState(0)
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    const T = (ms: number, fn: () => void) => setTimeout(fn, ms)
    const timers = [
      T(300,  () => setPhase("line")),
      T(900,  () => setPhase("text")),
      T(2400, () => setPhase("hold")),
      T(3400, () => setPhase("fade")),
      T(4200, () => setPhase("loading")),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (phase !== "loading") return
    let p = 0
    const tick = setInterval(() => {
      p += Math.random() * 18 + 5
      if (p > 100) p = 100
      setProgress(Math.floor(p))
      setStepIdx(Math.min(STEPS.length - 1, Math.floor((p / 100) * STEPS.length)))
      if (p >= 100) {
        clearInterval(tick)
        setTimeout(onDone, 700)
      }
    }, 220)
    return () => clearInterval(tick)
  }, [phase, onDone])

  if (phase === "done") return null

  return (
    <div className={`boot ${phase === "fade" ? "boot--fading" : ""}`}>
      {/* Ambient glow */}
      <div className={`boot-glow ${phase !== "dark" ? "boot-glow--on" : ""}`} />

      {phase === "loading" ? (
        <div className="boot-loading">
          <DoorMark />
          <div className="boot-load-name">The Back Room</div>
          <div className="boot-load-corp">Dunbar Interprise</div>
          <div className="boot-load-bar-wrap">
            <div className="boot-load-bar">
              <div className="boot-load-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="boot-load-step">{STEPS[stepIdx]}</div>
        </div>
      ) : (
        <div className={`boot-intro ${phase === "line" || phase === "text" || phase === "hold" ? "boot-intro--visible" : ""}`}>
          <div className={`boot-line ${phase !== "dark" ? "boot-line--drawn" : ""}`} />
          <div className={`boot-wordmark ${phase === "text" || phase === "hold" ? "boot-wordmark--in" : ""}`}>
            <span className="boot-wm-the">the</span>
            <span className="boot-wm-name">Back Room</span>
          </div>
          <div className={`boot-corp-label ${phase === "text" || phase === "hold" ? "boot-corp-label--in" : ""}`}>
            DUNBAR INTERPRISE
          </div>
        </div>
      )}
    </div>
  )
}

function DoorMark() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" className="boot-door">
      <rect x="10" y="6" width="32" height="40" rx="2" stroke="currentColor" strokeWidth="1.5" opacity=".35"/>
      <rect x="13" y="9" width="26" height="34" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".7"/>
      <rect x="16" y="12" width="10" height="14" rx="1" stroke="currentColor" strokeWidth="1" opacity=".45"/>
      <rect x="28" y="12" width="9" height="14" rx="1" stroke="currentColor" strokeWidth="1" opacity=".45"/>
      <rect x="16" y="29" width="21" height="10" rx="1" stroke="currentColor" strokeWidth="1" opacity=".45"/>
      <circle cx="26" cy="26" r="3.5" fill="currentColor" opacity=".75"/>
      <path d="M24.5 27 L23.5 33 L28.5 33 L27.5 27" fill="currentColor" opacity=".75"/>
    </svg>
  )
}
