import { useState, useEffect } from "react"
import Boot     from "./components/Boot"
import Setup    from "./components/Setup"
import Browser  from "./components/Browser"
import Messenger from "./components/Messenger"
import Taskbar  from "./components/Taskbar"
import { User, Theme } from "./types"
import { getMe, setMe, getTheme, setTheme as saveTheme, hasBooted, markBooted } from "./store"

type AppPhase = "booting" | "setup" | "ready"

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("booting")
  const [user, setUser]   = useState<User | null>(null)
  const [theme, setThemeState] = useState<Theme>("black")

  useEffect(() => {
    setThemeState(getTheme())
    const me = getMe()
    if (me) setUser(me)
  }, [])

  // Apply theme to root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  function onBootDone() {
    markBooted()
    const me = getMe()
    if (me) { setUser(me); setPhase("ready") }
    else setPhase("setup")
  }

  function onSetupDone(u: User) {
    setUser(u)
    setMe(u)
    setPhase("ready")
  }

  function changeTheme(t: Theme) {
    setThemeState(t)
    saveTheme(t)
  }

  // Skip boot if user has already booted in this session
  // (only play the boot sequence the very first time per user)
  const [skipBoot] = useState(() => hasBooted() && !!getMe())

  useEffect(() => {
    if (skipBoot) {
      const me = getMe()!
      setUser(me)
      setPhase("ready")
    }
  }, [skipBoot])

  return (
    <div className="app-root">
      {phase === "booting" && !skipBoot && (
        <Boot onDone={onBootDone} />
      )}
      {phase === "setup" && (
        <Setup onDone={onSetupDone} />
      )}
      {phase === "ready" && user && (
        <div className="os-shell">
          <Taskbar
            theme={theme}
            onTheme={changeTheme}
            username={user.username}
            avatar={user.avatar}
          />
          <div className="os-body">
            <Browser />
          </div>
          <Messenger me={user} />
        </div>
      )}
    </div>
  )
}
