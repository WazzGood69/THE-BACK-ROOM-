import { User, Conversation, Message, FriendRequest, Theme } from "./types"

// ── Simple hash (not cryptographic, just obfuscation) ──────────────────
export function hashPw(pw: string): string {
  let h = 0
  for (let i = 0; i < pw.length; i++) h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0
  return h.toString(36)
}

// ── Persistence keys ───────────────────────────────────────────────────
const K = {
  me:       "tbr_me",
  users:    "tbr_users",
  reqs:     "tbr_reqs",
  convos:   "tbr_convos",
  msgs:     "tbr_msgs",
  theme:    "tbr_theme",
  booted:   "tbr_booted",
}

function get<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function set(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val))
}

// ── User registry (all users who have registered) ─────────────────────
export function getAllUsers(): User[] { return get<User[]>(K.users, []) }
export function saveUser(u: User) {
  const all = getAllUsers().filter(x => x.id !== u.id)
  set(K.users, [...all, u])
}
export function findUserByUsername(name: string): User | null {
  return getAllUsers().find(u => u.username.toLowerCase() === name.toLowerCase()) ?? null
}

// ── Current user ──────────────────────────────────────────────────────
export function getMe(): User | null { return get<User | null>(K.me, null) }
export function setMe(u: User | null) { set(K.me, u) }

// ── Theme ─────────────────────────────────────────────────────────────
export function getTheme(): Theme { return get<Theme>(K.theme, "black") }
export function setTheme(t: Theme) { set(K.theme, t) }

// ── Boot flag ─────────────────────────────────────────────────────────
export function hasBooted(): boolean { return get<boolean>(K.booted, false) }
export function markBooted() { set(K.booted, true) }

// ── Friend requests ───────────────────────────────────────────────────
export function getRequests(): FriendRequest[] { return get<FriendRequest[]>(K.reqs, []) }
function saveRequests(rs: FriendRequest[]) { set(K.reqs, rs) }

export function sendFriendRequest(from: User, to: User): FriendRequest | null {
  const reqs = getRequests()
  const exists = reqs.find(r =>
    ((r.fromId === from.id && r.toId === to.id) ||
     (r.fromId === to.id && r.toId === from.id)) &&
    r.status === "pending")
  if (exists) return null
  const req: FriendRequest = {
    id: uid(), fromId: from.id, fromUsername: from.username,
    toId: to.id, toUsername: to.username,
    status: "pending", createdAt: Date.now()
  }
  saveRequests([...reqs, req])
  return req
}

export function acceptRequest(reqId: string): void {
  const reqs = getRequests().map(r => r.id === reqId ? { ...r, status: "accepted" as const } : r)
  saveRequests(reqs)
}
export function declineRequest(reqId: string): void {
  const reqs = getRequests().map(r => r.id === reqId ? { ...r, status: "declined" as const } : r)
  saveRequests(reqs)
}

export function getFriendsOf(userId: string): User[] {
  const reqs = getRequests().filter(r =>
    r.status === "accepted" && (r.fromId === userId || r.toId === userId))
  const all = getAllUsers()
  return reqs.map(r => {
    const otherId = r.fromId === userId ? r.toId : r.fromId
    return all.find(u => u.id === otherId)
  }).filter(Boolean) as User[]
}

// ── Conversations ─────────────────────────────────────────────────────
export function getConvos(): Conversation[] { return get<Conversation[]>(K.convos, []) }
function saveConvos(cs: Conversation[]) { set(K.convos, cs) }

export function getOrCreateDM(me: User, other: User): Conversation {
  const convos = getConvos()
  const dm = convos.find(c =>
    !c.name &&
    c.memberIds.length === 2 &&
    c.memberIds.includes(me.id) &&
    c.memberIds.includes(other.id))
  if (dm) return dm
  const fresh: Conversation = {
    id: uid(), name: null,
    memberIds: [me.id, other.id],
    memberUsernames: [me.username, other.username],
    createdAt: Date.now(), lastMessage: "", lastAt: Date.now()
  }
  saveConvos([...convos, fresh])
  return fresh
}

export function createGroup(me: User, name: string, members: User[]): Conversation {
  const all = [me, ...members]
  const c: Conversation = {
    id: uid(), name,
    memberIds: all.map(u => u.id),
    memberUsernames: all.map(u => u.username),
    createdAt: Date.now(), lastMessage: "", lastAt: Date.now()
  }
  saveConvos([...getConvos(), c])
  return c
}

export function getConvosFor(userId: string): Conversation[] {
  return getConvos()
    .filter(c => c.memberIds.includes(userId))
    .sort((a, b) => b.lastAt - a.lastAt)
}

// ── Messages ──────────────────────────────────────────────────────────
export function getMsgs(convoId: string): Message[] {
  return get<Record<string, Message[]>>(K.msgs, {})[convoId] ?? []
}
export function sendMsg(convoId: string, from: User, text: string): Message {
  const all = get<Record<string, Message[]>>(K.msgs, {})
  const m: Message = { id: uid(), conversationId: convoId, fromId: from.id, fromUsername: from.username, text, createdAt: Date.now() }
  all[convoId] = [...(all[convoId] ?? []), m]
  set(K.msgs, all)
  // Update convo lastMessage
  const convos = getConvos().map(c => c.id === convoId ? { ...c, lastMessage: text, lastAt: Date.now() } : c)
  saveConvos(convos)
  return m
}

// ── Avatars ───────────────────────────────────────────────────────────
const AVATARS = ["🦊","🐺","🐻","🐼","🦁","🐯","🐨","🐸","🦋","🦄","🐙","🦑","🦅","🦉","🐬","🐧","🦊","🦝","🦨","🦡"]
export function pickAvatar() { return AVATARS[Math.floor(Math.random() * AVATARS.length)] }

function uid() { return Math.random().toString(36).slice(2, 10) }
