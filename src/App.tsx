import {
  useState, useRef, useCallback, useEffect,
  KeyboardEvent, useId, memo,
} from "react"

// ── Types ─────────────────────────────────────────────────────────────────

type LoadPhase = "idle" | "fetching" | "loaded" | "error"

interface Tab {
  id: string
  mode: "browser" | "editor"
  url: string
  title: string
  phase: LoadPhase
  errorMsg: string
  canGoBack: boolean
  canGoForward: boolean
  history: string[]
  histIdx: number
  favicon: string
  srcDoc: string | null   // proxy-fetched HTML
  useDirect: boolean      // fell back to direct iframe src
  editorHtml: string
  editorOut: string | null
}

// ── Proxy chain ───────────────────────────────────────────────────────────

const PROXIES: Array<(u: string) => string> = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

async function fetchViaProxy(url: string, signal: AbortSignal): Promise<string> {
  const errors: string[] = []
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let html = await res.text()
      if (!html.trim()) throw new Error("Empty response")
      // Inject <base> so relative resources resolve against origin
      const base = `<base href="${url}" target="_self">`
      html = /<head[\s>]/i.test(html)
        ? html.replace(/(<head[\s>][^>]*>)/i, `$1\n${base}`)
        : `<head>${base}</head>${html}`
      return html
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") throw e
      errors.push(String(e instanceof Error ? e.message : e))
    }
  }
  throw new Error(`All proxies failed: ${errors.join(" | ")}`)
}

// ── Constants & defaults ──────────────────────────────────────────────────

const NEWTAB = "about:newtab"
const HOME   = "https://en.m.wikipedia.org/wiki/Main_Page"

const QUICK_LINKS = [
  { label: "Wikipedia",    url: "https://en.m.wikipedia.org/wiki/Main_Page",  bg: "#3366cc" },
  { label: "Hacker News",  url: "https://news.ycombinator.com",               bg: "#e05c1a" },
  { label: "MDN",          url: "https://developer.mozilla.org",              bg: "#0a7870" },
  { label: "Google",       url: "https://www.google.com",                     bg: "#4285f4" },
  { label: "YouTube",      url: "https://www.youtube.com",                    bg: "#ff0000" },
  { label: "Reddit",       url: "https://old.reddit.com",                     bg: "#ff4500" },
  { label: "GitHub",       url: "https://github.com",                         bg: "#24292f" },
  { label: "W3Schools",    url: "https://www.w3schools.com",                  bg: "#3fa040" },
  { label: "Archive.org",  url: "https://archive.org",                        bg: "#428bca" },
  { label: "DuckDuckGo",   url: "https://html.duckduckgo.com/html",           bg: "#de5833" },
  { label: "NASA",         url: "https://www.nasa.gov",                       bg: "#0b3d91" },
  { label: "OpenStreetMap",url: "https://www.openstreetmap.org",              bg: "#7db43a" },
]

