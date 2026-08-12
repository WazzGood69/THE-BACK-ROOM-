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

interface Tab {
  id: string
  mode: TabMode
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  history: string[]
  historyIndex: number
  favicon: string
  error: string | null
  content: string | null
  // editor-mode fields
  editorHtml: string
  editorRendered: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const NEW_TAB_URL = "about:newtab"
const HOME_URL    = "https://en.wikipedia.org/wiki/Main_Page"

const PROXIES = [
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

const QUICK_LINKS = [
  { label: "Wikipedia",    url: "https://en.wikipedia.org/wiki/Main_Page", bg: "#3366cc" },
  { label: "Hacker News",  url: "https://news.ycombinator.com",            bg: "#ff6600" },
  { label: "MDN Docs",     url: "https://developer.mozilla.org",           bg: "#0d7377" },
  { label: "Archive.org",  url: "https://archive.org",                     bg: "#428bca" },
  { label: "DuckDuckGo",   url: "https://html.duckduckgo.com/html",        bg: "#de5833" },
  { label: "W3Schools",    url: "https://www.w3schools.com",               bg: "#4cae4c" },
  { label: "OpenStreetMap",url: "https://www.openstreetmap.org",           bg: "#7ebc6f" },
  { label: "Lobsters",     url: "https://lobste.rs",                       bg: "#ac130d" },
]

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>My Page</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 640px;
      margin: 40px auto;
      padding: 0 20px;
      background: #fafafa;
      color: #111;
    }
    h1 { color: #2563eb; }
    button {
      background: #2563eb; color: #fff;
      border: none; padding: 8px 18px;
      border-radius: 6px; cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #1d4ed8; }
    #out { margin-top: 14px; font-weight: 600; color: #16a34a; }
  </style>
</head>
<body>
  <h1>Hello from the HTML Editor!</h1>
  <p>Write any HTML, CSS, and JavaScript here and hit <strong>Run</strong>.</p>
  <button onclick="document.getElementById('out').textContent = 'Button clicked at ' + new Date().toLocaleTimeString()">
    Click Me
  </button>
  <div id="out"></div>
</body>
</html>`

// ── Utilities ──────────────────────────────────────────────────────────────

let _id = 0
function uid() { return `t${++_id}` }

function normalizeUrl(raw: string): string {
  raw = raw.trim()
  if (!raw) return NEW_TAB_URL
  if (raw.startsWith("about:")) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^[\w.-]+\.\w{2,}/.test(raw) && !raw.includes(" ")) return "https://" + raw
  return `https://html.duckduckgo.com/html?q=${encodeURIComponent(raw)}`
}

function displayUrl(url: string) {
  if (url === NEW_TAB_URL) return ""
  try { const u = new URL(url); return u.hostname + u.pathname + (u.search || "") }
  catch { return url }
}

function faviconFor(url: string) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` }
  catch { return "" }
}

function blankTab(url = NEW_TAB_URL): Tab {
  return {
    id: uid(), mode: "browser",
    url, title: url === NEW_TAB_URL ? "New Tab" : url,
    loading: url !== NEW_TAB_URL,
    canGoBack: false, canGoForward: false,
    history: [url], historyIndex: 0,
    favicon: url !== NEW_TAB_URL ? faviconFor(url) : "",
    error: null, content: null,
    editorHtml: DEFAULT_HTML, editorRendered: null,
  }
}

async function fetchWithProxies(url: string): Promise<{ html: string; title: string }> {
  let lastErr: unknown
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(12000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let html = await res.text()
      // Inject base so relative resources resolve
      const base = `<base href="${url}" target="_self">`
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/(<head[^>]*>)/i, `$1${base}`)
        : base + html
      const titleM = html.match(/<title[^>]*>([^<]*)<\/title>/i)
      return { html, title: titleM ? titleM[1].trim() : displayUrl(url) }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

// ── Main component ─────────────────────────────────────────────────────────

export default function App() {
  const [tabs, setTabs]           = useState<Tab[]>([blankTab()])
  const [activeId, setActiveId]   = useState<string>(() => tabs[0].id)
  const [addrInput, setAddrInput] = useState("")
  const [addrFocus, setAddrFocus] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const aborts = useRef<Record<string, AbortController>>({})

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0]

  const patchTab = useCallback((id: string, patch: Partial<Tab>) =>
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t)), [])

  // Keep address bar in sync
  useEffect(() => {
    if (!addrFocus) setAddrInput(activeTab.url === NEW_TAB_URL ? "" : activeTab.url)
  }, [activeTab.url, activeTab.id, addrFocus])

  // Sync editor panel visibility
  useEffect(() => {
    setShowEditor(activeTab.mode === "editor")
  }, [activeTab.mode, activeTab.id])

  const loadUrl = useCallback(async (tabId: string, url: string, push = true) => {
    if (url === NEW_TAB_URL) {
      setTabs(prev => prev.map(t => {
        if (t.id !== tabId) return t
        const hist = push ? [...t.history.slice(0, t.historyIndex + 1), url] : t.history
        const idx  = push ? hist.length - 1 : t.historyIndex
        return { ...t, url, title: "New Tab", loading: false, content: null, error: null,
          favicon: "", history: hist, historyIndex: idx, mode: "browser",
          canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
      }))
      return
    }

    aborts.current[tabId]?.abort()
    const ctrl = new AbortController()
    aborts.current[tabId] = ctrl

    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const hist = push ? [...t.history.slice(0, t.historyIndex + 1), url] : t.history
      const idx  = push ? hist.length - 1 : t.historyIndex
      return { ...t, url, displayUrl: displayUrl(url), title: displayUrl(url) || url,
        loading: true, content: null, error: null, favicon: faviconFor(url),
        history: hist, historyIndex: idx, mode: "browser",
        canGoBack: idx > 0, canGoForward: idx < hist.length - 1 }
    }))

    try {
      const { html, title } = await fetchWithProxies(url)
      if (ctrl.signal.aborted) return
      patchTab(tabId, { content: html, title, loading: false })
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return
      patchTab(tabId, { loading: false, error: String(e instanceof Error ? e.message : e), title: "Error" })
    }
  }, [patchTab])

  const navigate = useCallback((input: string) => {
    loadUrl(activeTab.id, normalizeUrl(input))
  }, [activeTab.id, loadUrl])

  const goBack = () => {
    const t = activeTab; if (!t.canGoBack) return
    const idx = t.historyIndex - 1
    setTabs(prev => prev.map(tab => tab.id === t.id
      ? { ...tab, historyIndex: idx, canGoBack: idx > 0, canGoForward: true } : tab))
    loadUrl(t.id, t.history[idx], false)
  }
  const goForward = () => {
    const t = activeTab; if (!t.canGoForward) return
    const idx = t.historyIndex + 1
    setTabs(prev => prev.map(tab => tab.id === t.id
      ? { ...tab, historyIndex: idx, canGoBack: true, canGoForward: idx < tab.history.length - 1 } : tab))
    loadUrl(t.id, t.history[idx], false)
  }
  const refresh = () => { if (activeTab.url !== NEW_TAB_URL && activeTab.mode === "browser") loadUrl(activeTab.id, activeTab.url, false) }

  const openTab = (url = NEW_TAB_URL) => {
    const tab = blankTab(url)
    setTabs(prev => [...prev, tab])
    setActiveId(tab.id)
    if (url !== NEW_TAB_URL) loadUrl(tab.id, url)
  }

  const openEditorTab = () => {
    const tab: Tab = { ...blankTab(NEW_TAB_URL), mode: "editor", title: "HTML Editor" }
    setTabs(prev => [...prev, tab])
    setActiveId(tab.id)
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    aborts.current[id]?.abort()
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

  const runEditor = () => {
    patchTab(activeTab.id, { editorRendered: activeTab.editorHtml })
  }

  const addrKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { navigate(addrInput); e.currentTarget.blur() }
    if (e.key === "Escape") { setAddrInput(activeTab.url === NEW_TAB_URL ? "" : activeTab.url); e.currentTarget.blur() }
  }

  return (
    <div className="shell">
      {/* Tab strip */}
      <div className="tabstrip">
        <div className="tabs-row">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeId ? "tab--active" : ""}`}
              onClick={() => setActiveId(tab.id)}
              title={tab.title}
            >
              {tab.mode === "editor"
                ? <span className="tab-ico editor-ico">{"</>"}</span>
                : tab.favicon
                  ? <img src={tab.favicon} className="tab-fav" alt="" onError={e => (e.currentTarget.style.display="none")} />
                  : <span className="tab-ico">⬡</span>}
              <span className="tab-label">{tab.title}</span>
              {tab.loading && <span className="tab-spin" />}
              <span className="tab-x" onClick={e => closeTab(tab.id, e)} role="button" aria-label="close">✕</span>
            </div>
          ))}
        </div>
        <div className="tab-actions">
          <button className="icon-btn" onClick={() => openTab()} title="New tab">+</button>
          <button className="icon-btn editor-btn" onClick={openEditorTab} title="HTML Editor">{"</>"}</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <NavBtn icon="←" title="Back"    onClick={goBack}    disabled={!activeTab.canGoBack} />
        <NavBtn icon="→" title="Forward" onClick={goForward} disabled={!activeTab.canGoForward} />
        <NavBtn icon="↺" title="Refresh" onClick={refresh}   disabled={activeTab.loading || activeTab.mode === "editor"} />
        <NavBtn icon="⌂" title="Home"    onClick={() => loadUrl(activeTab.id, HOME_URL)} />

        <div className={`addr-wrap ${addrFocus ? "addr-focus" : ""}`}>
          {activeTab.mode === "editor"
            ? <span className="addr-badge editor-badge">{"</>"} HTML Editor</span>
            : <>
                {activeTab.url !== NEW_TAB_URL && !addrFocus && (
                  <span className="addr-scheme">{activeTab.url.startsWith("https") ? "🔒" : "⚠️"}</span>
                )}
                <input
                  className="addr-input"
                  value={addrFocus ? addrInput : (activeTab.url === NEW_TAB_URL ? "" : activeTab.url)}
                  onChange={e => setAddrInput(e.target.value)}
                  onFocus={e => { setAddrFocus(true); setAddrInput(activeTab.url === NEW_TAB_URL ? "" : activeTab.url); setTimeout(() => e.target.select(), 0) }}
                  onBlur={() => setAddrFocus(false)}
                  onKeyDown={addrKeyDown}
                  placeholder="Search or enter URL…"
                  spellCheck={false}
                />
                {activeTab.loading && <span className="addr-bar-loader" />}
              </>}
        </div>

        {activeTab.mode === "editor"
          ? <button className="run-btn" onClick={runEditor}>▶ Run</button>
          : <NavBtn icon="⧉" title="Duplicate in new tab" onClick={() => activeTab.url !== NEW_TAB_URL && openTab(activeTab.url)} />}
      </div>

      {/* Content */}
      <div className="content">
        {activeTab.mode === "editor"
          ? <EditorPane
              key={activeTab.id}
              html={activeTab.editorHtml}
              rendered={activeTab.editorRendered}
              onChange={v => patchTab(activeTab.id, { editorHtml: v })}
              onRun={runEditor}
            />
          : activeTab.url === NEW_TAB_URL
            ? <NewTab onNavigate={url => loadUrl(activeTab.id, url)} onOpen={openTab} onEditor={openEditorTab} />
            : activeTab.error
              ? <ErrPage error={activeTab.error} onRetry={refresh} />
              : activeTab.loading && !activeTab.content
                ? <LoadPage url={activeTab.url} />
                : activeTab.content
                  ? <iframe
                      key={activeTab.id + "|" + activeTab.url}
                      srcDoc={activeTab.content}
                      className="page-frame"
                      sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                      title={activeTab.title}
                    />
                  : null}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function NavBtn({ icon, title, onClick, disabled = false }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="nav-btn" title={title} onClick={onClick} disabled={disabled}>
      {icon}
    </button>
  )
}

