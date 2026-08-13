import { useState } from "react"
import { Theme } from "../types"
import { getMe, setMe, hashPw, findUserByUsername } from "../store"
import { TBRSymbol } from "./Boot"

export type AccentColor = "blue" | "teal" | "amber" | "rose" | "violet" | "lime"
export type BgStyle = "blobs" | "grid" | "noise" | "none"
export type SearchEngine = "duckduckgo" | "google" | "bing" | "brave"

export interface SettingsData {
  theme: Theme
  accent: AccentColor
  bgStyle: BgStyle
  grain: boolean
  fontSize: "sm" | "md" | "lg"
  homePage: string
  searchEngine: SearchEngine
  newTabClock: boolean
  retroEffects: boolean
}

export const DEFAULT_SETTINGS: SettingsData = {
  theme: "black", accent: "blue", bgStyle: "blobs",
  grain: true, fontSize: "md",
  homePage: "https://en.m.wikipedia.org/wiki/Main_Page",
  searchEngine: "duckduckgo", newTabClock: true, retroEffects: false,
}

const ACCENT_MAP: Record<AccentColor, { label: string; color: string }> = {
  blue:   { label: "Neon Blue",   color: "#4a9eff" },
  teal:   { label: "Teal",        color: "#2dd4bf" },
  amber:  { label: "Amber",       color: "#f59e0b" },
  rose:   { label: "Rose",        color: "#f43f5e" },
  violet: { label: "Violet",      color: "#8b5cf6" },
  lime:   { label: "Lime",        color: "#84cc16" },
}

const SE_LABELS: Record<SearchEngine, string> = {
  duckduckgo: "DuckDuckGo", google: "Google", bing: "Bing", brave: "Brave"
}

type Category = "appearance" | "browser" | "account" | "about"

interface Props {
  settings: SettingsData
  onChange: (s: SettingsData) => void
  onClose: () => void
}