const DEFAULT_EDITOR = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sandbox</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 700px; margin: 0 auto; padding: 40px 24px;
      background: #f9fafb; color: #111827; line-height: 1.6;
    }
    h1 { font-size: 1.8rem; font-weight: 700; color: #1d4ed8; margin-bottom: .4em; }
    .card {
      background: #fff; border-radius: 12px;
      border: 1px solid #e5e7eb; padding: 24px;
      margin: 20px 0; box-shadow: 0 1px 6px rgba(0,0,0,.06);
    }
    .btn {
      display: inline-block; background: #2563eb; color: #fff;
      border: none; padding: 10px 22px; border-radius: 8px;
      cursor: pointer; font-size: 14px; font-weight: 500;
      margin-right: 8px; margin-bottom: 8px;
      transition: background .15s, transform .1s;
    }
    .btn:hover { background: #1d4ed8; }
    .btn:active { transform: scale(.96); }
    .btn.danger { background: #ef4444; }
    .btn.danger:hover { background: #dc2626; }
    .btn.green { background: #16a34a; }
    .btn.green:hover { background: #15803d; }
    input, textarea {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px;
      padding: 10px 14px; font-size: 14px; margin-bottom: 12px;
      font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s;
    }
    input:focus, textarea:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,.12);
    }
    #console {
      background: #0f172a; color: #86efac; border-radius: 10px;
      padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 13px;
      min-height: 90px; white-space: pre-wrap; word-break: break-all;
      overflow-y: auto; max-height: 200px;
    }
    #counter { font-size: 3rem; font-weight: 700; color: #1d4ed8; text-align: center; padding: 16px 0; }
  </style>
</head>
<body>
  <h1>🧪 HTML Sandbox</h1>
  <p>Edit this code freely — HTML, CSS, and JavaScript all work here.</p>

  <div class="card">
    <h2 style="margin:0 0 14px;font-size:1.1rem">Counter</h2>
    <div id="counter">0</div>
    <div style="text-align:center;margin-top:8px">
      <button class="btn" onclick="count(-1)">− Decrement</button>
      <button class="btn green" onclick="count(1)">+ Increment</button>
      <button class="btn danger" onclick="n=0;render()">Reset</button>
    </div>
  </div>

  <div class="card">
    <h2 style="margin:0 0 14px;font-size:1.1rem">Console</h2>
    <input id="inp" placeholder="Type a message and press Enter…" onkeydown="if(event.key==='Enter'){log(this.value);this.value=''}" />
    <button class="btn" onclick="log('Hello from sandbox! 🎉')">Log Hello</button>
    <button class="btn" onclick="log(JSON.stringify({time:new Date().toISOString(),rand:Math.random().toFixed(4)}))">Log JSON</button>
    <button class="btn danger" onclick="document.getElementById('console').textContent=''">Clear</button>
    <div id="console"></div>
  </div>

  <script>
    let n = 0;
    function render() { document.getElementById('counter').textContent = n; }
    function count(d) { n += d; render(); }
    function log(msg) {
      const el = document.getElementById('console');
      el.textContent += (el.textContent ? '\\n' : '') + '> ' + msg;
      el.scrollTop = el.scrollHeight;
    }
  </script>
</body>
</html>`

// ── Utils ─────────────────────────────────────────────────────────────────

let _seq = 0
const uid = () => `t${++_seq}`

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
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname !== "/" ? u.pathname : "")
  } catch { return url }
}

function faviconUrl(url: string) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` }
  catch { return "" }
}

function mkTab(url = NEWTAB): Tab {
  return {
    id: uid(), mode: "browser",
    url, title: url === NEWTAB ? "New Tab" : pretty(url),
    phase: url === NEWTAB ? "idle" : "fetching",
    errorMsg: "", canGoBack: false, canGoForward: false,
    history: [url], histIdx: 0,
    favicon: url !== NEWTAB ? faviconUrl(url) : "",
    srcDoc: null, useDirect: false,
    editorHtml: DEFAULT_EDITOR, editorOut: null,
  }
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [tabs, setTabs]           = useState<Tab[]>([mkTab()])
  const [activeId, setActiveId]   = useState<string>(() => tabs[0].id)
  const [addrVal, setAddrVal]     = useState("")
  const [addrFocus, setAddrFocus] = useState(false)
  const aborts = useRef<Record<string, AbortController>>({})

  const active = tabs.find(t => t.id === activeId) ?? tabs[0]

  const patch = useCallback((id: string, p: Partial<Tab>) =>
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...p } : t)), [])

  useEffect(() => {
    if (!addrFocus) setAddrVal(active.url === NEWTAB ? "" : active.url)
  }, [active.url, active.id, addrFocus])

  // Core load: try proxies first, fall back to direct iframe
  const load = useCallback(async (tabId: string, url: string, push = true) => {
    if (url === NEWTAB) {
      setTabs(prev => prev.map(t => {
        if (t.id !== tabId) return t
        const hist = push ? [...t.history.slice(0, t.histIdx + 1), url] : t.history
        const idx  = push ? hist.length - 1 : t.histIdx
        return { ...t, url, title: "New Tab", phase: "idle", srcDoc: null, useDirect: false,
          favicon: "", errorMsg: "", history: hist, histIdx: idx,
          canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
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
      return { ...t, url, title: pretty(url), phase: "fetching", srcDoc: null,
        useDirect: false, favicon: faviconUrl(url), errorMsg: "",
        history: hist, histIdx: idx,
        canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
    }))

    // Race proxy fetch against a 12-second timeout
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Proxy timeout")), 12000))

    try {
      const html = await Promise.race([fetchViaProxy(url, ctrl.signal), timeout])
      if (ctrl.signal.aborted) return
      patch(tabId, { phase: "loaded", srcDoc: html, useDirect: false, title: pretty(url) })
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return
      // Proxy chain failed → fall back to direct iframe src
      // Many sites that block proxies actually allow direct embedding
      patch(tabId, { phase: "loaded", srcDoc: null, useDirect: true,
        title: pretty(url), errorMsg: String(e instanceof Error ? e.message : e) })
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
  const refresh = () => { if (active.url !== NEWTAB && active.mode === "browser") load(active.id, active.url, false) }

  const openTab = (url = NEWTAB) => {
    const tab = mkTab(url)
    setTabs(prev => [...prev, tab])
    setActiveId(tab.id)
    if (url !== NEWTAB) load(tab.id, url)
  }
  const openEditorTab = () => {
    const tab: Tab = { ...mkTab(), mode: "editor", title: "HTML Editor", phase: "idle" }
    setTabs(prev => [...prev, tab])
    setActiveId(tab.id)
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

  const runEditor = () => patch(active.id, { editorOut: active.editorHtml })

  const addrKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  { navigate(addrVal); e.currentTarget.blur() }
    if (e.key === "Escape") { setAddrVal(active.url === NEWTAB ? "" : active.url); e.currentTarget.blur() }
  }

  const isLoading = active.phase === "fetching"
  const isEditor  = active.mode === "editor"

  return (
    <div className="shell">
      {/* ── Tab strip ── */}
      <div className="tabstrip">
        <div className="tabs-scroll">
          {tabs.map(tab => (
            <TabPill
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              onClick={() => setActiveId(tab.id)}
              onClose={e => closeTab(tab.id, e)}
            />
          ))}
        </div>
        <div className="strip-actions">
          <button className="strip-btn" onClick={() => openTab()} title="New tab" aria-label="New tab">
            <PlusIcon />
          </button>
          <button className="strip-btn code-btn" onClick={openEditorTab} title="HTML Editor" aria-label="HTML Editor">
            <CodeIcon />
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="toolbar-left">
          <TbBtn icon={<BackIcon />}    title="Back"    onClick={goBack}    off={!active.canGoBack} />
          <TbBtn icon={<FwdIcon />}     title="Forward" onClick={goFwd}     off={!active.canGoForward} />
          <TbBtn icon={<RefreshIcon />} title="Refresh" onClick={refresh}   off={isLoading || isEditor} />
          <TbBtn icon={<HomeIcon />}    title="Home"    onClick={() => load(active.id, HOME)} />
        </div>

        <div className={`omnibar ${addrFocus ? "omnibar--focus" : ""}`}>
          {isEditor ? (
            <span className="omni-editor-badge"><CodeIcon /> HTML Editor</span>
          ) : (
            <>
              <span className="omni-scheme">
                {active.url === NEWTAB ? <SearchIcon /> :
                  active.url.startsWith("https") ? <LockIcon /> : <GlobeSmIcon />}
              </span>
              <input
                className="omni-input"
                value={addrFocus ? addrVal : (active.url === NEWTAB ? "" : active.url)}
                onChange={e => setAddrVal(e.target.value)}
                onFocus={e => { setAddrFocus(true); setAddrVal(active.url === NEWTAB ? "" : active.url); setTimeout(() => e.target.select(), 0) }}
                onBlur={() => setAddrFocus(false)}
                onKeyDown={addrKey}
                placeholder="Search or enter URL…"
                spellCheck={false}
              />
              {isLoading && <span className="omni-spinner" />}
            </>
          )}
        </div>

        <div className="toolbar-right">
          {isEditor
            ? <button className="run-btn" onClick={runEditor}><PlayIcon /> Run</button>
            : <TbBtn icon={<DupIcon />} title="Duplicate tab" onClick={() => active.url !== NEWTAB && openTab(active.url)} />}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="content">
        {isEditor ? (
          <EditorPane
            key={active.id}
            html={active.editorHtml}
            out={active.editorOut}
            onChange={v => patch(active.id, { editorHtml: v })}
            onRun={runEditor}
          />
        ) : active.url === NEWTAB ? (
          <NewTabPage onNavigate={url => load(active.id, url)} onOpen={openTab} onEditor={openEditorTab} />
        ) : (
          <>
            {/* Proxy-fetched srcdoc */}
            {active.srcDoc && (
              <iframe
                key={active.id + "|srcdoc"}
                srcDoc={active.srcDoc}
                className="page-frame"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
                title={active.title}
              />
            )}
            {/* Direct iframe fallback */}
            {active.useDirect && !active.srcDoc && (
              <iframe
                key={active.id + "|direct"}
                src={active.url}
                className="page-frame"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
                title={active.title}
              />
            )}
            {/* Loading overlay */}
            {active.phase === "fetching" && (
              <div className="overlay">
                <div className="loader-ring">
                  <div className="loader-inner" />
                </div>
                <p className="ov-host">{pretty(active.url)}</p>
                <p className="ov-hint">Connecting through secure proxy…</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Tab pill ──────────────────────────────────────────────────────────────

const TabPill = memo(function TabPill({ tab, active, onClick, onClose }: {
  tab: Tab; active: boolean
  onClick: () => void; onClose: (e: React.MouseEvent) => void
}) {
  return (
    <div className={`tab ${active ? "tab--on" : ""}`} onClick={onClick} title={tab.title}>
      <div className="tab-favicon">
        {tab.mode === "editor"
          ? <span className="tab-code-ico"><CodeIcon /></span>
          : tab.favicon
            ? <img src={tab.favicon} alt="" onError={e => (e.currentTarget.style.display = "none")} />
            : <span className="tab-globe"><GlobeSmIcon /></span>}
      </div>
      <span className="tab-label">{tab.title}</span>
      {tab.phase === "fetching" && <span className="tab-spin" />}
      <button className="tab-close" onClick={onClose} aria-label="Close tab">
        <CloseIcon />
      </button>
    </div>
  )
})

// ── Toolbar button ────────────────────────────────────────────────────────

function TbBtn({ icon, title, onClick, off = false }: { icon: React.ReactNode; title: string; onClick: () => void; off?: boolean }) {
  return (
    <button className="tb-btn" title={title} onClick={onClick} disabled={off} aria-label={title}>
      {icon}
    </button>
  )
}

// ── Editor pane ───────────────────────────────────────────────────────────

function EditorPane({ html, out, onChange, onRun }: {
  html: string; out: string | null
  onChange: (v: string) => void; onRun: () => void
}) {
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onRun() }
    if (e.key === "Tab") {
      e.preventDefault()
      const el = e.currentTarget, s = el.selectionStart, end = el.selectionEnd
      const next = html.slice(0, s) + "  " + html.slice(end)
      onChange(next)
      setTimeout(() => { el.selectionStart = el.selectionEnd = s + 2 }, 0)
    }
  }
  return (
    <div className="editor-wrap">
      <div className="editor-code">
        <div className="editor-topbar">
          <span className="editor-lang">HTML · CSS · JS</span>
          <span className="editor-shortcut">Ctrl+Enter to run</span>
        </div>
        <textarea
          className="editor-ta"
          value={html}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />
      </div>
      <div className="editor-divider" />
      <div className="editor-preview">
        <div className="editor-topbar">
          <span className="editor-lang">Preview</span>
          {!out && <span className="editor-shortcut">click ▶ Run</span>}
        </div>
        {out
          ? <iframe srcDoc={out} className="preview-frame"
              sandbox="allow-scripts allow-forms allow-modals" title="Preview" />
          : <div className="preview-empty">
              <div className="preview-empty-icon"><CodeIcon /></div>
              <p>Click <strong>▶ Run</strong> to render</p>
            </div>}
      </div>
    </div>
  )
}

// ── New Tab page ──────────────────────────────────────────────────────────

function NewTabPage({ onNavigate, onOpen, onEditor }: {
  onNavigate: (u: string) => void; onOpen: (u: string) => void; onEditor: () => void
}) {
  const [q, setQ] = useState("")
  const [time, setTime] = useState(new Date())
  const id = useId()

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && q.trim()) onNavigate(normalize(q))
  }

  const hh = time.getHours()
  const mm  = String(time.getMinutes()).padStart(2, "0")
  const ampm = hh >= 12 ? "PM" : "AM"
  const h12  = hh % 12 || 12

  const dateStr = time.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })

  return (
    <div className="newtab">
      <div className="newtab-inner">
        {/* Clock */}
        <div className="nt-clock-wrap">
          <div className="nt-time">
            <span className="nt-hh">{h12}</span>
            <span className="nt-colon">:</span>
            <span className="nt-mm">{mm}</span>
            <span className="nt-ampm">{ampm}</span>
          </div>
          <div className="nt-date">{dateStr}</div>
        </div>

        {/* Search */}
        <div className="nt-search-wrap">
          <label htmlFor={id} className="sr-only">Search</label>
          <span className="nt-search-icon"><SearchIcon /></span>
          <input
            id={id} className="nt-search"
            placeholder="Search or enter URL…"
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={onKey} autoFocus
          />
        </div>

        {/* Quick links */}
        <div className="nt-grid">
          {QUICK_LINKS.map(ql => (
            <button
              key={ql.url} className="nt-tile"
              onClick={() => onNavigate(ql.url)}
              onContextMenu={e => { e.preventDefault(); onOpen(ql.url) }}
              title={`${ql.url}\n(right-click → new tab)`}
            >
              <span className="nt-tile-ico" style={{ background: ql.bg }}>
                {ql.label[0]}
              </span>
              <span className="nt-tile-name">{ql.label}</span>
            </button>
          ))}
          <button className="nt-tile nt-tile-code" onClick={onEditor}>
            <span className="nt-tile-ico nt-tile-ico-code"><CodeIcon /></span>
            <span className="nt-tile-name">Editor</span>
          </button>
        </div>

        <p className="nt-footer">Proxy-fetched · right-click tiles to open in new tab</p>
      </div>
    </div>
  )
}

// ── Icon components ───────────────────────────────────────────────────────

const sz = (n=16) => ({ width: n, height: n, viewBox: `0 0 ${n} ${n}`, fill:"none" } as const)

function BackIcon()    { return <svg {...sz()}><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function FwdIcon()     { return <svg {...sz()}><path d="M6 3l5 5-5 5"  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function RefreshIcon() {
  return <svg {...sz()}><path d="M13 8A5 5 0 1 1 8 3c1.4 0 2.7.5 3.7 1.4L13 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M13 3v3h-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
function HomeIcon() {
  return <svg {...sz()}><path d="M2 7.5L8 2l6 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 6.5V13h3v-3h2v3h3V6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
function PlusIcon()  { return <svg {...sz(14)}><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> }
function CloseIcon() { return <svg {...sz(10)}><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> }
function DupIcon()   { return <svg {...sz()}><rect x="2" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><path d="M7 2h7v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2L7 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> }
function PlayIcon()  { return <svg {...sz(12)}><path d="M3 2l8 4-8 4V2z" fill="currentColor"/></svg> }
function LockIcon()  { return <svg {...sz(14)}><rect x="3" y="7" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 7V5a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function SearchIcon(){ return <svg {...sz(16)}><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> }
function GlobeSmIcon(){return <svg {...sz(14)}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><ellipse cx="7" cy="7" rx="2.5" ry="5.5" stroke="currentColor" strokeWidth="1.2"/><line x1="1.5" y1="7" x2="12.5" y2="7" stroke="currentColor" strokeWidth="1.2"/></svg>}
function CodeIcon()  { return <svg {...sz(14)}><path d="M3 5L1 7l2 2M11 5l2 2-2 2M8 3l-2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
