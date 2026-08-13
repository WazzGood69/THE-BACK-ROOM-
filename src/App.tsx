import { useState, useEffect } from "react"
import Boot      from "./components/Boot"
import Setup     from "./components/Setup"
import Browser   from "./components/Browser"
import Messenger from "./components/Messenger"
import Taskbar   from "./components/Taskbar"
import Settings, { SettingsData, DEFAULT_SETTINGS } from "./components/Settings"
import AnimatedBg from "./components/AnimatedBg"
import { User, Theme } from "./types"
import { getMe, setMe, getTheme, setTheme as saveTheme, hasBooted, markBooted } from "./store"

const SETTINGS_KEY = "tbr_settings"

function loadSettings(): SettingsData {
  try {
    const s = localStorage.getItem(SETTINGS_KEY)
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
}
function saveSettings(s: SettingsData) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

type AppPhase = "booting" | "setup" | "ready"

export default function App() {
  const [phase, setPhase]       = useState<AppPhase>("booting")
  const [user,  setUser]        = useState<User | null>(null)
  const [settings, setSettingsState] = useState<SettingsData>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [skipBoot] = useState(() => hasBooted() && !!getMe())

  // Apply theme + font-size to <html>
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-theme", settings.theme)
    root.setAttribute("data-accent", settings.accent)
    root.setAttribute("data-bg",     settings.bgStyle)
    root.setAttribute("data-fs",     settings.fontSize)
    if (settings.grain)         root.classList.add("grain")
    else                        root.classList.remove("grain")
    if (settings.retroEffects)  root.classList.add("retro")
    else                        root.classList.remove("retro")
  }, [settings])

  // Skip boot for returning users
  useEffect(() => {
    if (skipBoot) {
      const me = getMe()!
      setUser(me)
      setPhase("ready")
    } else {
      const t = getTheme()
      setSettingsState(prev => ({ ...prev, theme: t }))
    }
  }, [skipBoot])

  function onBootDone() {
    markBooted()
    const me = getMe()
    if (me) { setUser(me); setPhase("ready") }
    else setPhase("setup")
  }

  function onSetupDone(u: User) {
    setUser(u); setMe(u); setPhase("ready")
  }

  function changeSettings(s: SettingsData) {
    setSettingsState(s)
    saveSettings(s)
    saveTheme(s.theme)
  }

  return (
    <div className="app-root">
      {phase === "booting" && !skipBoot && <Boot onDone={onBootDone} />}

      {phase === "setup" && <Setup onDone={onSetupDone} />}

      {phase === "ready" && user && (
        <div className="os-shell">
          <AnimatedBg style={settings.bgStyle} theme={settings.theme} />

          <Taskbar
            theme={settings.theme}
            onTheme={t => changeSettings({ ...settings, theme: t })}
            username={user.username}
            avatar={user.avatar}
            onSettings={() => setShowSettings(true)}
          />

          <div className="os-body">
            <Browser
              homePage={settings.homePage}
              searchEngine={settings.searchEngine}
              showClock={settings.newTabClock}
            />
          </div>

          <Messenger me={user} />

          {showSettings && (
            <Settings
              settings={settings}
              onChange={changeSettings}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
