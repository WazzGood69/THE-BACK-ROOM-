import {
  useState, useRef, useCallback, useEffect,
  KeyboardEvent, memo,
} from "react"

type LoadPhase = "idle" | "fetching" | "loaded" | "error"

interface Tab {
  id: string; url: string; title: string; phase: LoadPhase
  canGoBack: boolean; canGoForward: boolean
  history: string[]; histIdx: number
  favicon: string; srcDoc: string | null; useDirect: boolean
}

const NEWTAB = "about:newtab"
const HOME   = "https://en.m.wikipedia.org/wiki/Main_Page"

const PROXIES: Array<(u: string) => string> = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
]

// Navigation interceptor injected into every proxy-fetched page
const NAV_INTERCEPTOR = `
<script>
(function(){
  function intercept(url){
    if(!url||url.startsWith('javascript:')||url.startsWith('#')) return false;
    try{
      var abs = new URL(url, document.baseURI).href;
      window.parent.postMessage({type:'tbr-nav',url:abs},'*');
      return true;
    }catch(e){ return false; }
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest('a');
    if(a&&a.href&&intercept(a.href)){e.preventDefault();}
  },true);
  document.addEventListener('submit',function(e){
    var f=e.target;
    if(f.tagName==='FORM'){
      var action=f.action||document.baseURI;
      var method=(f.method||'get').toLowerCase();
      if(method==='get'){
        var data=new FormData(f);
        var params=new URLSearchParams();
        data.forEach(function(v,k){params.append(k,v);});
        var url=action.split('?')[0]+'?'+params.toString();
        if(intercept(url)){e.preventDefault();}
      }
    }
  },true);
})();
<\/script>`

async function fetchViaProxy(url: string, signal: AbortSignal): Promise<string> {
  const errs: string[] = []
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let html = await res.text()
      if (!html.trim()) throw new Error("empty")
      const base = `<base href="${url}">`
      html = /<head[\s>]/i.test(html)
        ? html.replace(/(<head[\s>][^>]*>)/i, `$1${base}${NAV_INTERCEPTOR}`)
        : `<head>${base}${NAV_INTERCEPTOR}</head>${html}`
      return html
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") throw e
      errs.push(String(e instanceof Error ? e.message : e))
    }
  }
  throw new Error(errs.join(" | "))
}

function normalize(raw: string): string {
  raw = raw.trim()
  if (!raw || raw === NEWTAB) return NEWTAB
  if (raw.startsWith("about:")) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^[\w.-]+\.\w{2,}/.test(raw) && !raw.includes(" ")) return "https://" + raw
  return `https://html.duckduckgo.com/html?q=${encodeURIComponent(raw)}`
}

function pretty(url: string) {
  if (url === NEWTAB) return ""
  try { const u = new URL(url); return u.hostname + (u.pathname !== "/" ? u.pathname : "") }
  catch { return url }
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
    phase: url === NEWTAB ? "idle" : "fetching",
    canGoBack: false, canGoForward: false,
    history: [url], histIdx: 0,
    favicon: url !== NEWTAB ? faviconFor(url) : "",
    srcDoc: null, useDirect: false,
  }
}

const QUICK_LINKS = [
  { label: "Wikipedia",    url: "https://en.m.wikipedia.org/wiki/Main_Page",  bg: "#3366cc" },
  { label: "Hacker News",  url: "https://news.ycombinator.com",               bg: "#e05c1a" },
  { label: "DuckDuckGo",   url: "https://html.duckduckgo.com/html",           bg: "#de5833" },
  { label: "Google",       url: "https://www.google.com",                     bg: "#4285f4" },
  { label: "YouTube",      url: "https://www.youtube.com",                    bg: "#ff0000" },
  { label: "Reddit",       url: "https://old.reddit.com",                     bg: "#ff4500" },
  { label: "GitHub",       url: "https://github.com",                         bg: "#24292f" },
  { label: "W3Schools",    url: "https://www.w3schools.com",                  bg: "#3fa040" },
  { label: "Archive.org",  url: "https://archive.org",                        bg: "#428bca" },
  { label: "NASA",         url: "https://www.nasa.gov",                       bg: "#0b3d91" },
  { label: "MDN",          url: "https://developer.mozilla.org",              bg: "#0a7870" },
  { label: "OpenStreetMap",url: "https://www.openstreetmap.org",              bg: "#7db43a" },
]