function EditorPane({ html, rendered, onChange, onRun }: {
  html: string; rendered: string | null
  onChange: (v: string) => void; onRun: () => void
}) {
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onRun() }
    if (e.key === "Tab") {
      e.preventDefault()
      const el = e.currentTarget
      const s = el.selectionStart, end = el.selectionEnd
      const next = html.slice(0, s) + "  " + html.slice(end)
      onChange(next)
      setTimeout(() => { el.selectionStart = el.selectionEnd = s + 2 }, 0)
    }
  }
  return (
    <div className="editor-pane">
      <div className="editor-left">
        <div className="editor-header">
          <span>HTML · CSS · JS</span>
          <span className="editor-hint">Ctrl+Enter to run</span>
        </div>
        <textarea
          className="editor-textarea"
          value={html}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />
      </div>
      <div className="editor-right">
        <div className="editor-header">
          <span>Preview</span>
          {!rendered && <span className="editor-hint">Hit ▶ Run to render</span>}
        </div>
        {rendered
          ? <iframe
              srcDoc={rendered}
              className="editor-frame"
              sandbox="allow-scripts allow-forms allow-modals"
              title="HTML preview"
            />
          : <div className="editor-empty">
              <span className="editor-empty-icon">{"</>"}</span>
              <p>Write HTML above, then click <strong>▶ Run</strong></p>
            </div>}
      </div>
    </div>
  )
}

