import { useState, useEffect, useRef, KeyboardEvent } from "react"
import { User, Conversation, Message, FriendRequest } from "../types"
import {
  getConvosFor, getMsgs, sendMsg,
  getFriendsOf, getRequests, sendFriendRequest, acceptRequest, declineRequest,
  findUserByUsername, getOrCreateDM, createGroup,
} from "../store"
import { AvatarDisplay } from "./Settings"
import { useVoiceCall, formatDuration } from "../hooks/useVoiceCall"

interface Props { me: User }
type Panel = "convos" | "friends" | "requests" | "search" | "newgroup"

// ── Soft notification sound ─────────────────────────────────────────
function playPing() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + .12)
    gain.gain.setValueAtTime(.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .35)
    osc.start(); osc.stop(ctx.currentTime + .35)
    osc.onended = () => ctx.close()
  } catch { /* no audio context */ }
}

function playCallTone() {
  try {
    const ctx = new AudioContext()
    const freqs = [440, 550, 440]
    let t = ctx.currentTime
    freqs.forEach(f => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = f
      gain.gain.setValueAtTime(.15, t)
      gain.gain.exponentialRampToValueAtTime(.001, t + .18)
      osc.start(t); osc.stop(t + .2)
      t += .22
    })
    setTimeout(() => ctx.close(), 800)
  } catch { /* no audio context */ }
}

// ── Typing indicator (localStorage) ────────────────────────────────
function setTyping(convoId: string, userId: string, name: string) {
  localStorage.setItem(`tbr_typing_${convoId}`, JSON.stringify({ userId, name, ts: Date.now() }))
}
function clearTyping(convoId: string) {
  localStorage.removeItem(`tbr_typing_${convoId}`)
}
function getTyping(convoId: string, myId: string): string | null {
  try {
    const d = JSON.parse(localStorage.getItem(`tbr_typing_${convoId}`) ?? "null")
    if (!d || d.userId === myId) return null
    if (Date.now() - d.ts > 3000) return null
    return d.name
  } catch { return null }
}

