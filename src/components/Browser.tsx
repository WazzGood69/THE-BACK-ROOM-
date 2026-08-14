import { useState, useRef, useCallback, useEffect, KeyboardEvent, memo } from "react"
import { SearchEngine } from "./Settings"

// ── Types ─────────────────────────────────────────────────────────────────
type LoadPhase = "idle" | "fetching" | "loaded" | "blocked" | "error"

interface Tab {
  id: string; url: string; title: string; phase: LoadPhase; errMsg: string
  canGoBack: boolean; canGoForward: boolean
  history: string[]; histIdx: number
  favicon: string; srcDoc: string | null; useDirect: boolean
}

interface Bookmark { id: string; url: string; title: string; favicon: string }

// ── Proxy chain ───────────────────────────────────────────────────────────
const PROXIES: Array<(u: string) => string> = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

// Injected into every proxy page — intercepts ALL navigation attempts
const NAV_SCRIPT = /* html */`<script>
(function(){
  var send = function(url){
    try {
      var abs = new URL(url, document.baseURI).href;
      if(abs.startsWith('javascript:')||abs.startsWith('mailto:')||abs.startsWith('tel:')) return false;
      window.parent.postMessage({type:'tbr-nav',url:abs},'*');
      return true;
    } catch(e){ return false; }
  };
  document.addEventListener('click', function(e){
    var el = e.target;
    while(el && el.tagName !== 'A') el = el.parentElement;
    if(el && el.href){ if(send(el.href)) e.preventDefault(); }
  }, true);
  document.addEventListener('submit', function(e){
    var f = e.target;
    if((f.method||'get').toLowerCase()==='get'){
      var p = new URLSearchParams(new FormData(f));
      var url = (f.action||location.href).split('?')[0]+'?'+p;
      if(send(url)) e.preventDefault();
    }
  }, true);
  var origOpen = window.open;
  window.open = function(url){ if(url) send(url); return null; };
  var origAssign = location.assign.bind(location);
  var origReplace = location.replace.bind(location);
  location.assign  = function(u){ if(!send(u)) origAssign(u); };
  location.replace = function(u){ if(!send(u)) origReplace(u); };
  try { Object.defineProperty(location,'href',{ set: function(u){ send(u); } }); } catch(e){}
  // Patch pushState / replaceState
  var origPush = history.pushState.bind(history);
  var origRep  = history.replaceState.bind(history);
  history.pushState = function(s,t,u){ send(u||location.href); origPush(s,t,u); };
  history.replaceState = function(s,t,u){ if(u) send(u); origRep(s,t,u); };
})();
<\/script>`

// ── Dark-mode injection ───────────────────────────────────────────────────
const DARK_STYLE = `<style>
html{filter:invert(1) hue-rotate(180deg) !important}
img,video,canvas,iframe{filter:invert(1) hue-rotate(180deg) !important}
</style>`

const BLOCKED_DOMAINS = [
  "google.com","youtube.com","facebook.com","instagram.com",
  "twitter.com","x.com","netflix.com","linkedin.com","tiktok.com","discord.com",
]
function isLikelyBlocked(url: string) {
  try { return BLOCKED_DOMAINS.some(d => new URL(url).hostname.endsWith(d)) }
  catch { return false }
}

function isOnion(url: string) {
  try { return new URL(url).hostname.endsWith(".onion") }
  catch { return false }
}

function onionToGateway(url: string) {
  // Convert .onion URL to onion.ws gateway
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/\.onion$/, "")
    return `https://${host}.onion.ws${u.pathname}${u.search}`
  } catch { return url }
}

async function fetchProxy(url: string, signal: AbortSignal, darkMode = false): Promise<string> {
  const errs: string[] = []
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let html = await res.text()
      if (!html.trim()) throw new Error("Empty response")

      // Fix relative URLs
      const head = `<base href="${url}">${NAV_SCRIPT}${darkMode ? DARK_STYLE : ""}`
      if (/<head[\s>]/i.test(html)) {
        html = html.replace(/(<head[\s>][^>]*>)/i, `$1${head}`)
      } else if (/<html[\s>]/i.test(html)) {
        html = html.replace(/(<html[\s>][^>]*>)/i, `$1<head>${head}</head>`)
      } else {
        html = `<head>${head}</head>${html}`
      }
      return html
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") throw e
      errs.push(String(e instanceof Error ? e.message : e))
    }
  }
  throw new Error("All proxies failed — " + errs.slice(0, 2).join(" | "))
}

