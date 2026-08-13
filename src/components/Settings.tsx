import { useState } from "react"
import { Theme } from "../types"
import { getMe, setMe, hashPw } from "../store"
import { TBRSymbol } from "./Boot"

export type AccentColor = "mono" | "blue" | "teal" | "amber" | "rose" | "violet" | "lime"
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
  theme: "black", accent: "mono", bgStyle: "blobs",
  grain: false, fontSize: "md",
  homePage: "https://en.m.wikipedia.org/wiki/Main_Page",
  searchEngine: "duckduckgo", newTabClock: true, retroEffects: false,
}

const ACCENT_MAP: Record<AccentColor, { label: string; color: string }> = {
  mono:   { label: "Mono (B&W)",   color: "linear-gradient(135deg,#e0e0e8,#555)" },
  blue:   { label: "Neon Blue",    color: "#4a9eff" },
  teal:   { label: "Teal",         color: "#2dd4bf" },
  amber:  { label: "Amber",        color: "#f59e0b" },
  rose:   { label: "Rose",         color: "#f43f5e" },
  violet: { label: "Violet",       color: "#8b5cf6" },
  lime:   { label: "Lime",         color: "#84cc16" },
}

const SE_LABELS: Record<SearchEngine, string> = {
  duckduckgo: "DuckDuckGo", google: "Google", bing: "Bing", brave: "Brave"
}

const THEME_META: Record<Theme, { label: string; desc: string }> = {
  black:     { label: "Graphite",  desc: "Dark warm gray" },
  white:     { label: "Cloud",     desc: "Soft off-white" },
  oldschool: { label: "Old School",desc: "Windows XP vibes" },
  oxide:     { label: "Oxide",     desc: "Pure black, surgical" },
  midnight:  { label: "Midnight",  desc: "Deep space navy" },
  sepia:     { label: "Sepia",     desc: "Warm vintage paper" },
}

type Category = "appearance" | "profile" | "browser" | "account" | "about"

interface Props {
  settings: SettingsData
  onChange: (s: SettingsData) => void
  onClose: () => void
}