export default function Messenger({ me }: Props) {
  const [open, setOpen]       = useState(false)
  const [unread, setUnread]   = useState(0)
  const [panel, setPanel]     = useState<Panel>("convos")
  const [convos, setConvos]   = useState<Conversation[]>([])
  const [friends, setFriends] = useState<User[]>([])
  const [reqs, setReqs]       = useState<FriendRequest[]>([])
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null)
  const [msgs, setMsgs]       = useState<Message[]>([])
  const [draft, setDraft]     = useState("")
  const [searchQ, setSearchQ] = useState("")
  const [searchResult, setSearchResult] = useState<User | null | "none">(null)
  const [groupName, setGroupName] = useState("")
  const [groupMembers, setGroupMembers] = useState<User[]>([])
  const [notify, setNotify]   = useState<string | null>(null)
  const [typingName, setTypingName] = useState<string | null>(null)
  const [lastMsgCount, setLastMsgCount] = useState(0)
  const msgEnd = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const vc = useVoiceCall(me.id, me.username)

  const refresh = () => {
    const c = getConvosFor(me.id)
    setConvos(c)
    setFriends(getFriendsOf(me.id))
    const myReqs = getRequests().filter(r => r.toId === me.id && r.status === "pending")
    setReqs(myReqs)
    setUnread(myReqs.length)
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [me.id]) // eslint-disable-line

  useEffect(() => {
    if (!activeConvo) return
    const poll = () => {
      const m = getMsgs(activeConvo.id)
      setMsgs(m)
      // Play ping on new messages from others
      if (m.length > lastMsgCount && m.length > 0 && m[m.length-1].fromId !== me.id) {
        playPing()
      }
      setLastMsgCount(m.length)
      // Typing indicator
      setTypingName(getTyping(activeConvo.id, me.id))
    }
    poll()
    const t = setInterval(poll, 1500)
    return () => clearInterval(t)
  }, [activeConvo, me.id]) // eslint-disable-line

  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs])

  // Incoming call notification
  useEffect(() => {
    if (vc.callState === "incoming") {
      playCallTone()
      showNotify(`📞 Incoming voice call!`)
    }
  }, [vc.callState])

  function openConvo(c: Conversation) {
    setActiveConvo(c); setMsgs(getMsgs(c.id)); setPanel("convos")
    setLastMsgCount(getMsgs(c.id).length)
  }
  function openDM(friend: User) {
    const c = getOrCreateDM(me, friend); setConvos(getConvosFor(me.id)); openConvo(c)
  }
  function submit() {
    if (!draft.trim() || !activeConvo) return
    sendMsg(activeConvo.id, me, draft.trim()); setDraft("")
    setMsgs(getMsgs(activeConvo.id)); refresh()
    if (activeConvo) clearTyping(activeConvo.id)
  }
  function handleDraftChange(val: string) {
    setDraft(val)
    if (activeConvo) {
      setTyping(activeConvo.id, me.id, me.username)
      if (typingTimer.current) clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => { if (activeConvo) clearTyping(activeConvo.id) }, 2500)
    }
  }
  function doSearch() {
    if (!searchQ.trim()) return
    const found = findUserByUsername(searchQ.trim())
    if (!found || found.id === me.id) { setSearchResult("none"); return }
    setSearchResult(found)
  }
  function doFriendRequest(target: User) {
    sendFriendRequest(me, target); showNotify(`Friend request sent to @${target.username}!`)
    setSearchQ(""); setSearchResult(null)
  }
  function doAccept(reqId: string) { acceptRequest(reqId); refresh(); showNotify("Friend request accepted!") }
  function doDecline(reqId: string) { declineRequest(reqId); refresh() }
  function makeGroup() {
    if (!groupName.trim() || groupMembers.length === 0) return
    const c = createGroup(me, groupName.trim(), groupMembers)
    refresh(); openConvo(c); setGroupName(""); setGroupMembers([])
  }
  function showNotify(msg: string) { setNotify(msg); setTimeout(() => setNotify(null), 3500) }

  const incomingReqs = reqs.filter(r => r.toId === me.id && r.status === "pending")
  const convoName = (c: Conversation) =>
    c.name ?? c.memberUsernames.find(u => u !== me.username) ?? "Chat"

  const isDM = (c: Conversation) => !c.name && c.memberIds.length === 2
  const otherUserId = (c: Conversation) => c.memberIds.find(id => id !== me.id) ?? ""

  const callButtonVisible = activeConvo && isDM(activeConvo)
    && (vc.callState === "idle" || vc.activeConvoId === activeConvo.id)

  return (
    <>
      {notify && <div className="msg-toast">{notify}</div>}

      {/* ── Incoming call overlay ─────────────────────────────── */}
      {vc.callState === "incoming" && (
        <div className="vc-incoming-overlay">
          <div className="vc-incoming-card">
            <div className="vc-pulse-ring" />
            <div className="vc-phone-icon">📞</div>
            <div className="vc-incoming-name">Incoming call…</div>
            <div className="vc-incoming-sub">Someone is calling you</div>
            <div className="vc-incoming-actions">
              <button className="vc-accept-btn" onClick={() => { vc.acceptCall(); setOpen(true) }}>
                <span>✓</span> Accept
              </button>
              <button className="vc-decline-btn" onClick={vc.hangup}>
                <span>✕</span> Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Active call bar (floating) ────────────────────────── */}
      {vc.callState === "connected" && (
        <div className="vc-active-bar">
          <div className="vc-active-dot" />
          <span className="vc-active-label">Voice call · {formatDuration(vc.duration)}</span>
          <button className={`vc-mute-btn ${vc.isMuted ? "vc-mute-btn--on" : ""}`} onClick={vc.toggleMute}
            title={vc.isMuted ? "Unmute" : "Mute"}>
            {vc.isMuted ? "🔇" : "🎙️"}
          </button>
          <button className="vc-hangup-btn" onClick={vc.hangup} title="End call">📵</button>
        </div>
      )}

      {/* Calling overlay */}
      {vc.callState === "calling" && (
        <div className="vc-calling-overlay">
          <div className="vc-calling-card">
            <div className="vc-pulse-ring vc-pulse-ring--calling" />
            <div className="vc-phone-icon">📞</div>
            <div className="vc-incoming-name">Calling…</div>
            <div className="vc-incoming-sub">Waiting for answer</div>
            <button className="vc-decline-btn" style={{ marginTop: 10 }} onClick={vc.hangup}>End</button>
          </div>
        </div>
      )}

      {/* ── Collapsed bubble ──────────────────────────────────── */}
      {!open && (
        <button className="msg-bubble" onClick={() => setOpen(true)} title="Open Messenger">
          <span className="msg-bubble-icon">💬</span>
          {unread > 0 && <span className="msg-badge">{unread}</span>}
        </button>
      )}

      {/* ── Messenger panel ───────────────────────────────────── */}
      {open && (
        <div className="msg-panel">
          {/* Header */}
          <div className="msg-header">
            <span className="msg-header-title">
              {activeConvo && (
                <button className="msg-back-btn" onClick={() => { setActiveConvo(null); if (activeConvo) clearTyping(activeConvo.id) }}>←</button>
              )}
              {activeConvo ? convoName(activeConvo) : "Messages"}
            </span>
            <div className="msg-header-actions">
              {/* Voice call button */}
              {callButtonVisible && (
                <button
                  className={`vc-call-btn ${vc.callState === "connected" && vc.activeConvoId === activeConvo?.id ? "vc-call-btn--active" : ""}`}
                  title={vc.callState === "connected" && vc.activeConvoId === activeConvo?.id ? "End call" : "Start voice call"}
                  onClick={() => {
                    if (vc.callState === "connected" && vc.activeConvoId === activeConvo?.id) {
                      vc.hangup()
                    } else if (vc.callState === "idle" && activeConvo) {
                      vc.startCall(activeConvo.id, otherUserId(activeConvo))
                    }
                  }}
                >
                  {vc.callState === "connected" && vc.activeConvoId === activeConvo?.id ? "📵" : "📞"}
                </button>
              )}
              <span className="msg-user-tag">
                <AvatarDisplay avatar={me.avatar} size={16} />
                <span style={{ marginLeft: 4 }}>@{me.username}</span>
              </span>
              <button className="msg-close-btn" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          {activeConvo ? (
            <div className="msg-chat">
              {/* Active call mini bar inside chat */}
              {vc.callState === "connected" && vc.activeConvoId === activeConvo.id && (
                <div className="vc-mini-bar">
                  <div className="vc-active-dot" />
                  <span>Voice call · {formatDuration(vc.duration)}</span>
                  <button className={`vc-mute-btn-sm ${vc.isMuted ? "vc-mute-btn--on" : ""}`} onClick={vc.toggleMute}>
                    {vc.isMuted ? "🔇" : "🎙️"}
                  </button>
                  <button className="vc-hangup-btn-sm" onClick={vc.hangup}>📵</button>
                </div>
              )}

              <div className="msg-messages">
                {msgs.length === 0 && <div className="msg-empty">No messages yet. Say hi!</div>}
                {msgs.map(m => (
                  <div key={m.id} className={`msg-bubble-item ${m.fromId === me.id ? "msg-mine" : "msg-theirs"}`}>
                    {m.fromId !== me.id && <div className="msg-sender">{m.fromUsername}</div>}
                    <div className="msg-text">{m.text}</div>
                    <div className="msg-time">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                    </div>
                  </div>
                ))}
                {typingName && (
                  <div className="msg-typing">
                    <span className="msg-typing-name">{typingName}</span>
                    <span className="msg-typing-dots">
                      <span /><span /><span />
                    </span>
                  </div>
                )}
                <div ref={msgEnd} />
              </div>
              <div className="msg-input-row">
                <input
                  className="msg-input"
                  placeholder="Message…"
                  value={draft}
                  onChange={e => handleDraftChange(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && !e.shiftKey && submit()}
                  autoFocus
                />
                <button className="msg-send-btn" onClick={submit} disabled={!draft.trim()}>↑</button>
              </div>
            </div>
          ) : (
            <>
              <div className="msg-tabs">
                {[
                  { id: "convos",   label: "Chats" },
                  { id: "friends",  label: "Friends" },
                  { id: "requests", label: `Requests${incomingReqs.length ? ` (${incomingReqs.length})` : ""}` },
                  { id: "search",   label: "Find" },
                  { id: "newgroup", label: "+ Group" },
                ].map(t => (
                  <button key={t.id} className={`msg-tab ${panel === t.id ? "msg-tab--on" : ""}`}
                    onClick={() => setPanel(t.id as Panel)}>{t.label}</button>
                ))}
              </div>

              <div className="msg-body">
                {panel === "convos" && (
                  convos.length === 0
                    ? <div className="msg-empty">No conversations yet.<br />Find a friend to start chatting.</div>
                    : convos.map(c => (
                        <button key={c.id} className="msg-convo-row" onClick={() => openConvo(c)}>
                          <div className="msg-convo-avatar">{c.name ? "👥" : "💬"}</div>
                          <div className="msg-convo-info">
                            <div className="msg-convo-name">{convoName(c)}</div>
                            <div className="msg-convo-last">{c.lastMessage || "No messages yet"}</div>
                          </div>
                          {isDM(c) && <span className="msg-convo-vc-icon" title="Voice call available">📞</span>}
                        </button>
                      ))
                )}

                {panel === "friends" && (
                  friends.length === 0
                    ? <div className="msg-empty">No friends yet.<br />Use Find to search for users.</div>
                    : friends.map(f => (
                        <div key={f.id} className="msg-friend-row">
                          <AvatarDisplay avatar={f.avatar} size={30} />
                          <div className="msg-friend-info">
                            <div className="msg-friend-name">@{f.username}</div>
                          </div>
                          <button className="msg-action-btn" onClick={() => openDM(f)}>Chat</button>
                        </div>
                      ))
                )}

                {panel === "requests" && (
                  incomingReqs.length === 0
                    ? <div className="msg-empty">No pending friend requests.</div>
                    : incomingReqs.map(r => (
                        <div key={r.id} className="msg-req-row">
                          <div className="msg-req-info">
                            <span className="msg-req-name">@{r.fromUsername}</span>
                            <span className="msg-req-time">wants to be friends</span>
                          </div>
                          <div className="msg-req-actions">
                            <button className="msg-accept-btn" onClick={() => doAccept(r.id)}>✓</button>
                            <button className="msg-decline-btn" onClick={() => doDecline(r.id)}>✕</button>
                          </div>
                        </div>
                      ))
                )}

                {panel === "search" && (
                  <div className="msg-search-panel">
                    <p className="msg-panel-hint">Search by exact username to add a friend.</p>
                    <div className="msg-search-row">
                      <input className="msg-input" placeholder="Username…"
                        value={searchQ} onChange={e => { setSearchQ(e.target.value); setSearchResult(null) }}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && doSearch()} />
                      <button className="msg-send-btn" onClick={doSearch}>🔍</button>
                    </div>
                    {searchResult === "none" && <div className="msg-empty">No user found.</div>}
                    {searchResult && searchResult !== "none" && (
                      <div className="msg-friend-row">
                        <AvatarDisplay avatar={searchResult.avatar} size={30} />
                        <div className="msg-friend-info">
                          <div className="msg-friend-name">@{searchResult.username}</div>
                        </div>
                        {getFriendsOf(me.id).find(f => f.id === (searchResult as User).id)
                          ? <span className="msg-already-friends">Friends ✓</span>
                          : <button className="msg-action-btn" onClick={() => doFriendRequest(searchResult as User)}>+ Add</button>}
                      </div>
                    )}
                  </div>
                )}

                {panel === "newgroup" && (
                  <div className="msg-search-panel">
                    <p className="msg-panel-hint">Create a group chat with your friends.</p>
                    <input className="msg-input" placeholder="Group name…"
                      value={groupName} onChange={e => setGroupName(e.target.value)} />
                    <p className="msg-panel-hint" style={{ marginTop: 8 }}>Select members:</p>
                    {friends.length === 0
                      ? <div className="msg-empty">Add friends first.</div>
                      : friends.map(f => (
                          <label key={f.id} className="msg-member-row">
                            <input type="checkbox"
                              checked={groupMembers.some(m => m.id === f.id)}
                              onChange={e => {
                                if (e.target.checked) setGroupMembers(p => [...p, f])
                                else setGroupMembers(p => p.filter(m => m.id !== f.id))
                              }} />
                            <AvatarDisplay avatar={f.avatar} size={20} />
                            <span style={{ marginLeft: 4 }}>@{f.username}</span>
                          </label>
                        ))}
                    <button className="msg-create-btn" onClick={makeGroup}
                      disabled={!groupName.trim() || groupMembers.length === 0}>
                      Create Group
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