// ── Bookmarks ─────────────────────────────────────────────────────────────
const BM_KEY = "tbr_bookmarks"
function loadBookmarks(): Bookmark[] {
  try { return JSON.parse(localStorage.getItem(BM_KEY) ?? "[]") } catch { return [] }
}
function saveBookmarks(bms: Bookmark[]) { localStorage.setItem(BM_KEY, JSON.stringify(bms)) }

// ── Helpers ───────────────────────────────────────────────────────────────
const NEWTAB = "about:newtab"

function normalize(raw: string, searchEngine: SearchEngine = "duckduckgo"): string {
  raw = raw.trim()
  if (!raw || raw === NEWTAB) return NEWTAB
  if (raw.startsWith("about:")) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  // .onion addresses
  if (/\.onion(\/|$)/.test(raw)) return "http://" + raw
  if (/^[\w.-]+\.\w{2,}/.test(raw) && !raw.includes(" ")) return "https://" + raw
  const q = encodeURIComponent(raw)
  const engines: Record<SearchEngine, string> = {
    duckduckgo: `https://html.duckduckgo.com/html?q=${q}`,
    google:     `https://www.google.com/search?q=${q}`,
    bing:       `https://www.bing.com/search?q=${q}`,
    brave:      `https://search.brave.com/search?q=${q}`,
  }
  return engines[searchEngine]
}

function pretty(url: string) {
  if (url === NEWTAB) return ""
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "")
  } catch { return url }
}