function NewTab({ onNavigate, onOpen, onEditor }: {
  onNavigate: (url: string) => void
  onOpen: (url: string) => void
  onEditor: () => void
}) {
  const [q, setQ] = useState("")
  const id = useId()
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

        <div className="newtab-search-box">
          <label htmlFor={id} className="sr-only">Search</label>
          <SearchIcon />
          <input
            id={id}
            className="newtab-q"
            placeholder="Search the web or enter a URL…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            autoFocus
          />
        </div>

        <div className="ql-grid">
          {QUICK_LINKS.map(ql => (
            <button
              key={ql.url}
              className="ql-card"
              onClick={() => onNavigate(ql.url)}
              onContextMenu={e => { e.preventDefault(); onOpen(ql.url) }}
              title={ql.url}
            >
              <span className="ql-icon" style={{ background: ql.bg }}>{ql.label[0]}</span>
              <span className="ql-name">{ql.label}</span>
            </button>
          ))}
          <button className="ql-card ql-editor-card" onClick={onEditor} title="Open HTML Editor">
            <span className="ql-icon ql-icon-editor">{"</>"}</span>
            <span className="ql-name">HTML Editor</span>
          </button>
        </div>

        <p className="newtab-tip">Right-click a tile to open in a new tab</p>
      </div>
    </div>
  )
}

function LoadPage({ url }: { url: string }) {
  return (
    <div className="status-page">
      <div className="spin-ring" />
      <p className="status-url">{displayUrl(url)}</p>
      <p className="status-sub">Fetching through proxy…</p>
    </div>
  )
}

function ErrPage({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="status-page">
      <div className="err-blob">!</div>
      <p className="status-title">Could not load page</p>
      <p className="status-sub">{error}</p>
      <button className="retry-btn" onClick={onRetry}>Try Again</button>
    </div>
  )
}

function GlobeIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" stroke="#4f8ef7" strokeWidth="2" />
      <ellipse cx="24" cy="24" rx="9" ry="22" stroke="#4f8ef7" strokeWidth="1.5" />
      <line x1="2" y1="24" x2="46" y2="24" stroke="#4f8ef7" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="15" stroke="#4f8ef7" strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7.5" cy="7.5" r="5.5" stroke="#666" strokeWidth="1.6" />
      <path d="M12 12l4 4" stroke="#666" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