export default function Settings({ settings, onChange, onClose }: Props) {
  const [cat, setCat] = useState<Category>("appearance")
  const [pw,  setPw]  = useState("")
  const [pw2, setPw2] = useState("")
  const [pwMsg, setPwMsg] = useState("")
  const me = getMe()

  const set = <K extends keyof SettingsData>(key: K, val: SettingsData[K]) =>
    onChange({ ...settings, [key]: val })

  function changePw() {
    if (pw.length < 4) { setPwMsg("At least 4 characters."); return }
    if (pw !== pw2)    { setPwMsg("Passwords don't match."); return }
    if (me) { const u = { ...me, passwordHash: hashPw(pw) }; setMe(u) }
    setPwMsg("Password updated ✓"); setPw(""); setPw2("")
  }
  function removePw() {
    if (me) { const u = { ...me, passwordHash: null }; setMe(u) }
    setPwMsg("Password removed ✓")
  }

  const CATS: Array<{ id: Category; icon: string; label: string }> = [
    { id: "appearance", icon: "🎨", label: "Appearance"  },
    { id: "browser",    icon: "🌐", label: "Browser"     },
    { id: "account",    icon: "👤", label: "Account"     },
    { id: "about",      icon: "ℹ️",  label: "About"       },
  ]

  return (
    <div className="settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="settings-win">
        {/* Title bar */}
        <div className="settings-titlebar">
          <span className="settings-title">⚙ Settings</span>
          <button className="settings-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="settings-body">
          {/* Sidebar */}
          <div className="settings-sidebar">
            {CATS.map(c => (
              <button key={c.id} className={`settings-cat ${cat === c.id ? "settings-cat--on" : ""}`}
                onClick={() => setCat(c.id)}>
                <span className="settings-cat-icon">{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="settings-content">

            {/* ── APPEARANCE ── */}
            {cat === "appearance" && <>
              <Section title="Theme">
                <div className="srow">
                  {(["black","white","oldschool"] as Theme[]).map(t => (
                    <ThemeCard key={t} id={t} active={settings.theme === t}
                      onClick={() => set("theme", t)} />
                  ))}
                </div>
              </Section>

              <Section title="Accent Color">
                <div className="accent-grid">
                  {(Object.keys(ACCENT_MAP) as AccentColor[]).map(a => (
                    <button key={a} className={`accent-swatch ${settings.accent === a ? "accent-swatch--on" : ""}`}
                      style={{ "--sw": ACCENT_MAP[a].color } as React.CSSProperties}
                      onClick={() => set("accent", a)}
                      title={ACCENT_MAP[a].label}
                    >
                      {settings.accent === a && <span className="accent-check">✓</span>}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Animated Background">
                <div className="srow wrap">
                  {(["blobs","grid","noise","none"] as BgStyle[]).map(b => (
                    <OptionChip key={b} label={b} active={settings.bgStyle === b}
                      onClick={() => set("bgStyle", b)} />
                  ))}
                </div>
              </Section>

              <Section title="Effects">
                <Toggle label="Film grain" checked={settings.grain}
                  onChange={v => set("grain", v)} />
                <Toggle label="Retro CRT tint" checked={settings.retroEffects}
                  onChange={v => set("retroEffects", v)} />
              </Section>

              <Section title="Font Size">
                <div className="srow">
                  {(["sm","md","lg"] as const).map(f => (
                    <OptionChip key={f} label={{ sm:"Small", md:"Medium", lg:"Large" }[f]}
                      active={settings.fontSize === f} onClick={() => set("fontSize", f)} />
                  ))}
                </div>
              </Section>
            </>}

            {/* ── BROWSER ── */}
            {cat === "browser" && <>
              <Section title="Home Page">
                <input className="settings-input" value={settings.homePage}
                  onChange={e => set("homePage", e.target.value)}
                  placeholder="https://…" />
              </Section>

              <Section title="Default Search Engine">
                <div className="srow wrap">
                  {(Object.keys(SE_LABELS) as SearchEngine[]).map(s => (
                    <OptionChip key={s} label={SE_LABELS[s]} active={settings.searchEngine === s}
                      onClick={() => set("searchEngine", s)} />
                  ))}
                </div>
              </Section>

              <Section title="New Tab">
                <Toggle label="Show clock on new tab" checked={settings.newTabClock}
                  onChange={v => set("newTabClock", v)} />
              </Section>

              <Section title="About Proxy">
                <p className="settings-note">
                  The Back Room loads websites through a chain of public CORS proxies.
                  Sites like YouTube, Google, and Facebook block all proxy and iframe embedding
                  by policy — this is enforced at the server level and cannot be bypassed in a
                  browser-based app. Use "Open directly ↗" on those sites.
                  DuckDuckGo (HTML), Wikipedia, Hacker News, W3Schools, and most smaller sites
                  load correctly.
                </p>
              </Section>
            </>}

            {/* ── ACCOUNT ── */}
            {cat === "account" && <>
              <Section title="Your Identity">
                <div className="account-id-card">
                  <span className="account-avatar">{me?.avatar}</span>
                  <div>
                    <div className="account-username">@{me?.username}</div>
                    <div className="account-since">
                      Member since {me ? new Date(me.createdAt).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Password">
                <p className="settings-note" style={{ marginBottom: 10 }}>
                  {me?.passwordHash ? "You have a password set." : "No password — anyone can sign in as you."}
                </p>
                <input className="settings-input" type="password" placeholder="New password"
                  value={pw} onChange={e => { setPw(e.target.value); setPwMsg("") }} />
                <input className="settings-input" type="password" placeholder="Confirm password"
                  value={pw2} onChange={e => { setPw2(e.target.value); setPwMsg("") }}
                  style={{ marginTop: 8 }} />
                {pwMsg && <p className="settings-msg">{pwMsg}</p>}
                <div className="srow" style={{ marginTop: 10 }}>
                  <button className="settings-btn" onClick={changePw}>Update Password</button>
                  {me?.passwordHash &&
                    <button className="settings-btn settings-btn--ghost" onClick={removePw}>Remove Password</button>}
                </div>
              </Section>

              <Section title="Sign Out">
                <p className="settings-note">Clears your session on this device.</p>
                <button className="settings-btn settings-btn--danger" onClick={() => {
                  setMe(null); window.location.reload()
                }}>Sign Out</button>
              </Section>
            </>}

            {/* ── ABOUT ── */}
            {cat === "about" && (
              <div className="about-panel">
                <div className="about-logo">
                  <TBRSymbol size={64} />
                </div>
                <div className="about-name">The Back Room</div>
                <div className="about-corp">Dunbar Interprise</div>
                <div className="about-version">Version 1.0.0</div>
                <div className="about-divider" />
                <div className="about-credits">
                  <p>A private web OS with multi-tab browsing, messaging, and full theme customization.</p>
                  <p style={{ marginTop: 8 }}>Built on React + Vite + Tailwind CSS v4.</p>
                </div>
                <div className="about-divider" />
                <div className="about-spec-grid">
                  {[
                    ["Platform",  "Web Browser"],
                    ["Engine",    "Chromium / WebKit"],
                    ["Proxy",     "3-tier CORS chain"],
                    ["Storage",   "localStorage"],
                    ["Messaging", "P2P / local-first"],
                  ].map(([k,v]) => (
                    <div key={k} className="about-spec-row">
                      <span className="about-spec-key">{k}</span>
                      <span className="about-spec-val">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Small sub-components ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span className="toggle-label">{label}</span>
      <button
        role="switch" aria-checked={checked}
        className={`toggle-btn ${checked ? "toggle-btn--on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </label>
  )
}

function OptionChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`option-chip ${active ? "option-chip--on" : ""}`} onClick={onClick}>
      {label}
    </button>
  )
}

function ThemeCard({ id, active, onClick }: { id: Theme; active: boolean; onClick: () => void }) {
  const previews: Record<Theme, React.ReactNode> = {
    black: (
      <div className="theme-preview theme-preview--black">
        <div className="tp-bar" /><div className="tp-body"><div className="tp-line"/><div className="tp-line tp-line--short"/></div>
      </div>
    ),
    white: (
      <div className="theme-preview theme-preview--white">
        <div className="tp-bar" /><div className="tp-body"><div className="tp-line"/><div className="tp-line tp-line--short"/></div>
      </div>
    ),
    oldschool: (
      <div className="theme-preview theme-preview--xp">
        <div className="tp-bar" /><div className="tp-body tp-body--xp"><div className="tp-line tp-line--xp"/><div className="tp-line tp-line--xp tp-line--short"/></div>
      </div>
    ),
  }
  const labels: Record<Theme, string> = { black: "Graphite", white: "Cloud", oldschool: "Old School" }

  return (
    <button className={`theme-card ${active ? "theme-card--on" : ""}`} onClick={onClick}>
      {previews[id]}
      <span className="theme-card-label">{labels[id]}</span>
    </button>
  )
}
