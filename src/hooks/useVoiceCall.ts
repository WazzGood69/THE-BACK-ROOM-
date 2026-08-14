import { useEffect, useRef, useState, useCallback } from "react"

// ── Signaling via localStorage + storage events ────────────────────
// Works cross-window (different browser tabs/windows on the same origin).
// On a LAN server all users share origin → signaling just works.

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
]

type CallState = "idle" | "calling" | "incoming" | "connected" | "ended"

interface Signal {
  callId: string
  type: "offer" | "answer" | "ice-caller" | "ice-callee" | "hangup"
  fromId: string
  toId: string
  convoId: string
  sdp?: string
  candidates?: RTCIceCandidateInit[]
  timestamp: number
}

function sigKey(convoId: string) { return `tbr_vc_${convoId}` }
function writeSignal(convoId: string, s: Signal) {
  localStorage.setItem(sigKey(convoId), JSON.stringify(s))
}
function readSignal(convoId: string): Signal | null {
  try { return JSON.parse(localStorage.getItem(sigKey(convoId)) ?? "null") }
  catch { return null }
}
function clearSignal(convoId: string) { localStorage.removeItem(sigKey(convoId)) }

// ── Hook ──────────────────────────────────────────────────────────
export function useVoiceCall(myId: string, myName: string) {
  const [callState, setCallState] = useState<CallState>("idle")
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null)
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null)
  const [incomingCallerName, setIncomingCallerName] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [callId, setCallId] = useState<string | null>(null)

  const pc          = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const remoteAudio = useRef<HTMLAudioElement | null>(null)
  const durTimer    = useRef<ReturnType<typeof setInterval> | null>(null)
  const iceQueue    = useRef<RTCIceCandidateInit[]>([])

  const cleanup = useCallback(() => {
    pc.current?.close(); pc.current = null
    localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null
    if (remoteAudio.current) { remoteAudio.current.srcObject = null }
    if (durTimer.current) { clearInterval(durTimer.current); durTimer.current = null }
    if (activeConvoId) clearSignal(activeConvoId)
    setCallState("idle"); setIsMuted(false); setDuration(0)
    setIncomingCallerId(null); setIncomingCallerName(null)
    iceQueue.current = []
  }, [activeConvoId])

  function newPC(): RTCPeerConnection {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    conn.ontrack = (e) => {
      if (!remoteAudio.current) {
        remoteAudio.current = new Audio()
        remoteAudio.current.autoplay = true
      }
      remoteAudio.current.srcObject = e.streams[0]
    }
    return conn
  }

  // ── Initiate a call ───────────────────────────────────────────────
  const startCall = useCallback(async (convoId: string, toId: string) => {
    if (callState !== "idle") return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStream.current = stream
      const conn = newPC()
      pc.current = conn
      stream.getTracks().forEach(t => conn.addTrack(t, stream))
      const id = Math.random().toString(36).slice(2)
      setCallId(id)
      setActiveConvoId(convoId)
      setCallState("calling")

      const iceCandidates: RTCIceCandidateInit[] = []
      conn.onicecandidate = (e) => { if (e.candidate) iceCandidates.push(e.candidate.toJSON()) }

      const offer = await conn.createOffer()
      await conn.setLocalDescription(offer)

      // Wait for ICE gathering
      await new Promise<void>(res => {
        if (conn.iceGatheringState === "complete") { res(); return }
        const h = () => { if (conn.iceGatheringState === "complete") { conn.removeEventListener("icegatheringstatechange", h); res() } }
        conn.addEventListener("icegatheringstatechange", h)
        setTimeout(res, 3000)
      })

      writeSignal(convoId, {
        callId: id, type: "offer", fromId: myId, toId, convoId,
        sdp: conn.localDescription!.sdp,
        candidates: iceCandidates,
        timestamp: Date.now(),
      })
    } catch (e) {
      console.warn("Voice call failed:", e)
      cleanup()
    }
  }, [callState, myId, cleanup])

  // ── Accept incoming call ──────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!activeConvoId) return
    const sig = readSignal(activeConvoId)
    if (!sig || sig.type !== "offer") return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStream.current = stream
      const conn = newPC()
      pc.current = conn
      stream.getTracks().forEach(t => conn.addTrack(t, stream))

      await conn.setRemoteDescription({ type: "offer", sdp: sig.sdp! })
      if (sig.candidates) {
        for (const c of sig.candidates) await conn.addIceCandidate(c).catch(() => {})
      }

      const answer = await conn.createAnswer()
      await conn.setLocalDescription(answer)
      const ansIce: RTCIceCandidateInit[] = []
      conn.onicecandidate = (e) => { if (e.candidate) ansIce.push(e.candidate.toJSON()) }

      await new Promise<void>(res => {
        if (conn.iceGatheringState === "complete") { res(); return }
        const h = () => { if (conn.iceGatheringState === "complete") { conn.removeEventListener("icegatheringstatechange", h); res() } }
        conn.addEventListener("icegatheringstatechange", h)
        setTimeout(res, 3000)
      })

      writeSignal(activeConvoId, {
        callId: sig.callId, type: "answer", fromId: myId, toId: sig.fromId, convoId: activeConvoId,
        sdp: conn.localDescription!.sdp, candidates: ansIce, timestamp: Date.now(),
      })

      setCallId(sig.callId)
      setCallState("connected")
      durTimer.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch (e) {
      console.warn("Voice accept failed:", e)
      cleanup()
    }
  }, [activeConvoId, myId, cleanup])

  // ── Hangup ────────────────────────────────────────────────────────
  const hangup = useCallback(() => {
    if (activeConvoId) {
      writeSignal(activeConvoId, {
        callId: callId ?? "", type: "hangup", fromId: myId, toId: "", convoId: activeConvoId,
        timestamp: Date.now(),
      })
    }
    cleanup()
    setActiveConvoId(null); setCallId(null)
  }, [activeConvoId, callId, myId, cleanup])

  // ── Toggle mute ───────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }, [])

  // ── Listen for signals via storage events ─────────────────────────
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (!e.key?.startsWith("tbr_vc_")) return
      try {
        const sig: Signal = JSON.parse(e.newValue ?? "null")
        if (!sig) return
        if (Date.now() - sig.timestamp > 30000) return

        if (sig.type === "offer" && sig.toId === myId && callState === "idle") {
          setIncomingCallerId(sig.fromId)
          setIncomingCallerName(sig.fromId)
          setActiveConvoId(sig.convoId)
          setCallState("incoming")
        }

        if (sig.type === "answer" && sig.toId === myId && pc.current) {
          pc.current.setRemoteDescription({ type: "answer", sdp: sig.sdp! })
            .then(() => {
              if (sig.candidates) {
                sig.candidates.forEach(c => pc.current!.addIceCandidate(c).catch(() => {}))
              }
              setCallState("connected")
              durTimer.current = setInterval(() => setDuration(d => d + 1), 1000)
            }).catch(console.warn)
        }

        if (sig.type === "hangup" && (sig.toId === myId || sig.fromId === myId)) {
          cleanup()
          setActiveConvoId(null); setCallId(null)
        }
      } catch { /* ignore */ }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [myId, callState, cleanup])

  return {
    callState, activeConvoId, isMuted, duration,
    incomingCallerId, incomingCallerName,
    startCall, acceptCall, hangup, toggleMute,
  }
}

export function formatDuration(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0")
  const s = (secs % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}
