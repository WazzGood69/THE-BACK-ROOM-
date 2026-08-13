import { useState, useEffect } from "react"
import {
  adminPwSet, verifyAdminPw, setAdminPw, hashPw,
  getBroadcasts, addBroadcast, deleteBroadcast, clearBroadcasts,
  getAllUsers, setMe,
} from "../store"
import { Broadcast, User } from "../types"
import { TBRSymbol } from "../components/Boot"
import { AvatarDisplay } from "../components/Settings"

interface Props { onClose: () => void }

type AdminTab = "dashboard" | "broadcast" | "users" | "server"

export default function AdminPanel({ onClose }: Props) {
  const [authed, setAuthed] = useState(false)
  const [pwInput, setPwInput] = useState("")
  const [newPw1, setNewPw1] = useState("")
  const [newPw2, setNewPw2] = useState("")
  const [err, setErr] = useState("")
  const [tab, setTab] = useState<AdminTab>("dashboard")
  const [bcText, setBcText] = useState("")
  const [bcType, setBcType] = useState<Broadcast["type"]>("info")
  const [bcMsg, setBcMsg] = useState("")
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tick, setTick] = useState(0)

  const isFirstSetup = !adminPwSet()

  useEffect(() => {
    if (authed) {
      setBroadcasts(getBroadcasts())
      setUsers(getAllUsers())
    }
  }, [authed, tick])

  function tryLogin() {
    if (isFirstSetup) {
      if (newPw1.length < 6) { setErr("Admin password must be 6+ characters."); return }
      if (newPw1 !== newPw2) { setErr("Passwords don't match."); return }
      setAdminPw(newPw1)
      setAuthed(true); setErr("")
    } else {
      if (verifyAdminPw(pwInput)) { setAuthed(true); setErr("") }
      else { setErr("Wrong password.") }
    }
  }

  function postBroadcast() {
    if (!bcText.trim()) return
    addBroadcast(bcText.trim(), bcType)
    setBcText(""); setBcMsg("Broadcast sent ✓")
    setTimeout(() => setBcMsg(""), 2500)
    setTick(t => t + 1)
  }

  function deleteUser(id: string) {
    if (!confirm("Delete this user? This cannot be undone.")) return
    const key = "tbr_users"
    const all = getAllUsers().filter(u => u.id !== id)
    localStorage.setItem(key, JSON.stringify(all))
    setTick(t => t + 1)
  }

  const TABS: Array<{ id: AdminTab; icon: string; label: string }> = [
    { id: "dashboard",  icon: "📊", label: "Dashboard" },
    { id: "broadcast",  icon: "📢", label: "Broadcast" },
    { id: "users",      icon: "👥", label: "Users"     },
    { id: "server",     icon: "🖥️",  label: "Server"    },
  ]

  if (!authed) {
    return (
      <div className="admin-overlay">
        <div className="admin-login">
          <div className="admin-login-logo">
            <TBRSymbol size={36} />
          </div>
          <h2 className="admin-login-title">
            {isFirstSetup ? "Set Admin Password" : "Admin Access"}
          </h2>
          <p className="admin-login-sub">
            {isFirstSetup
              ? "First time here. Set a master password for the admin panel."
              : "This area is restricted. Enter the admin password to continue."}
          </p>

          {isFirstSetup ? (
            <>
              <input className="admin-input" type="password" placeholder="Create admin password"
                value={newPw1} onChange={e => { setNewPw1(e.target.value); setErr("") }} autoFocus />
              <input className="admin-input" type="password" placeholder="Confirm admin password"
                value={newPw2} onChange={e => { setNewPw2(e.target.value); setErr("") }}
                onKeyDown={e => e.key === "Enter" && tryLogin()} />
            </>
          ) : (
            <input className="admin-input" type="password" placeholder="Admin password"
              value={pwInput} onChange={e => { setPwInput(e.target.value); setErr("") }}
              onKeyDown={e => e.key === "Enter" && tryLogin()} autoFocus />
          )}

          {err && <p className="admin-err">{err}</p>}
          <div className="admin-btn-row">
            <button className="admin-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="admin-btn" onClick={tryLogin}>
              {isFirstSetup ? "Create & Enter" : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-overlay">
      <div className="admin-win">
        {/* Titlebar */}
        <div className="admin-titlebar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TBRSymbol size={20} />
            <span className="admin-title">Admin Panel</span>
            <span className="admin-badge">RESTRICTED</span>
          </div>
          <button className="admin-close" onClick={onClose}>✕</button>
        </div>

        <div className="admin-body">
          {/* Sidebar */}
          <div className="admin-sidebar">
            {TABS.map(t => (
              <button key={t.id} className={`admin-tab ${tab === t.id ? "admin-tab--on" : ""}`}
                onClick={() => setTab(t.id)}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button className="admin-tab admin-tab--danger" onClick={() => {
              if (confirm("Sign out of admin panel?")) onClose()
            }}>
              <span>🚪</span><span>Exit</span>
            </button>
          </div>

          {/* Content */}
          <div className="admin-content">

            {tab === "dashboard" && (
              <div className="admin-section">
                <h2 className="admin-section-title">Dashboard</h2>
                <div className="admin-stat-grid">
                  <StatCard icon="👥" label="Total Users" value={String(users.length)} />
                  <StatCard icon="📢" label="Broadcasts" value={String(broadcasts.length)} />
                  <StatCard icon="💬" label="Storage"
                    value={(() => {
                      const b = JSON.stringify(localStorage).length
                      return b > 1000 ? `${(b/1024).toFixed(1)} KB` : `${b} B`
                    })()} />
                  <StatCard icon="🌐" label="Version" value="v2.0.0" />
                </div>

                <h3 className="admin-sub-title">Recent Broadcasts</h3>
                {broadcasts.length === 0
                  ? <p className="admin-empty">No broadcasts yet.</p>
                  : broadcasts.slice(0, 5).map(b => (
                      <div key={b.id} className="admin-bc-item">
                        <span className={`admin-bc-type admin-bc-type--${b.type}`}>{b.type}</span>
                        <span className="admin-bc-text">{b.text}</span>
                        <span className="admin-bc-time">{new Date(b.createdAt).toLocaleString()}</span>
                      </div>
                    ))
                }
              </div>
            )}

            {tab === "broadcast" && (
              <div className="admin-section">
                <h2 className="admin-section-title">Broadcast Message</h2>
                <p className="admin-note">
                  Messages appear in all users' messenger panels as a system notification.
                  They are stored locally and visible to everyone on this browser.
                </p>

                <div className="admin-type-row">
                  {(["info","warning","update"] as Broadcast["type"][]).map(t => (
                    <button key={t} className={`admin-type-chip ${bcType === t ? "admin-type-chip--on admin-type-chip--"+t : ""}`}
                      onClick={() => setBcType(t)}>
                      {{ info: "ℹ Info", warning: "⚠ Warning", update: "🆕 Update" }[t]}
                    </button>
                  ))}
                </div>

                <textarea className="admin-textarea"
                  placeholder="Write your message…"
                  value={bcText}
                  onChange={e => setBcText(e.target.value)}
                  rows={4}
                />

                {bcMsg && <p className="admin-success">{bcMsg}</p>}
                <div className="admin-btn-row">
                  <button className="admin-btn" onClick={postBroadcast}
                    disabled={!bcText.trim()}>
                    📢 Send Broadcast
                  </button>
                  {broadcasts.length > 0 && (
                    <button className="admin-btn-ghost admin-btn-ghost--danger"
                      onClick={() => { if (confirm("Clear all broadcasts?")) { clearBroadcasts(); setTick(t => t + 1) } }}>
                      Clear All
                    </button>
                  )}
                </div>

                <h3 className="admin-sub-title" style={{ marginTop: 28 }}>All Broadcasts</h3>
                {broadcasts.length === 0
                  ? <p className="admin-empty">No broadcasts yet.</p>
                  : broadcasts.map(b => (
                      <div key={b.id} className="admin-bc-item">
                        <span className={`admin-bc-type admin-bc-type--${b.type}`}>{b.type}</span>
                        <span className="admin-bc-text">{b.text}</span>
                        <span className="admin-bc-time">{new Date(b.createdAt).toLocaleString()}</span>
                        <button className="admin-bc-del" onClick={() => { deleteBroadcast(b.id); setTick(t => t + 1) }}>✕</button>
                      </div>
                    ))
                }
              </div>
            )}

            {tab === "users" && (
              <div className="admin-section">
                <h2 className="admin-section-title">All Users ({users.length})</h2>
                <p className="admin-note">All accounts registered on this browser instance.</p>
                {users.length === 0
                  ? <p className="admin-empty">No users registered yet.</p>
                  : users.map(u => (
                      <div key={u.id} className="admin-user-row">
                        <AvatarDisplay avatar={u.avatar} size={36} />
                        <div className="admin-user-info">
                          <span className="admin-user-name">@{u.username}</span>
                          <span className="admin-user-meta">
                            Joined {new Date(u.createdAt).toLocaleDateString()} ·
                            {u.passwordHash ? " 🔐 has password" : " no password"}
                          </span>
                        </div>
                        <button className="admin-del-btn"
                          onClick={() => deleteUser(u.id)}
                          title="Delete user">🗑</button>
                      </div>
                    ))
                }

                <div style={{ marginTop: 20 }}>
                  <button className="admin-btn-ghost admin-btn-ghost--danger"
                    onClick={() => {
                      if (confirm("Export all user data as JSON?")) {
                        const data = JSON.stringify({ users, broadcasts }, null, 2)
                        const blob = new Blob([data], { type: "application/json" })
                        const a = document.createElement("a")
                        a.href = URL.createObjectURL(blob)
                        a.download = "backroom-data.json"
                        a.click()
                      }
                    }}>
                    📁 Export Data (JSON)
                  </button>
                </div>
              </div>
            )}

            {tab === "server" && (
              <div className="admin-section">
                <h2 className="admin-section-title">Server Setup</h2>
                <p className="admin-note">
                  The Back Room runs entirely in the browser. To host it on a dedicated laptop
                  or server so others can join, you need to build and serve the app on your LAN.
                </p>
                <div className="admin-server-steps">
                  <ServerStep num={1} title="Build the app">
                    <code>pnpm install && pnpm build</code>
                    <p>Output goes to <code>dist/</code></p>
                  </ServerStep>
                  <ServerStep num={2} title="Serve on your LAN">
                    <code>pnpm add -g serve</code>
                    <code>serve dist -l 8080</code>
                    <p>Other devices connect via <code>http://YOUR_IP:8080</code></p>
                  </ServerStep>
                  <ServerStep num={3} title="Auto-start (Linux)">
                    <p>Create a systemd service targeting <code>serve dist -l 8080</code>. Enable with <code>systemctl enable backroom</code>.</p>
                  </ServerStep>
                  <ServerStep num={4} title="Auto-start (Windows)">
                    <p>Use Task Scheduler or <code>pm2</code> + <code>pm2-windows-startup</code> to run on boot.</p>
                  </ServerStep>
                </div>
                <a href="/server-setup.html" target="_blank" className="admin-btn"
                  style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 20 }}>
                  Full Server Guide ↗
                </a>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-icon">{icon}</span>
      <span className="admin-stat-val">{value}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  )
}

function ServerStep({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="admin-server-step">
      <div className="admin-step-num">{num}</div>
      <div className="admin-step-body">
        <strong className="admin-step-title">{title}</strong>
        {children}
      </div>
    </div>
  )
}
