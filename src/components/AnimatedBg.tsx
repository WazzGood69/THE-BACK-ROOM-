import { useEffect, useRef } from "react"
import { Theme } from "../types"
import { BgStyle } from "./Settings"

interface Props { style: BgStyle; theme: Theme }

export default function AnimatedBg({ style, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (style === "none") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    let raf = 0, t = 0

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener("resize", resize)

    // Color config per theme
    const isDark = theme === "black"
    const isXP   = theme === "oldschool"

    const blobColors = isDark
      ? ["rgba(60,100,220,", "rgba(80,50,200,", "rgba(40,120,200,"]
      : isXP
        ? ["rgba(30,100,180,", "rgba(10,60,140,", "rgba(50,130,200,"]
        : ["rgba(100,140,255,", "rgba(140,100,255,", "rgba(80,160,255,"]

    const blobs = [
      { x: .2, y: .3, r: .5, vx: .0003, vy: .0002, phase: 0 },
      { x: .8, y: .6, r: .45, vx: -.0002, vy: .0003, phase: 2 },
      { x: .5, y: .8, r: .4, vx: .0001, vy: -.0002, phase: 4 },
    ]

    const drawBlobs = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      blobs.forEach((b, i) => {
        const x = (b.x + Math.sin(t * .3 + b.phase) * .12) * canvas.width
        const y = (b.y + Math.cos(t * .25 + b.phase) * .1) * canvas.height
        const r = b.r * Math.max(canvas.width, canvas.height)
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, blobColors[i] + (isDark ? ".12)" : ".08)"))
        grad.addColorStop(1, blobColors[i] + "0)")
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      })
    }

    const drawGrid = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const sz = 40
      const offX = (t * 20) % sz
      const offY = (t * 10) % sz
      const c = isDark ? "rgba(80,140,255," : "rgba(60,80,200,"
      ctx.strokeStyle = c + ".06)"
      ctx.lineWidth = 1
      for (let x = -sz + offX; x < canvas.width + sz; x += sz) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
      }
      for (let y = -sz + offY; y < canvas.height + sz; y += sz) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
      }
      // Intersection dots
      ctx.fillStyle = c + ".18)"
      for (let x = -sz + offX; x < canvas.width + sz; x += sz)
        for (let y = -sz + offY; y < canvas.height + sz; y += sz) {
          ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill()
        }
    }

    const drawNoise = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // Draw noise via randomized tiny rects — subtle
      const imgData = ctx.createImageData(canvas.width, canvas.height)
      const d = imgData.data
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() > .98 ? (isDark ? 60 : 200) : 0
        d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = v ? 30 : 0
      }
      ctx.putImageData(imgData, 0, 0)
    }

    const tick = () => {
      t += 0.005
      if (style === "blobs") drawBlobs()
      else if (style === "grid") drawGrid()
      else if (style === "noise") drawNoise()
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(raf) }
  }, [style, theme])

  if (style === "none") return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", inset: 0, zIndex: 0,
        pointerEvents: "none", opacity: 1,
      }}
    />
  )
}
