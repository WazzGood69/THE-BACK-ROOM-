import { Theme } from "../types"

interface Props {
  theme: Theme
  onTheme: (t: Theme) => void
  username: string
  avatar: string
}

export default function Taskbar({ theme, onTheme, username, avatar }: Props) {
  const [time, setTime] = React.useState(new Date())
  React.useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])

  const hh = time.getHours(), mm = String(time.getMinutes()).padStart(2, "0")
  const ampm = hh >= 12 ? "PM" : "AM"
  const h12 = hh % 12 || 12

  return (
    <div className="taskbar">
      {/* Logo / Start */}
      <div className="taskbar-start">
        <BackRoomMark />
        <span className="taskbar-brand">The Back Room</span>
      </div>

      {/* Center spacer */}
      <div className="taskbar-center">
        <span className="taskbar-user">{avatar} @{username}</span>
      </div>

      {/* Right: theme + clock */}
      <div className="taskbar-right">
        <div className="theme-picker">
          <span className="theme-label">Theme</span>
          {(["black","white","oldschool"] as Theme[]).map(t => (
            <button
              key={t}
              className={`theme-btn theme-btn--${t} ${theme === t ? "theme-btn--on" : ""}`}
              onClick={() => onTheme(t)}
              title={t.charAt(0).toUpperCase() + t.slice(1)}
            >
              {t === "black" ? "◼" : t === "white" ? "◻" : "🖥"}
            </button>
          ))}
        </div>
        <div className="taskbar-clock">
          <span className="taskbar-time">{h12}:{mm} {ampm}</span>
          <span className="taskbar-date">
            {time.toLocaleDateString("en-US", { month:"short", day:"numeric" })}
          </span>
        </div>
      </div>
    </div>
  )
}

import React from "react"

function BackRoomMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
      <rect x="8" y="6" width="20" height="24" rx="1" fill="transparent" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="10" y="8" width="7" height="9" rx=".8" stroke="currentColor" strokeWidth=".9" opacity="0.6"/>
      <rect x="19" y="8" width="7" height="9" rx=".8" stroke="currentColor" strokeWidth=".9" opacity="0.6"/>
      <rect x="10" y="20" width="16" height="7" rx=".8" stroke="currentColor" strokeWidth=".9" opacity="0.6"/>
      <circle cx="18" cy="18" r="2" fill="currentColor" opacity="0.9"/>
      <path d="M17 18.5 L16.2 22 L19.8 22 L19 18.5" fill="currentColor" opacity="0.9"/>
    </svg>
  )
}