function faviconFor(url: string) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` }
  catch { return "" }
}

let _seq = 0
const uid = () => `t${++_seq}`

function mkTab(url = NEWTAB): Tab {
  return {
    id: uid(), url, title: url === NEWTAB ? "New Tab" : pretty(url),
    phase: url === NEWTAB ? "idle" : "fetching", errMsg: "",
    canGoBack: false, canGoForward: false,
    history: [url], histIdx: 0,
    favicon: url !== NEWTAB ? faviconFor(url) : "",
    srcDoc: null, useDirect: false,
  }
}

const QUICK_LINKS = [
  { label: "Wikipedia",     url: "https://en.m.wikipedia.org/wiki/Main_Page", bg: "#3366cc" },
  { label: "Hacker News",   url: "https://news.ycombinator.com",              bg: "#e05c1a" },
  { label: "DuckDuckGo",    url: "https://html.duckduckgo.com/html",          bg: "#de5833" },
  { label: "Reddit",        url: "https://old.reddit.com",                    bg: "#ff4500" },
  { label: "GitHub",        url: "https://github.com",                        bg: "#24292f" },
  { label: "W3Schools",     url: "https://www.w3schools.com",                 bg: "#3fa040" },
  { label: "Archive.org",   url: "https://archive.org",                       bg: "#428bca" },
  { label: "NASA",          url: "https://www.nasa.gov",                      bg: "#0b3d91" },
  { label: "MDN",           url: "https://developer.mozilla.org",             bg: "#0a7870" },
  { label: "OpenStreetMap", url: "https://www.openstreetmap.org",             bg: "#7db43a" },
  { label: "Brave Search",  url: "https://search.brave.com",                  bg: "#f04b22" },
  { label: "Proton Mail",   url: "https://mail.proton.me",                    bg: "#6d4aff" },
]

// ── Props ─────────────────────────────────────────────────────────────────
interface Props {
  homePage: string
  searchEngine: SearchEngine
  showClock: boolean
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Browser({ homePage, searchEngine, showClock }: Props) {
  const [tabs, setTabs]           = useState<Tab[]>([mkTab()])
  const [activeId, setActiveId]   = useState<string>(() => tabs[0].id)
  const [addrVal, setAddrVal]     = useState("")
  const [addrFocus, setAddrFocus] = useState(false)
  const [torMode, setTorMode]     = useState(false)
  const [darkMode, setDarkMode]   = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks)
  const [showBmBar, setShowBmBar] = useState(false)
  const aborts   = useRef<Record<string, AbortController>>({})
  const shellRef = useRef<HTMLDivElement>(null)
  const addrRef  = useRef<HTMLInputElement>(null)

  const active = tabs.find(t => t.id === activeId) ?? tabs[0]

  const patch = useCallback((id: string, p: Partial<Tab>) =>
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...p } : t)), [])

  useEffect(() => {
    if (!addrFocus) setAddrVal(active.url === NEWTAB ? "" : active.url)
  }, [active.url, active.id, addrFocus])

  // postMessage → in-page navigation
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "tbr-nav" && typeof e.data.url === "string") {
        load(activeId, e.data.url)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [activeId]) // eslint-disable-line

  const load = useCallback(async (tabId: string, rawUrl: string, push = true) => {
    if (rawUrl === NEWTAB) {
      setTabs(prev => prev.map(t => {
        if (t.id !== tabId) return t
        const hist = push ? [...t.history.slice(0, t.histIdx + 1), rawUrl] : t.history
        const idx  = push ? hist.length - 1 : t.histIdx
        return { ...t, url: rawUrl, title: "New Tab", phase: "idle", srcDoc: null, useDirect: false,
          errMsg: "", favicon: "", history: hist, histIdx: idx,
          canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
      }))
      return
    }

    // Handle .onion URLs via gateway
    let url = rawUrl
    if (isOnion(rawUrl)) {
      url = onionToGateway(rawUrl)
    }

    aborts.current[tabId]?.abort()
    const ctrl = new AbortController()
    aborts.current[tabId] = ctrl

    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const hist = push ? [...t.history.slice(0, t.histIdx + 1), rawUrl] : t.history
      const idx  = push ? hist.length - 1 : t.histIdx
      return { ...t, url: rawUrl, title: pretty(rawUrl), phase: "fetching",
        srcDoc: null, useDirect: false, errMsg: "", favicon: faviconFor(rawUrl),
        history: hist, histIdx: idx,
        canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
    }))

    if (isLikelyBlocked(url)) {
      patch(tabId, { phase: "blocked", useDirect: true, srcDoc: null })
      return
    }

    try {
      const html = await Promise.race([
        fetchProxy(url, ctrl.signal, darkMode),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout after 20s")), 20000)),
      ])
      if (ctrl.signal.aborted) return
      patch(tabId, { phase: "loaded", srcDoc: html, useDirect: false, title: pretty(rawUrl) })
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return
      const msg = e instanceof Error ? e.message : String(e)
      patch(tabId, { phase: "loaded", srcDoc: null, useDirect: true, errMsg: msg })
    }
  }, [patch, darkMode])

  const navigate = (input: string) => load(active.id, normalize(input, searchEngine))
  const goBack = () => {
    if (!active.canGoBack) return
    const idx = active.histIdx - 1
    setTabs(prev => prev.map(t => t.id === active.id
      ? { ...t, histIdx: idx, canGoBack: idx > 0, canGoForward: true } : t))
    load(active.id, active.history[idx], false)
  }
  const goFwd = () => {
    if (!active.canGoForward) return
    const idx = active.histIdx + 1
    setTabs(prev => prev.map(t => t.id === active.id
      ? { ...t, histIdx: idx, canGoBack: true, canGoForward: idx < t.history.length - 1 } : t))
    load(active.id, active.history[idx], false)
  }
  const refresh = () => { if (active.url !== NEWTAB) load(active.id, active.url, false) }
  const openTab = (url = NEWTAB) => {
    const tab = mkTab(url); setTabs(prev => [...prev, tab]); setActiveId(tab.id)
    if (url !== NEWTAB) load(tab.id, url)
  }
  const closeTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    aborts.current[id]?.abort()
    setTabs(prev => {
      if (prev.length === 1) return [mkTab()]
      const next = prev.filter(t => t.id !== id)
      if (activeId === id) {
        const i = prev.findIndex(t => t.id === id)
        setActiveId(next[Math.min(i, next.length - 1)].id)
      }
      return next
    })
  }

  // Bookmarks
  const isBookmarked = active.url !== NEWTAB && bookmarks.some(b => b.url === active.url)
  const toggleBookmark = () => {
    if (isBookmarked) {
      const next = bookmarks.filter(b => b.url !== active.url)
      setBookmarks(next); saveBookmarks(next)
    } else if (active.url !== NEWTAB) {
      const bm: Bookmark = { id: uid(), url: active.url, title: active.title || pretty(active.url), favicon: active.favicon }
      const next = [bm, ...bookmarks].slice(0, 30)
      setBookmarks(next); saveBookmarks(next)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      const target = e.target as HTMLElement
      const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA"
      if (!inInput || e.key === "l" || e.key === "t" || e.key === "w" || e.key === "r") {
        if (e.key === "t") { e.preventDefault(); openTab() }
        if (e.key === "w") { e.preventDefault(); closeTab(active.id) }
        if (e.key === "l") { e.preventDefault(); addrRef.current?.focus(); addrRef.current?.select() }
        if (e.key === "r") { e.preventDefault(); refresh() }
        if (e.key === "d") { e.preventDefault(); toggleBookmark() }
        if (e.key === "Tab") {
          e.preventDefault()
          const idx = tabs.findIndex(t => t.id === activeId)
          const next = e.shiftKey
            ? tabs[(idx - 1 + tabs.length) % tabs.length]
            : tabs[(idx + 1) % tabs.length]
          setActiveId(next.id)
        }
        // Ctrl+1-8 → switch to tab N
        const n = parseInt(e.key)
        if (n >= 1 && n <= 8 && tabs[n - 1]) { e.preventDefault(); setActiveId(tabs[n - 1].id) }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [tabs, activeId, active.id, active.url]) // eslint-disable-line

  const addrKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  { navigate(addrVal); e.currentTarget.blur() }
    if (e.key === "Escape") { setAddrVal(active.url === NEWTAB ? "" : active.url); e.currentTarget.blur() }
  }

  const onionUrl = isOnion(active.url)

  return (
    <div className="br-shell" ref={shellRef}>
      {/* Tab strip */}
      <div className="br-tabstrip">
        <div className="br-tabs-scroll">
          {tabs.map(tab => (
            <BrTab key={tab.id} tab={tab} active={tab.id === activeId}
              onClick={() => setActiveId(tab.id)}
              onClose={e => closeTab(tab.id, e)} />
          ))}
        </div>
        <button className="br-newtab-btn" onClick={() => openTab()} title="New tab (Ctrl+T)">+</button>
      </div>

      {/* Toolbar */}
      <div className={`br-toolbar ${torMode ? "br-toolbar--tor" : ""}`}>
        <button className="br-nav-btn" onClick={goBack}  disabled={!active.canGoBack}    title="Back (Alt+←)">‹</button>
        <button className="br-nav-btn" onClick={goFwd}   disabled={!active.canGoForward} title="Forward (Alt+→)">›</button>
        <button className="br-nav-btn" onClick={refresh} disabled={active.phase==="fetching"} title="Refresh (Ctrl+R)">⟳</button>
        <button className="br-nav-btn" onClick={() => load(active.id, homePage)} title="Home">⌂</button>

        <div className={`br-omnibar ${addrFocus ? "br-omnibar--focus" : ""} ${torMode ? "br-omnibar--tor" : ""}`}>
          <span className="br-omni-icon">
            {torMode ? "🧅" : onionUrl ? "🧅" : active.url === NEWTAB ? "⌕" : active.url.startsWith("https") ? "🔒" : "🌐"}
          </span>
          <input
            ref={addrRef}
            className="br-omni-input"
            value={addrFocus ? addrVal : (active.url === NEWTAB ? "" : active.url)}
            onChange={e => setAddrVal(e.target.value)}
            onFocus={e => { setAddrFocus(true); setAddrVal(active.url === NEWTAB ? "" : active.url); setTimeout(() => e.target.select(), 0) }}
            onBlur={() => setAddrFocus(false)}
            onKeyDown={addrKey}
            placeholder={torMode ? "Search or enter URL (Tor Gateway mode)…" : "Search or enter URL… (Ctrl+L)"}
            spellCheck={false}
          />
          {active.phase === "fetching" && <span className="br-omni-spin" />}
        </div>

        {/* Bookmark */}
        <button
          className={`br-nav-btn br-bm-btn ${isBookmarked ? "br-bm-btn--on" : ""}`}
          onClick={toggleBookmark} title={isBookmarked ? "Remove bookmark (Ctrl+D)" : "Bookmark (Ctrl+D)"}
        >
          {isBookmarked ? "★" : "☆"}
        </button>

        {/* Bookmark bar toggle */}
        <button
          className={`br-nav-btn ${showBmBar ? "br-nav-btn--on" : ""}`}
          onClick={() => setShowBmBar(p => !p)} title="Bookmarks bar"
          style={{ fontSize: 13 }}
        >
          📚
        </button>

        {/* Dark mode */}
        <button
          className={`br-nav-btn ${darkMode ? "br-nav-btn--on" : ""}`}
          onClick={() => setDarkMode(p => !p)} title="Dark mode injection"
          style={{ fontSize: 13 }}
        >
          🌙
        </button>

        {/* Tor mode */}
        <button
          className={`br-nav-btn ${torMode ? "br-nav-btn--tor" : ""}`}
          onClick={() => setTorMode(p => !p)}
          title={torMode ? "Tor Gateway: ON (click to disable)" : "Enable Tor Gateway (routes .onion via onion.ws)"}
          style={{ fontSize: 14 }}
        >
          🧅
        </button>
      </div>

      {/* Bookmark bar */}
      {showBmBar && (
        <div className="br-bm-bar">
          {bookmarks.length === 0
            ? <span className="br-bm-empty">No bookmarks yet — star a page to save it</span>
            : bookmarks.map(bm => (
                <button key={bm.id} className="br-bm-item"
                  onClick={() => load(active.id, bm.url)}
                  onContextMenu={e => { e.preventDefault(); openTab(bm.url) }}
                  title={bm.url}>
                  {bm.favicon
                    ? <img src={bm.favicon} alt="" className="br-bm-fav" onError={e => (e.currentTarget.style.display="none")} />
                    : <span style={{ fontSize: 11 }}>◌</span>}
                  <span className="br-bm-label">{bm.title}</span>
                </button>
              ))
          }
        </div>
      )}

      {/* Tor warning banner */}
      {torMode && (
        <div className="br-tor-banner">
          🧅 <strong>Tor Gateway Mode</strong> — .onion sites route through <code>onion.ws</code>.
          This is a clearnet gateway, not real Tor Browser. Your IP is <strong>not</strong> anonymized.
          <button className="br-tor-dismiss" onClick={() => setTorMode(false)}>✕</button>
        </div>
      )}

      {/* Content */}
      <div className="br-content">
        {active.url === NEWTAB ? (
          <BrNewTab
            onNav={u => load(active.id, normalize(u, searchEngine))}
            onOpen={u => openTab(normalize(u, searchEngine))}
            showClock={showClock}
            searchEngine={searchEngine}
            bookmarks={bookmarks}
            onBmClick={url => load(active.id, url)}
            onBmOpen={url => openTab(url)}
          />
        ) : (
          <>
            {active.srcDoc && (
              <iframe key={active.id + "|src|" + active.url}
                srcDoc={active.srcDoc} className="br-frame"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                title={active.title} />
            )}
            {active.useDirect && !active.srcDoc && (
              <iframe key={active.id + "|dir|" + active.url}
                src={active.url} className="br-frame"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                title={active.title} />
            )}

            {active.phase === "fetching" && (
              <div className="br-overlay">
                <div className="br-spinner"><div className="br-spin-inner" /></div>
                <p className="br-ov-url">{pretty(active.url)}</p>
                <p className="br-ov-sub">Loading through proxy chain…</p>
              </div>
            )}

            {active.phase === "blocked" && (
              <div className="br-overlay br-overlay--blocked">
                <div className="br-blocked-icon">🔒</div>
                <p className="br-ov-title">Blocked by Site Policy</p>
                <p className="br-ov-url">{pretty(active.url)}</p>
                <p className="br-ov-sub">
                  This site enforces X-Frame-Options or CSP frame-ancestors restrictions
                  at the server level. No browser-based app can bypass this — it is enforced by the site itself.
                </p>
                <div className="br-ov-actions">
                  <a className="br-ov-btn" href={active.url} target="_blank" rel="noopener noreferrer">↗ Open in real browser</a>
                  <button className="br-ov-btn br-ov-btn--ghost" onClick={() => load(active.id, active.url, false)}>Try direct load</button>
                </div>
              </div>
            )}

            {(active.phase === "loaded" && active.useDirect && !active.srcDoc && !active.errMsg) && null}
            {(active.phase === "error" || (active.useDirect && active.errMsg && !active.srcDoc)) && (
              <div className="br-overlay">
                <div className="br-blocked-icon">⚠️</div>
                <p className="br-ov-title">Could Not Load Page</p>
                <p className="br-ov-url">{pretty(active.url)}</p>
                <p className="br-ov-sub">{active.errMsg || "All proxy servers failed to reach this page."}</p>
                <div className="br-ov-actions">
                  <button className="br-ov-btn" onClick={refresh}>Retry</button>
                  <a className="br-ov-btn br-ov-btn--ghost" href={active.url} target="_blank" rel="noopener noreferrer">Open directly</a>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Tab pill ──────────────────────────────────────────────────────────────
const BrTab = memo(function BrTab({ tab, active, onClick, onClose }: {
  tab: Tab; active: boolean; onClick: () => void; onClose: (e: React.MouseEvent) => void
}) {
  return (
    <div className={`br-tab ${active ? "br-tab--on" : ""}`} onClick={onClick} title={tab.title}>
      {tab.favicon
        ? <img src={tab.favicon} className="br-tab-fav" alt="" onError={e => (e.currentTarget.style.display="none")} />
        : <span className="br-tab-ico">◌</span>}
      <span className="br-tab-label">{tab.title}</span>
      {tab.phase === "fetching" && <span className="br-tab-spin" />}
      <button className="br-tab-x" onClick={onClose} aria-label="close tab">✕</button>
    </div>
  )
})

// ── New tab page ──────────────────────────────────────────────────────────
function BrNewTab({ onNav, onOpen, showClock, searchEngine, bookmarks, onBmClick, onBmOpen }: {
  onNav: (u: string) => void; onOpen: (u: string) => void
  showClock: boolean; searchEngine: SearchEngine
  bookmarks: Bookmark[]; onBmClick: (u: string) => void; onBmOpen: (u: string) => void
}) {
  const [q, setQ] = useState("")
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])

  const hh = time.getHours(), mm = String(time.getMinutes()).padStart(2, "0")
  const ampm = hh >= 12 ? "PM" : "AM", h12 = hh % 12 || 12

  const phs: Record<SearchEngine, string> = {
    duckduckgo: "Search DuckDuckGo…",
    google:     "Search Google…",
    bing:       "Search Bing…",
    brave:      "Search Brave…",
  }

  return (
    <div className="br-newtab">
      <div className="br-nt-inner">
        {showClock && (
          <div className="br-nt-clock-wrap">
            <div className="br-nt-clock">
              <span className="br-nt-hh">{h12}</span>
              <span className="br-nt-colon">:</span>
              <span className="br-nt-mm">{mm}</span>
              <span className="br-nt-ampm">{ampm}</span>
            </div>
            <div className="br-nt-date">
              {time.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
            </div>
          </div>
        )}

        <div className="br-nt-search">
          <span className="br-nt-search-icon">⌕</span>
          <input
            className="br-nt-q"
            placeholder={phs[searchEngine]}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && q.trim() && onNav(q)}
            autoFocus
          />
        </div>

        {bookmarks.length > 0 && (
          <div className="br-nt-bm-section">
            <div className="br-nt-section-label">★ Bookmarks</div>
            <div className="br-nt-bm-row">
              {bookmarks.slice(0, 8).map(bm => (
                <button key={bm.id} className="br-nt-bm-chip"
                  onClick={() => onBmClick(bm.url)}
                  onContextMenu={e => { e.preventDefault(); onBmOpen(bm.url) }}
                  title={bm.url}>
                  {bm.favicon
                    ? <img src={bm.favicon} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} onError={e => (e.currentTarget.style.display="none")} />
                    : <span>◌</span>}
                  <span>{bm.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="br-nt-section-label">Quick Links</div>
        <div className="br-nt-grid">
          {QUICK_LINKS.map(ql => (
            <button key={ql.url} className="br-nt-tile"
              onClick={() => onNav(ql.url)}
              onContextMenu={e => { e.preventDefault(); onOpen(ql.url) }}
              title={`${ql.url} · right-click → new tab`}>
              <span className="br-nt-ico" style={{ background: ql.bg }}>{ql.label[0]}</span>
              <span className="br-nt-name">{ql.label}</span>
            </button>
          ))}
        </div>

        <p className="br-nt-tip">Ctrl+T new tab · Ctrl+W close · Ctrl+L address bar · Ctrl+D bookmark</p>
      </div>
    </div>
  )
}
