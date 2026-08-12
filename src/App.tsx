import {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
  useId,
} from "react"

// ── Types ──────────────────────────────────────────────────────────────────

type TabMode = "browser" | "editor"
type LoadState = "idle" | "loading" | "loaded" | "blocked" | "error"

interface Tab {
  id: string
  mode: TabMode
  url: string
  title: string
  loadState: LoadState
  canGoBack: boolean
  canGoForward: boolean
  history: string[]
  historyIndex: number
  favicon: string
  // editor
  editorHtml: string
  editorRendered: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const NEW_TAB_URL = "about:newtab"
const HOME_URL    = "https://en.m.wikipedia.org/wiki/Main_Page"

// Sites confirmed to allow iframe embedding
const QUICK_LINKS = [
  { label: "Wikipedia",    url: "https://en.m.wikipedia.org/wiki/Main_Page",  bg: "#3366cc" },
  { label: "Hacker News",  url: "https://news.ycombinator.com",               bg: "#ff6600" },
  { label: "NASA",         url: "https://www.nasa.gov",                       bg: "#1b4f8a" },
  { label: "Archive.org",  url: "https://archive.org",                        bg: "#428bca" },
  { label: "OpenStreetMap",url: "https://www.openstreetmap.org",              bg: "#7ebc6f" },
  { label: "W3Schools",    url: "https://www.w3schools.com",                  bg: "#4cae4c" },
  { label: "itch.io",      url: "https://itch.io",                            bg: "#fa5c5c" },
  { label: "Lobsters",     url: "https://lobste.rs",                          bg: "#ac130d" },
]

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sandbox</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      max-width: 680px; margin: 40px auto;
      padding: 0 24px; background: #fafafa; color: #111;
    }
    h1 { color: #2563eb; margin-bottom: 6px; }
    p  { color: #555; line-height: 1.6; }
    .card {
      background: #fff; border: 1px solid #e4e4e7;
      border-radius: 10px; padding: 20px;
      margin: 20px 0; box-shadow: 0 1px 4px rgba(0,0,0,.06);
    }
    button {
      background: #2563eb; color: #fff; border: none;
      padding: 9px 20px; border-radius: 7px; cursor: pointer;
      font-size: 14px; margin-right: 8px; margin-bottom: 8px;
      transition: background .15s;
    }
    button:hover { background: #1d4ed8; }
    button.red   { background: #ef4444; }
    button.red:hover { background: #dc2626; }
    input {
      border: 1px solid #d1d5db; border-radius: 6px;
      padding: 8px 12px; font-size: 14px; width: 100%;
      margin-bottom: 8px; outline: none;
    }
    input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
    #log {
      background: #18181b; color: #a3e635;
      border-radius: 8px; padding: 14px 16px;
      font-family: monospace; font-size: 13px;
      min-height: 80px; white-space: pre-wrap; margin-top: 8px;
    }
  </style>
</head>
<body>
  <h1>🧪 HTML Sandbox</h1>
  <p>Write HTML, CSS &amp; JavaScript here. Hit <strong>▶ Run</strong> to execute.</p>

  <div class="card">
    <h3 style="margin:0 0 12px">Interactive Demo</h3>
    <input id="inp" placeholder="Type something and press Enter…" onkeydown="if(event.key==='Enter')log(this.value)" />
    <button onclick="log('Hello at ' + new Date().toLocaleTimeString())">Say Hello</button>
    <button class="red" onclick="document.getElementById('log').textContent=''">Clear</button>
    <div id="log">// Output appears here</div>
  </div>

  <script>
    function log(msg) {
      const el = document.getElementById('log');
      el.textContent += (el.textContent === '// Output appears here' ? '' : '\\n') + '> ' + msg;
      if (el.textContent.startsWith('// Output')) el.textContent = '> ' + msg;
    }
  </script>
</body>
</html>`

// ── Utilities ──────────────────────────────────────────────────────────────

let _seq = 0
const uid = () => `t${++_seq}`

function normalizeUrl(raw: string): string {
  raw = raw.trim()
  if (!raw) return NEW_TAB_URL
  if (raw.startsWith("about:")) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^[\w.-]+\.\w{2,}/.test(raw) && !raw.includes(" ")) return "https://" + raw
  return `https://html.duckduckgo.com/html?q=${encodeURIComponent(raw)}`
}

function prettyUrl(url: string) {
  if (url === NEW_TAB_URL) return ""
  try { const u = new URL(url); return u.hostname + (u.pathname !== "/" ? u.pathname : "") }
  catch { return url }
}

function faviconFor(url: string) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` }
  catch { return "" }
}

function blankTab(url = NEW_TAB_URL): Tab {
  return {
    id: uid(), mode: "browser",
    url, title: url === NEW_TAB_URL ? "New Tab" : prettyUrl(url),
    loadState: url === NEW_TAB_URL ? "idle" : "loading",
    canGoBack: false, canGoForward: false,
    history: [url], historyIndex: 0,
    favicon: url !== NEW_TAB_URL ? faviconFor(url) : "",
    editorHtml: DEFAULT_HTML, editorRendered: null,
  }
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [tabs, setTabs]         = useState<Tab[]>([blankTab()])
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id)
  const [addrInput, setAddr]    = useState("")
  const [addrFocus, setAddrFocus] = useState(false)
  const loadTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const active = tabs.find(t => t.id === activeId) ?? tabs[0]

  const patch = useCallback((id: string, p: Partial<Tab>) =>
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...p } : t)), [])

  useEffect(() => {
    if (!addrFocus) setAddr(active.url === NEW_TAB_URL ? "" : active.url)
  }, [active.url, active.id, addrFocus])

  // Navigate the active tab to a URL
  const go = useCallback((tabId: string, url: string, push = true) => {
    clearTimeout(loadTimers.current[tabId])

    if (url === NEW_TAB_URL) {
      setTabs(prev => prev.map(t => {
        if (t.id !== tabId) return t
        const hist = push ? [...t.history.slice(0, t.historyIndex + 1), url] : t.history
        const idx  = push ? hist.length - 1 : t.historyIndex
        return { ...t, url, title: "New Tab", loadState: "idle", favicon: "",
          history: hist, historyIndex: idx,
          canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
      }))
      return
    }

    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const hist = push ? [...t.history.slice(0, t.historyIndex + 1), url] : t.history
      const idx  = push ? hist.length - 1 : t.historyIndex
      return { ...t, url, title: prettyUrl(url), loadState: "loading",
        favicon: faviconFor(url), history: hist, historyIndex: idx,
        canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
    }))

    // Timeout: if iframe doesn't load within 15s, mark as error
    loadTimers.current[tabId] = setTimeout(() => {
      patch(tabId, { loadState: "error", title: "Timeout" })
    }, 15000)
  }, [patch])

  const onIframeLoad = useCallback((tabId: string, url: string) => {
    clearTimeout(loadTimers.current[tabId])
    patch(tabId, { loadState: "loaded", title: prettyUrl(url) })
  }, [patch])

  const onIframeError = useCallback((tabId: string) => {
    clearTimeout(loadTimers.current[tabId])
    patch(tabId, { loadState: "error", title: "Error" })
  }, [patch])

  const navigate = (input: string) => go(active.id, normalizeUrl(input))

  const goBack = () => {
    if (!active.canGoBack) return
    const idx = active.historyIndex - 1
    setTabs(prev => prev.map(t => t.id === active.id
      ? { ...t, historyIndex: idx, canGoBack: idx > 0, canGoForward: true } : t))
    go(active.id, active.history[idx], false)
  }
  const goForward = () => {
    if (!active.canGoForward) return
    const idx = active.historyIndex + 1
    setTabs(prev => prev.map(t => t.id === active.id
      ? { ...t, historyIndex: idx, canGoBack: true, canGoForward: idx < t.history.length - 1 } : t))
    go(active.id, active.history[idx], false)
  }
  const refresh = () => { if (active.url !== NEW_TAB_URL && active.mode === "browser") go(active.id, active.url, false) }

  const openTab = (url = NEW_TAB_URL) => {
    const tab = blankTab(url)
    setTabs(prev => [...prev, tab])
    setActiveId(tab.id)
    if (url !== NEW_TAB_URL) go(tab.id, url)
  }
  const openEditorTab = () => {
    const tab: Tab = { ...blankTab(), mode: "editor", title: "HTML Editor", loadState: "idle" }
    setTabs(prev => [...prev, tab])
    setActiveId(tab.id)
  }
  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    clearTimeout(loadTimers.current[id])
    setTabs(prev => {
      if (prev.length === 1) return [blankTab()]
      const next = prev.filter(t => t.id !== id)
      if (activeId === id) {
        const idx = prev.findIndex(t => t.id === id)
        setActiveId(next[Math.min(idx, next.length - 1)].id)
      }
      return next
    })
  }

  const runEditor = () => patch(active.id, { editorRendered: active.editorHtml })

  const addrKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  { navigate(addrInput); e.currentTarget.blur() }
    if (e.key === "Escape") { setAddr(active.url === NEW_TAB_URL ? "" : active.url); e.currentTarget.blur() }
  }

  return (
    <div className="shell">
      {/* Tab strip */}
      <div className="tabstrip">
        <div className="tabs-row">
          {tabs.map(tab => (
            <div key={tab.id} className={`tab ${tab.id === activeId ? "tab--active" : ""}`}
              onClick={() => setActiveId(tab.id)} title={tab.title}>
              {tab.mode === "editor"
                ? <span className="tab-ico editor-ico">{"</>"}</span>
                : tab.favicon
                  ? <img src={tab.favicon} className="tab-fav" alt=""
                      onError={e => (e.currentTarget.style.display = "none")} />
                  : <span className="tab-ico">○</span>}
              <span className="tab-label">{tab.title}</span>
              {tab.loadState === "loading" && <span className="tab-spin" />}
              <span className="tab-x" onClick={e => closeTab(tab.id, e)} role="button" aria-label="close tab">✕</span>
            </div>
          ))}
        </div>
        <div className="tab-actions">
          <button className="icon-btn" onClick={() => openTab()} title="New tab">+</button>
          <button className="icon-btn editor-btn" onClick={openEditorTab} title="HTML editor">{"</>"}</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <Nb icon="←" title="Back"    onClick={goBack}    off={!active.canGoBack} />
        <Nb icon="→" title="Forward" onClick={goForward} off={!active.canGoForward} />
        <Nb icon="↺" title="Refresh" onClick={refresh}   off={active.loadState === "loading" || active.mode === "editor"} />
        <Nb icon="⌂" title="Home"    onClick={() => go(active.id, HOME_URL)} />

        <div className={`addr-wrap ${addrFocus ? "addr-focus" : ""}`}>
          {active.mode === "editor"
            ? <span className="addr-badge">{"</>"} HTML Editor</span>
            : <>
                {active.url !== NEW_TAB_URL && !addrFocus && (
                  <span className="addr-scheme">
                    {active.url.startsWith("https") ? "🔒" : "🌐"}
                  </span>
                )}
                <input
                  className="addr-input"
                  value={addrFocus ? addrInput : (active.url === NEW_TAB_URL ? "" : active.url)}
                  onChange={e => setAddr(e.target.value)}
                  onFocus={e => { setAddrFocus(true); setAddr(active.url === NEW_TAB_URL ? "" : active.url); setTimeout(() => e.target.select(), 0) }}
                  onBlur={() => setAddrFocus(false)}
                  onKeyDown={addrKey}
                  placeholder="Enter a URL or search…"
                  spellCheck={false}
                />
                {active.loadState === "loading" && <span className="addr-loader" />}
              </>}
        </div>

        {active.mode === "editor"
          ? <button className="run-btn" onClick={runEditor}>▶ Run</button>
          : <Nb icon="⧉" title="Duplicate tab" onClick={() => active.url !== NEW_TAB_URL && openTab(active.url)} />}
      </div>

      {/* Content */}
      <div className="content">
        {active.mode === "editor"
          ? <EditorPane
              key={active.id}
              html={active.editorHtml}
              rendered={active.editorRendered}
              onChange={v => patch(active.id, { editorHtml: v })}
              onRun={runEditor}
            />
          : active.url === NEW_TAB_URL
            ? <NewTabPage onNavigate={url => go(active.id, url)} onOpen={openTab} onEditor={openEditorTab} />
            : <>
                {/* Always-present iframe — shown/hidden via CSS */}
                {tabs.map(tab =>
                  tab.mode === "browser" && tab.url !== NEW_TAB_URL
                    ? <iframe
                        key={tab.id}
                        src={tab.url}
                        className="page-frame"
                        style={{ display: tab.id === activeId ? "block" : "none" }}
                        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
                        onLoad={() => onIframeLoad(tab.id, tab.url)}
                        onError={() => onIframeError(tab.id)}
                        title={tab.title}
                        referrerPolicy="no-referrer"
                      />
                    : null
                )}
                {/* Overlay states */}
                {active.loadState === "loading" && (
                  <div className="overlay">
                    <div className="spin-ring" />
                    <p className="ov-url">{prettyUrl(active.url)}</p>
                    <p className="ov-sub">Loading…</p>
                  </div>
                )}
                {(active.loadState === "error" || active.loadState === "blocked") && (
                  <div className="overlay">
                    <div className="err-blob">!</div>
                    <p className="ov-title">
                      {active.loadState === "blocked" ? "Site blocked embedding" : "Page didn't load"}
                    </p>
                    <p className="ov-url">{prettyUrl(active.url)}</p>
                    <p className="ov-sub">
                      {active.loadState === "blocked"
                        ? "This site refuses to load inside a frame (X-Frame-Options). Try opening it in a new tab directly."
                        : "The page timed out or returned an error. Check the URL and try again."}
                    </p>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
                      <button className="ov-btn" onClick={refresh}>↺ Retry</button>
                      <a className="ov-btn ov-btn-ghost" href={active.url} target="_blank" rel="noopener noreferrer">
                        ↗ Open directly
                      </a>
                    </div>
                  </div>
                )}
              </>}
      </div>
    </div>
  )
}

// ── Shared button ──────────────────────────────────────────────────────────

function Nb({ icon, title, onClick, off = false }: { icon: string; title: string; onClick: () => void; off?: boolean }) {
  return <button className="nav-btn" title={title} onClick={onClick} disabled={off}>{icon}</button>
}

// ── HTML Editor pane ───────────────────────────────────────────────────────

function EditorPane({ html, rendered, onChange, onRun }: {
  html: string; rendered: string | null
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
    <div className="editor-pane">
      <div className="editor-left">
        <div className="editor-hdr">
          <span>HTML · CSS · JS</span>
          <span className="editor-hint">Ctrl+Enter to run</span>
        </div>
        <textarea className="editor-ta" value={html} onChange={e => onChange(e.target.value)}
          onKeyDown={onKey} spellCheck={false} autoComplete="off" autoCorrect="off" />
      </div>
      <div className="editor-right">
        <div className="editor-hdr"><span>Preview</span></div>
        {rendered
          ? <iframe srcDoc={rendered} className="editor-frame"
              sandbox="allow-scripts allow-forms allow-modals" title="preview" />
          : <div className="editor-empty">
              <span className="editor-empty-ico">{"</>"}</span>
              <p>Click <strong>▶ Run</strong> to render your HTML</p>
            </div>}
      </div>
    </div>
  )
}

// ── New Tab page ───────────────────────────────────────────────────────────

function NewTabPage({ onNavigate, onOpen, onEditor }: {
  onNavigate: (url: string) => void; onOpen: (url: string) => void; onEditor: () => void
}) {
  const [q, setQ] = useState("")
  const inputId = useId()

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && q.trim()) onNavigate(normalizeUrl(q))
  }
  return (
    <div className="newtab">
      <div className="newtab-body">
        <div className="newtab-logo">
          <GlobeIcon />
          <span className="newtab-name">VaultBrowser</span>
        </div>

        <div className="newtab-searchbox">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{flexShrink:0}}>
            <circle cx="7.5" cy="7.5" r="5.5" stroke="#666" strokeWidth="1.6"/>
            <path d="M12 12l4 4" stroke="#666" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <label htmlFor={inputId} className="sr-only">Search</label>
          <input id={inputId} className="newtab-q" placeholder="Search or enter URL…"
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} autoFocus />
        </div>

        <div className="ql-grid">
          {QUICK_LINKS.map(ql => (
            <button key={ql.url} className="ql-card"
              onClick={() => onNavigate(ql.url)}
              onContextMenu={e => { e.preventDefault(); onOpen(ql.url) }}
              title={`${ql.url}\nRight-click → new tab`}>
              <span className="ql-ico" style={{ background: ql.bg }}>{ql.label[0]}</span>
              <span className="ql-name">{ql.label}</span>
            </button>
          ))}
          <button className="ql-card ql-editor" onClick={onEditor} title="HTML/CSS/JS Editor">
            <span className="ql-ico ql-ico-code">{"</>"}</span>
            <span className="ql-name">HTML Editor</span>
          </button>
        </div>
        <p className="newtab-tip">Right-click a tile to open in a new tab · Some sites block iframe embedding</p>
      </div>
    </div>
  )
}

function GlobeIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <circle cx="22" cy="22" r="20" stroke="#4f8ef7" strokeWidth="1.8"/>
      <ellipse cx="22" cy="22" rx="8" ry="20" stroke="#4f8ef7" strokeWidth="1.4"/>
      <line x1="2" y1="22" x2="42" y2="22" stroke="#4f8ef7" strokeWidth="1.4"/>
      <circle cx="22" cy="22" r="13" stroke="#4f8ef7" strokeWidth="1.4" strokeDasharray="4 3"/>
    </svg>
  )
}
