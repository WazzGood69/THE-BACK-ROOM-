import { useState, useEffect, useRef, KeyboardEvent } from "react"
import { User, Conversation, Message, FriendRequest } from "../types"
import {
  getConvosFor, getMsgs, sendMsg,
  getFriendsOf, getRequests, sendFriendRequest, acceptRequest, declineRequest,
  findUserByUsername, getOrCreateDM, createGroup,
} from "../store"

interface Props { me: User }

type Panel = "convos" | "friends" | "requests" | "search" | "newgroup"

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
  const msgEnd = useRef<HTMLDivElement>(null)

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
  }, [me.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeConvo) {
      setMsgs(getMsgs(activeConvo.id))
      const t = setInterval(() => setMsgs(getMsgs(activeConvo.id)), 2000)
      return () => clearInterval(t)
    }
  }, [activeConvo])

  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs])

  function openConvo(c: Conversation) {
    setActiveConvo(c)
    setMsgs(getMsgs(c.id))
    setPanel("convos")
  }

  function openDM(friend: User) {
    const c = getOrCreateDM(me, friend)
    setConvos(getConvosFor(me.id))
    openConvo(c)
  }

  function submit() {
    if (!draft.trim() || !activeConvo) return
    sendMsg(activeConvo.id, me, draft.trim())
    setDraft("")
    setMsgs(getMsgs(activeConvo.id))
    refresh()
  }

  function doSearch() {
    if (!searchQ.trim()) return
    const found = findUserByUsername(searchQ.trim())
    if (!found || found.id === me.id) { setSearchResult("none"); return }
    setSearchResult(found)
  }

  function doFriendRequest(target: User) {
    sendFriendRequest(me, target)
    showNotify(`Friend request sent to @${target.username}!`)
    setSearchQ(""); setSearchResult(null)
  }

  function doAccept(reqId: string) { acceptRequest(reqId); refresh(); showNotify("Friend request accepted!") }
  function doDecline(reqId: string) { declineRequest(reqId); refresh() }

  function makeGroup() {
    if (!groupName.trim() || groupMembers.length === 0) return
    const c = createGroup(me, groupName.trim(), groupMembers)
    refresh()
    openConvo(c)
    setGroupName(""); setGroupMembers([])
  }

  function showNotify(msg: string) {
    setNotify(msg)
    setTimeout(() => setNotify(null), 3000)
  }

  const incomingReqs = reqs.filter(r => r.toId === me.id && r.status === "pending")

  const convoName = (c: Conversation) =>
    c.name ?? c.memberUsernames.find(u => u !== me.username) ?? "Chat"

  return (
    <>
      {/* Notification toast */}
      {notify && <div className="msg-toast">{notify}</div>}

      {/* Collapsed bubble */}
      {!open && (
        <button className="msg-bubble" onClick={() => setOpen(true)} title="Open Messenger">
          <span className="msg-bubble-icon">💬</span>
          {unread > 0 && <span className="msg-badge">{unread}</span>}
        </button>
      )}

      {/* Messenger panel */}
      {open && (
        <div className="msg-panel">
          {/* Header */}
          <div className="msg-header">
            <span className="msg-header-title">
              {activeConvo ? (
                <button className="msg-back-btn" onClick={() => setActiveConvo(null)}>←</button>
              ) : null}
              {activeConvo ? convoName(activeConvo) : "Messages"}
            </span>
            <div className="msg-header-actions">
              <span className="msg-user-tag">@{me.username} {me.avatar}</span>
              <button className="msg-close-btn" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          {activeConvo ? (
            /* ── Chat view ── */
            <div className="msg-chat">
              <div className="msg-messages">
                {msgs.length === 0 && (
                  <div className="msg-empty">No messages yet. Say hi!</div>
                )}
                {msgs.map(m => (
                  <div key={m.id} className={`msg-bubble-item ${m.fromId === me.id ? "msg-mine" : "msg-theirs"}`}>
                    {m.fromId !== me.id && (
                      <div className="msg-sender">{m.fromUsername}</div>
                    )}
                    <div className="msg-text">{m.text}</div>
                    <div className="msg-time">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                    </div>
                  </div>
                ))}
                <div ref={msgEnd} />
              </div>
              <div className="msg-input-row">
                <input
                  className="msg-input"
                  placeholder="Message…"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && submit()}
                  autoFocus
                />
                <button className="msg-send-btn" onClick={submit} disabled={!draft.trim()}>↑</button>
              </div>
            </div>
          ) : (
            /* ── Navigation panels ── */
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
                {/* Convos */}
                {panel === "convos" && (
                  convos.length === 0
                    ? <div className="msg-empty">No conversations yet.<br/>Find a friend to start chatting.</div>
                    : convos.map(c => (
                        <button key={c.id} className="msg-convo-row" onClick={() => openConvo(c)}>
                          <div className="msg-convo-avatar">{c.name ? "👥" : "💬"}</div>
                          <div className="msg-convo-info">
                            <div className="msg-convo-name">{convoName(c)}</div>
                            <div className="msg-convo-last">{c.lastMessage || "No messages yet"}</div>
                          </div>
                        </button>
                      ))
                )}

                {/* Friends */}
                {panel === "friends" && (
                  friends.length === 0
                    ? <div className="msg-empty">No friends yet.<br/>Use Find to search for users.</div>
                    : friends.map(f => (
                        <div key={f.id} className="msg-friend-row">
                          <span className="msg-friend-avatar">{f.avatar}</span>
                          <div className="msg-friend-info">
                            <div className="msg-friend-name">{f.avatar} @{f.username}</div>
                          </div>
                          <button className="msg-action-btn" onClick={() => openDM(f)}>DM</button>
                        </div>
                      ))
                )}

                {/* Requests */}
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

                {/* Search / Find */}
                {panel === "search" && (
                  <div className="msg-search-panel">
                    <p className="msg-panel-hint">Search by exact username to send a friend request.</p>
                    <div className="msg-search-row">
                      <input className="msg-input" placeholder="Username…"
                        value={searchQ} onChange={e => { setSearchQ(e.target.value); setSearchResult(null) }}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && doSearch()} />
                      <button className="msg-send-btn" onClick={doSearch}>🔍</button>
                    </div>
                    {searchResult === "none" && (
                      <div className="msg-empty">No user found with that username.</div>
                    )}
                    {searchResult && searchResult !== "none" && (
                      <div className="msg-friend-row">
                        <span className="msg-friend-avatar">{searchResult.avatar}</span>
                        <div className="msg-friend-info">
                          <div className="msg-friend-name">@{searchResult.username}</div>
                        </div>
                        {getFriendsOf(me.id).find(f => f.id === searchResult.id)
                          ? <span className="msg-already-friends">Friends ✓</span>
                          : <button className="msg-action-btn" onClick={() => doFriendRequest(searchResult as User)}>+ Add</button>}
                      </div>
                    )}
                  </div>
                )}

                {/* New group */}
                {panel === "newgroup" && (
                  <div className="msg-search-panel">
                    <p className="msg-panel-hint">Create a group with your friends.</p>
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
                                if (e.target.checked) setGroupMembers(prev => [...prev, f])
                                else setGroupMembers(prev => prev.filter(m => m.id !== f.id))
                              }} />
                            <span>{f.avatar} @{f.username}</span>
                          </label>
                        ))}
                    <button className="msg-send-btn msg-create-btn"
                      onClick={makeGroup}
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
