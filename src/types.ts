export type Theme = "black" | "white" | "oldschool" | "oxide" | "midnight" | "sepia"

export interface User {
  id: string
  username: string
  passwordHash: string | null
  createdAt: number
  avatar: string // emoji OR image URL (starts with http)
}

export interface FriendRequest {
  id: string
  fromId: string
  fromUsername: string
  toId: string
  toUsername: string
  status: "pending" | "accepted" | "declined"
  createdAt: number
}

export interface Message {
  id: string
  conversationId: string
  fromId: string
  fromUsername: string
  text: string
  createdAt: number
}

export interface Conversation {
  id: string
  name: string | null // null = DM, string = group name
  memberIds: string[]
  memberUsernames: string[]
  createdAt: number
  lastMessage: string
  lastAt: number
}

export interface Broadcast {
  id: string
  text: string
  type: "info" | "warning" | "update"
  createdAt: number
}

export interface AppState {
  currentUser: User | null
  friends: User[]
  friendRequests: FriendRequest[]
  conversations: Conversation[]
  messages: Record<string, Message[]>
  theme: Theme
  booted: boolean
}
