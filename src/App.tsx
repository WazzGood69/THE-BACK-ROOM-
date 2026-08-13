import { useState, useEffect, useRef } from "react"
import Boot      from "./components/Boot"
import Setup     from "./components/Setup"
import Browser   from "./components/Browser"
import Messenger from "./components/Messenger"
import Taskbar   from "./components/Taskbar"
import Settings, { SettingsData, DEFAULT_SETTINGS } from "./components/Settings"
import AnimatedBg from "./components/AnimatedBg"
import AdminPanel from "./admin/AdminPanel"
import { User, Theme } from "./types"
import { getMe, setMe, getTheme, setTheme as saveTheme, hasBooted, markBooted, getUnreadBroadcasts, markBroadcastRead } from "./store"

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
  const [phase, setPhase]         = useState<AppPhase>("booting")
  const [user,  setUser]          = useState<User | null>(null)
  const [settings, setSettingsState] = useState<SettingsData>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [skipBoot] = useState(() => hasBooted() && !!getMe())
  const [broadcasts, setBroadcasts] = useState(getUnreadBroadcasts)
  const logoClickCount = useRef(0)
  const logoClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-theme",  settings.theme)
    root.setAttribute("data-accent", settings.accent)
    root.setAttribute("data-bg",     settings.bgStyle)
    root.setAttribute("data-fs",     settings.fontSize)
    root.classList.toggle("grain", settings.grain)
    root.classList.toggle("retro", settings.retroEffects)
  }, [settings])

  useEffect(() => {
    const id = setInterval(() => setBroadcasts(getUnreadBroadcasts()), 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (skipBoot) {
      const me = getMe()!
      setUser(me); setPhase("ready")
    } else {
      setSettingsState(prev => ({ ...prev, theme: getTheme() }))
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
    saveTheme(s.theme as Theme)
  }

  function handleLogoClick() {
    logoClickCount.current += 1
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current)
    if (logoClickCount.current >= 3) {
      logoClickCount.current = 0
      setShowAdmin(true)
    } else {
      logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0 }, 800)
    }
  }

  return (
    <div className="app-root">
      {phase === "booting" && !skipBoot && <Boot onDone={onBootDone} />}
      {phase === "setup"   && <Setup onDone={onSetupDone} />}

      {phase === "ready" && user && (
        <>
          <AnimatedBg style={settings.bgStyle} theme={settings.theme} />

          <div className="os-shell">
            <Taskbar
              theme={settings.theme}
              onTheme={t => changeSettings({ ...settings, theme: t })}
              username={user.username}
              avatar={user.avatar}
              onSettings={() => setShowSettings(true)}
              onLogoClick={handleLogoClick}
            />

            <div className="os-body">
              <Browser
                homePage={settings.homePage}
                searchEngine={settings.searchEngine}
                showClock={settings.newTabClock}
              />
            </div>

            <Messenger me={user} />

            {broadcasts.length > 0 && (
              <div className="bc-stack">
                {broadcasts.slice(0, 3).map(b => (
                  <div key={b.id} className={`bc-banner bc-banner--${b.type}`}>
                    <span className="bc-icon">
                      {{ info: "ℹ️", warning: "⚠️", update: "🆕" }[b.type]}
                    </span>
                    <span className="bc-text">{b.text}</span>
                    <button className="bc-dismiss" onClick={() => {
                      markBroadcastRead(b.id)
                      setBroadcasts(getUnreadBroadcasts())
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {showSettings && (
              <Settings
                settings={settings}
                onChange={changeSettings}
                onClose={() => setShowSettings(false)}
              />
            )}

            {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
          </div>
        </>
      )}
    </div>
  )
}