export default function Browser() {
  const [tabs, setTabs]         = useState<Tab[]>([mkTab()])
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id)
  const [addrVal, setAddrVal]   = useState("")
  const [addrFocus, setAddrFocus] = useState(false)
  const aborts = useRef<Record<string, AbortController>>({})

  const active = tabs.find(t => t.id === activeId) ?? tabs[0]

  const patch = useCallback((id: string, p: Partial<Tab>) =>
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...p } : t)), [])

  useEffect(() => {
    if (!addrFocus) setAddrVal(active.url === NEWTAB ? "" : active.url)
  }, [active.url, active.id, addrFocus])

  // Listen for navigation messages from proxy-iframe
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === "tbr-nav" && typeof e.data.url === "string") {
        load(activeId, e.data.url)
      }
    }
    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (tabId: string, url: string, push = true) => {
    if (url === NEWTAB) {
      setTabs(prev => prev.map(t => {
        if (t.id !== tabId) return t
        const hist = push ? [...t.history.slice(0, t.histIdx + 1), url] : t.history
        const idx  = push ? hist.length - 1 : t.histIdx
        return { ...t, url, title: "New Tab", phase: "idle", srcDoc: null, useDirect: false,
          favicon: "", history: hist, histIdx: idx, canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
      }))
      return
    }

    aborts.current[tabId]?.abort()
    const ctrl = new AbortController()
    aborts.current[tabId] = ctrl

    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const hist = push ? [...t.history.slice(0, t.histIdx + 1), url] : t.history
      const idx  = push ? hist.length - 1 : t.histIdx
      return { ...t, url, title: pretty(url), phase: "fetching",
        srcDoc: null, useDirect: false, favicon: faviconFor(url),
        history: hist, histIdx: idx, canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
    }))

    try {
      const html = await Promise.race([
        fetchViaProxy(url, ctrl.signal),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 14000)),
      ])
      if (ctrl.signal.aborted) return
      patch(tabId, { phase: "loaded", srcDoc: html, useDirect: false, title: pretty(url) })
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return
      // Fallback: direct iframe (bypasses proxy but respects X-Frame-Options)
      patch(tabId, { phase: "loaded", srcDoc: null, useDirect: true, title: pretty(url) })
    }
  }, [patch])

  const navigate = (input: string) => load(active.id, normalize(input))
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
    const tab = mkTab(url)
    setTabs(prev => [...prev, tab])
    setActiveId(tab.id)
    if (url !== NEWTAB) load(tab.id, url)
  }
  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
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

  const addrKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  { navigate(addrVal); e.currentTarget.blur() }
    if (e.key === "Escape") { setAddrVal(active.url === NEWTAB ? "" : active.url); e.currentTarget.blur() }
  }

  return (
    <div className="br-shell">
      {/* Tab strip */}
      <div className="br-tabstrip">
        <div className="br-tabs-scroll">
          {tabs.map(tab => (
            <BrTab key={tab.id} tab={tab} active={tab.id === activeId}
              onClick={() => setActiveId(tab.id)}
              onClose={e => closeTab(tab.id, e)} />
          ))}
        </div>
        <button className="br-newtab-btn" onClick={() => openTab()} title="New tab">+</button>
      </div>

      {/* Toolbar */}
      <div className="br-toolbar">
        <button className="br-nav-btn" onClick={goBack} disabled={!active.canGoBack} title="Back">←</button>
        <button className="br-nav-btn" onClick={goFwd}  disabled={!active.canGoForward} title="Forward">→</button>
        <button className="br-nav-btn" onClick={refresh} disabled={active.phase === "fetching"} title="Refresh">↺</button>
        <button className="br-nav-btn" onClick={() => load(active.id, HOME)} title="Home">⌂</button>

        <div className={`br-omnibar ${addrFocus ? "br-omnibar--focus" : ""}`}>
          <span className="br-scheme">
            {active.url === NEWTAB ? "🔍"
              : active.url.startsWith("https") ? "🔒" : "🌐"}
          </span>
          <input
            className="br-omni-input"
            value={addrFocus ? addrVal : (active.url === NEWTAB ? "" : active.url)}
            onChange={e => setAddrVal(e.target.value)}
            onFocus={e => { setAddrFocus(true); setAddrVal(active.url === NEWTAB ? "" : active.url); setTimeout(() => e.target.select(), 0) }}
            onBlur={() => setAddrFocus(false)}
            onKeyDown={addrKey}
            placeholder="Search or enter URL…"
            spellCheck={false}
          />
          {active.phase === "fetching" && <span className="br-omni-spin" />}
        </div>

        <button className="br-nav-btn" onClick={() => active.url !== NEWTAB && openTab(active.url)} title="Open in new tab">⧉</button>
      </div>

      {/* Content */}
      <div className="br-content">
        {active.url === NEWTAB
          ? <NewTabPage onNav={url => load(active.id, url)} onOpen={openTab} />
          : <>
              {active.srcDoc && (
                <iframe key={active.id + "|src"} srcDoc={active.srcDoc} className="br-frame"
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                  title={active.title} />
              )}
              {active.useDirect && !active.srcDoc && (
                <iframe key={active.id + "|dir"} src={active.url} className="br-frame"
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  title={active.title} />
              )}
              {active.phase === "fetching" && (
                <div className="br-overlay">
                  <div className="br-spinner"><div className="br-spin-inner" /></div>
                  <p className="br-ov-url">{pretty(active.url)}</p>
                  <p className="br-ov-hint">Loading via proxy…</p>
                </div>
              )}
            </>}
      </div>
    </div>
  )
}

