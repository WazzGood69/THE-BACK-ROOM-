import React from "react"
import { Theme } from "../types"
import { TBRSymbol } from "./Boot"

interface Props {
  theme: Theme
  onTheme: (t: Theme) => void
  username: string
  avatar: string
  onSettings: () => void
}

export default function Taskbar({ theme, onTheme, username, avatar, onSettings }: Props) {
  const [time, setTime] = React.useState(new Date())
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const hh = time.getHours()
  const mm = String(time.getMinutes()).padStart(2, "0")
  const ampm = hh >= 12 ? "PM" : "AM"
  const h12 = hh % 12 || 12

  return (
    <div className="taskbar">
      {/* Brand */}
      <div className="taskbar-brand">
        <TBRSymbol size={22} />
        <span className="taskbar-name">The Back Room</span>
      </div>

      {/* Center — user chip */}
      <div className="taskbar-mid">
        <span className="taskbar-user-chip">{avatar} @{username}</span>
      </div>

      {/* Right controls */}
      <div className="taskbar-right">
        {/* Theme switcher */}
        <div className="theme-switcher">
          {(["black","white","oldschool"] as Theme[]).map(t => (
            <button key={t}
              className={`theme-dot theme-dot--${t} ${theme === t ? "theme-dot--on" : ""}`}
              onClick={() => onTheme(t)}
              title={{ black:"Graphite", white:"Cloud", oldschool:"Old School" }[t]}
              aria-label={t}
            />
          ))}
        </div>

        {/* Settings gear */}
        <button className="taskbar-gear" onClick={onSettings} title="Settings" aria-label="Settings">
          ⚙
        </button>

        {/* Clock */}
        <div className="taskbar-clock">
          <span className="taskbar-time">{h12}:{mm} <span className="taskbar-ampm">{ampm}</span></span>
          <span className="taskbar-date">
            {time.toLocaleDateString("en-US", { month:"short", day:"numeric" })}
          </span>
        </div>
      </div>
    </div>
  )
}