export default function Settings({ settings, onChange, onClose }: Props) {
  const [cat, setCat]  = useState<Category>("appearance")
  const [pw,  setPw]   = useState("")
  const [pw2, setPw2]  = useState("")
  const [pwMsg, setPwMsg] = useState("")
  const [avatarInput, setAvatarInput] = useState("")
  const [avatarMsg, setAvatarMsg] = useState("")
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
    if (me) setMe({ ...me, passwordHash: null })
    setPwMsg("Password removed ✓")
  }
  function saveAvatar(av: string) {
    if (!me) return
    const updated = { ...me, avatar: av }
    setMe(updated)
    setAvatarMsg("Avatar updated ✓")
    setTimeout(() => setAvatarMsg(""), 2000)
  }

  const CATS: Array<{ id: Category; icon: string; label: string }> = [
    { id: "appearance", icon: "🎨", label: "Appearance" },
    { id: "profile",    icon: "🪪", label: "Profile"    },
    { id: "browser",    icon: "🌐", label: "Browser"    },
    { id: "account",    icon: "🔐", label: "Account"    },
    { id: "about",      icon: "ℹ️",  label: "About"      },
  ]

  const ALL_THEMES = Object.keys(THEME_META) as Theme[]

  return (
    <div className="settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="settings-win">
        <div className="settings-titlebar">
          <span className="settings-title">⚙ Settings</span>
          <button className="settings-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="settings-body">
          <div className="settings-sidebar">
            {CATS.map(c => (
              <button key={c.id} className={`settings-cat ${cat === c.id ? "settings-cat--on" : ""}`}
                onClick={() => setCat(c.id)}>
                <span className="settings-cat-icon">{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          <div className="settings-content">

            {/* ── APPEARANCE ── */}
            {cat === "appearance" && <>
              <Section title="Theme">
                <div className="theme-grid">
                  {ALL_THEMES.map(t => (
                    <ThemeCard key={t} id={t} active={settings.theme === t}
                      onClick={() => set("theme", t)} />
                  ))}
                </div>
              </Section>

              <Section title="Accent Color">
                <div className="accent-grid">
                  {(Object.keys(ACCENT_MAP) as AccentColor[]).map(a => (
                    <button key={a}
                      className={`accent-swatch ${settings.accent === a ? "accent-swatch--on" : ""}`}
                      style={{ background: ACCENT_MAP[a].color } as React.CSSProperties}
                      onClick={() => set("accent", a)}
                      title={ACCENT_MAP[a].label}
                    >
                      {settings.accent === a && <span className="accent-check">✓</span>}
                    </button>
                  ))}
                </div>
                <p className="settings-note" style={{ marginTop: 6 }}>
                  Mono = black/white based. Automatically adapts to your theme.
                </p>
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
                <Toggle label="Retro CRT scanlines" checked={settings.retroEffects}
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

            {/* ── PROFILE ── */}
            {cat === "profile" && <>
              <Section title="Current Avatar">
                <div className="profile-avatar-preview">
                  <AvatarDisplay avatar={me?.avatar ?? "🦊"} size={72} />
                  <div>
                    <div className="account-username">@{me?.username}</div>
                    <div className="account-since">
                      Member since {me ? new Date(me.createdAt).toLocaleDateString() : "—"}
                    </div>
                    {avatarMsg && <div className="settings-msg" style={{ marginTop: 4 }}>{avatarMsg}</div>}
                  </div>
                </div>
              </Section>

              <Section title="Choose an Emoji Avatar">
                <div className="emoji-grid">
                  {["🦊","🐺","🐻","🐼","🦁","🐯","🐨","🐸","🦋","🦄","🐙","🦑","🦅","🦉","🐬","🐧","🦝","🦨","🦡","🐊","🦖","🦎","🐲","🌙","⭐","🔥","❄️","🌊","🍄","🌿"].map(e => (
                    <button key={e} className={`emoji-pick ${me?.avatar === e ? "emoji-pick--on" : ""}`}
                      onClick={() => saveAvatar(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Or Use an Image URL">
                <p className="settings-note">Paste a direct image link (jpg, png, gif, webp).</p>
                <div className="srow">
                  <input className="settings-input" style={{ flex: 1 }}
                    placeholder="https://example.com/avatar.png"
                    value={avatarInput}
                    onChange={e => setAvatarInput(e.target.value)} />
                  <button className="settings-btn" onClick={() => {
                    if (!avatarInput.trim()) return
                    saveAvatar(avatarInput.trim())
                    setAvatarInput("")
                  }}>Set</button>
                </div>
                {avatarInput && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <span className="settings-note">Preview:</span>
                    <img src={avatarInput} alt="preview"
                      style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", border: "1px solid var(--glass-border)" }}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                  </div>
                )}
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
                  The Back Room loads pages through CORS proxies and renders them as local documents.
                  Sites that detect proxy IPs (Google, YouTube, Facebook, Instagram, Twitter/X,
                  Netflix, LinkedIn, TikTok) will always refuse — this is enforced server-side and
                  can't be bypassed in any browser app. Wikipedia, Hacker News, DuckDuckGo HTML,
                  Reddit old, W3Schools, Archive.org, and most smaller sites work well.
                </p>
              </Section>
            </>}

            {/* ── ACCOUNT ── */}
            {cat === "account" && <>
              <Section title="Your Identity">
                <div className="account-id-card">
                  <AvatarDisplay avatar={me?.avatar ?? "🦊"} size={48} />
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
                  {me?.passwordHash ? "You have a password set." : "No password — anyone can log in as you on this device."}
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
                <div className="about-logo"><TBRSymbol size={64} /></div>
                <div className="about-name">The Back Room</div>
                <div className="about-corp">Dunbar Interprise</div>
                <div className="about-version">Version 2.0.0</div>
                <div className="about-divider" />
                <div className="about-credits">
                  <p>A private web OS with multi-tab browsing, messenger, and full theme customization.</p>
                  <p style={{ marginTop: 8 }}>Built on React + Vite + Tailwind CSS v4.</p>
                </div>
                <div className="about-divider" />
                <div className="about-spec-grid">
                  {[
                    ["Platform",  "Web Browser"],
                    ["Engine",    "Chromium / WebKit"],
                    ["Proxy",     "4-tier CORS chain"],
                    ["Storage",   "localStorage"],
                    ["Themes",    "6 themes"],
                    ["Messaging", "Local-first"],
                  ].map(([k,v]) => (
                    <div key={k} className="about-spec-row">
                      <span className="about-spec-key">{k}</span>
                      <span className="about-spec-val">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="about-divider" />
                <a href="/server-setup.html" target="_blank" className="settings-btn"
                  style={{ textDecoration: "none", textAlign: "center", display: "block" }}>
                  Server Setup Guide ↗
                </a>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────

export function AvatarDisplay({ avatar, size = 32 }: { avatar: string; size?: number }) {
  const isUrl = avatar.startsWith("http")
  if (isUrl) {
    return (
      <img src={avatar} alt="avatar"
        style={{ width: size, height: size, borderRadius: size / 5, objectFit: "cover", flexShrink: 0 }}
        onError={e => { (e.target as HTMLImageElement).src = "" }}
      />
    )
  }
  return <span style={{ fontSize: size * 0.65, lineHeight: 1, flexShrink: 0 }}>{avatar}</span>
}

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
      <button role="switch" aria-checked={checked}
        className={`toggle-btn ${checked ? "toggle-btn--on" : ""}`}
        onClick={() => onChange(!checked)}>
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
  const PREVIEW_BG: Record<Theme, string> = {
    black:     "#1a1a22",
    white:     "#f2f2f8",
    oldschool: "#3a6ea5",
    oxide:     "#0a0a0a",
    midnight:  "#060814",
    sepia:     "#f0e0c0",
  }
  const PREVIEW_BAR: Record<Theme, string> = {
    black:     "#111116",
    white:     "#e5e5f0",
    oldschool: "linear-gradient(to bottom,#245edc,#3c82f8)",
    oxide:     "#111111",
    midnight:  "#0d1225",
    sepia:     "#deca9a",
  }
  const PREVIEW_LINE: Record<Theme, string> = {
    black:     "rgba(255,255,255,.15)",
    white:     "rgba(0,0,0,.12)",
    oldschool: "rgba(0,0,0,.2)",
    oxide:     "rgba(255,255,255,.1)",
    midnight:  "rgba(100,130,255,.25)",
    sepia:     "rgba(80,50,10,.2)",
  }
  const ACCENT_DOT: Record<Theme, string> = {
    black:     "#4a9eff",
    white:     "#2266cc",
    oldschool: "#316ac5",
    oxide:     "#e0e0e0",
    midnight:  "#6b7ff0",
    sepia:     "#7c4c1e",
  }

  return (
    <button className={`theme-card ${active ? "theme-card--on" : ""}`} onClick={onClick}>
      <div className="theme-preview" style={{ background: PREVIEW_BG[id] }}>
        <div className="tp-bar" style={{ background: PREVIEW_BAR[id] }} />
        <div className="tp-body">
          <div className="tp-line" style={{ background: PREVIEW_LINE[id] }} />
          <div className="tp-line tp-line--short" style={{ background: PREVIEW_LINE[id] }} />
          <div className="tp-accent-dot" style={{ background: ACCENT_DOT[id] }} />
        </div>
      </div>
      <span className="theme-card-label">{THEME_META[id].label}</span>
      <span className="theme-card-desc">{THEME_META[id].desc}</span>
    </button>
  )
}