const BrTab = memo(function BrTab({ tab, active, onClick, onClose }: {
  tab: Tab; active: boolean; onClick: () => void; onClose: (e: React.MouseEvent) => void
}) {
  return (
    <div className={`br-tab ${active ? "br-tab--on" : ""}`} onClick={onClick} title={tab.title}>
      {tab.favicon
        ? <img src={tab.favicon} className="br-tab-fav" alt=""
            onError={e => (e.currentTarget.style.display = "none")} />
        : <span className="br-tab-ico">○</span>}
      <span className="br-tab-label">{tab.title}</span>
      {tab.phase === "fetching" && <span className="br-tab-spin" />}
      <button className="br-tab-x" onClick={onClose} aria-label="close">✕</button>
    </div>
  )
})

function NewTabPage({ onNav, onOpen }: { onNav: (u: string) => void; onOpen: (u: string) => void }) {
  const [q, setQ] = useState("")
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])

  const hh = time.getHours(), mm = String(time.getMinutes()).padStart(2,"0")
  const ampm = hh >= 12 ? "PM" : "AM"
  const h12 = hh % 12 || 12

  return (
    <div className="br-newtab">
      <div className="br-nt-inner">
        <div className="br-nt-clock">
          <span className="br-nt-hh">{h12}</span>
          <span className="br-nt-colon">:</span>
          <span className="br-nt-mm">{mm}</span>
          <span className="br-nt-ampm">{ampm}</span>
        </div>
        <p className="br-nt-date">{time.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p>

        <div className="br-nt-search">
          <span className="br-nt-search-icon">⌕</span>
          <input className="br-nt-q" placeholder="Search or enter URL…"
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key==="Enter" && q.trim() && onNav(normalize(q))}
            autoFocus />
        </div>

        <div className="br-nt-grid">
          {QUICK_LINKS.map(ql => (
            <button key={ql.url} className="br-nt-tile"
              onClick={() => onNav(ql.url)}
              onContextMenu={e => { e.preventDefault(); onOpen(ql.url) }}>
              <span className="br-nt-ico" style={{ background: ql.bg }}>{ql.label[0]}</span>
              <span className="br-nt-name">{ql.label}</span>
            </button>
          ))}
        </div>
        <p className="br-nt-tip">Right-click → open in new tab · Links inside pages navigate automatically</p>
      </div>
    </div>
  )
}
