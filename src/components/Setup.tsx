import { useState } from "react"
import { User } from "../types"
import { findUserByUsername, hashPw, pickAvatar, saveUser, setMe, ALL_AVATARS } from "../store"
import { TBRSymbol } from "./Boot"
import { AvatarDisplay } from "./Settings"

interface Props { onDone: (user: User) => void }

type Step = "username" | "avatar" | "password"

export default function Setup({ onDone }: Props) {
  const [step, setStep]       = useState<Step>("username")
  const [username, setUsername] = useState("")
  const [avatar, setAvatar]   = useState(pickAvatar)
  const [customUrl, setCustomUrl] = useState("")
  const [wantPw, setWantPw]   = useState<boolean | null>(null)
  const [pw, setPw]           = useState("")
  const [pw2, setPw2]         = useState("")
  const [err, setErr]         = useState("")

  const displayAvatar = customUrl || avatar

  function submitUsername() {
    const name = username.trim()
    if (!name) { setErr("Enter a username."); return }
    if (name.length < 3) { setErr("At least 3 characters."); return }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { setErr("Letters, numbers, _ and - only."); return }
    if (findUserByUsername(name)) { setErr("That username is taken."); return }
    setErr(""); setStep("avatar")
  }

  function submitPassword() {
    if (wantPw === null) { setErr("Choose an option."); return }
    if (!wantPw) { finishSetup(null); return }
    if (pw.length < 4) { setErr("Password must be at least 4 characters."); return }
    if (pw !== pw2) { setErr("Passwords don't match."); return }
    finishSetup(pw)
  }

  function finishSetup(password: string | null) {
    const user: User = {
      id: Math.random().toString(36).slice(2, 10),
      username: username.trim(),
      passwordHash: password ? hashPw(password) : null,
      createdAt: Date.now(),
      avatar: displayAvatar,
    }
    saveUser(user)
    setMe(user)
    onDone(user)
  }

  const totalSteps = 3
  const stepIdx = step === "username" ? 0 : step === "avatar" ? 1 : 2

  return (
    <div className="setup-shell">
      <div className="setup-card">
        <div className="setup-logo">
          <TBRSymbol size={26} />
          <span className="setup-brand">The Back Room</span>
        </div>

        <div className="setup-step-indicator">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} className={`ssi-dot ${i === stepIdx ? "ssi-active" : i < stepIdx ? "ssi-done" : ""}`} />
          ))}
        </div>

        {/* Step 1 — Username */}
        {step === "username" && (
          <div className="setup-section">
            <div className="setup-avatar-preview">
              <AvatarDisplay avatar={displayAvatar} size={60} />
            </div>
            <h2 className="setup-heading">Choose your username</h2>
            <p className="setup-sub">This is how others find you in The Back Room.</p>
            <input
              className="setup-input"
              placeholder="e.g. shadow_fox"
              value={username}
              onChange={e => { setUsername(e.target.value); setErr("") }}
              onKeyDown={e => e.key === "Enter" && submitUsername()}
              autoFocus
              maxLength={24}
            />
            {err && <p className="setup-err">{err}</p>}
            <button className="setup-btn" onClick={submitUsername}>Continue →</button>
          </div>
        )}

        {/* Step 2 — Avatar */}
        {step === "avatar" && (
          <div className="setup-section">
            <div className="setup-avatar-preview">
              <AvatarDisplay avatar={displayAvatar} size={64} />
            </div>
            <h2 className="setup-heading">Pick your avatar</h2>
            <p className="setup-sub">Choose an emoji or paste an image URL.</p>

            <div className="setup-emoji-grid">
              {ALL_AVATARS.map(e => (
                <button key={e}
                  className={`setup-emoji-btn ${avatar === e && !customUrl ? "setup-emoji-btn--on" : ""}`}
                  onClick={() => { setAvatar(e); setCustomUrl(""); setErr("") }}>
                  {e}
                </button>
              ))}
            </div>

            <div className="setup-url-row">
              <input
                className="setup-input"
                placeholder="Or paste an image URL…"
                value={customUrl}
                onChange={e => { setCustomUrl(e.target.value); setErr("") }}
              />
              {customUrl && (
                <button className="setup-btn-ghost" onClick={() => setCustomUrl("")}>✕</button>
              )}
            </div>

            {err && <p className="setup-err">{err}</p>}
            <div className="setup-row">
              <button className="setup-btn-ghost" onClick={() => { setStep("username"); setErr("") }}>← Back</button>
              <button className="setup-btn" onClick={() => { setErr(""); setStep("password") }}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3 — Password */}
        {step === "password" && (
          <div className="setup-section">
            <h2 className="setup-heading">Set a password?</h2>
            <p className="setup-sub">Protect your account. Optional, but recommended.</p>
            <div className="setup-radio-group">
              <label className={`setup-radio ${wantPw === true ? "setup-radio--on" : ""}`}>
                <input type="radio" name="pw" checked={wantPw === true}
                  onChange={() => { setWantPw(true); setErr("") }} />
                <span>Yes, set a password</span>
              </label>
              <label className={`setup-radio ${wantPw === false ? "setup-radio--on" : ""}`}>
                <input type="radio" name="pw" checked={wantPw === false}
                  onChange={() => { setWantPw(false); setErr("") }} />
                <span>Skip for now</span>
              </label>
            </div>
            {wantPw && (
              <>
                <input className="setup-input" type="password" placeholder="Password"
                  value={pw} onChange={e => { setPw(e.target.value); setErr("") }}
                  onKeyDown={e => e.key === "Enter" && submitPassword()} />
                <input className="setup-input" type="password" placeholder="Confirm password"
                  value={pw2} onChange={e => { setPw2(e.target.value); setErr("") }}
                  onKeyDown={e => e.key === "Enter" && submitPassword()} />
              </>
            )}
            {err && <p className="setup-err">{err}</p>}
            <div className="setup-row">
              <button className="setup-btn-ghost" onClick={() => { setStep("avatar"); setErr("") }}>← Back</button>
              <button className="setup-btn" onClick={submitPassword}>
                {wantPw ? "Create Account" : "Enter The Back Room"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
