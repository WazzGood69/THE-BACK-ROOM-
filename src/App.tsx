import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react"

interface Tab {
  id: string
  url: string
  displayUrl: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  history: string[]
  historyIndex: number
  favicon: string
  error: string | null
  content: string | null
}

const NEW_TAB_URL = "about:newtab"
const HOME_URL = "https://en.wikipedia.org/wiki/Main_Page"

const QUICK_LINKS = [
  { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page", color: "#3366cc" },
  { label: "Hacker News", url: "https://news.ycombinator.com", color: "#ff6600" },
  { label: "MDN Web Docs", url: "https://developer.mozilla.org", color: "#0d7377" },
  { label: "GitHub", url: "https://github.com", color: "#24292f" },
  { label: "OpenStreetMap", url: "https://www.openstreetmap.org", color: "#7ebc6f" },
  { label: "Archive.org", url: "https://archive.org", color: "#428bca" },
  { label: "DuckDuckGo", url: "https://html.duckduckgo.com/html", color: "#de5833" },
  { label: "W3Schools", url: "https://www.w3schools.com", color: "#4cae4c" },
]

function makeId() {
  return Math.random().toString(36).slice(2, 9)
}

function normalizeUrl(input: string): string {
  input = input.trim()
  if (!input) return NEW_TAB_URL
  if (input.startsWith("about:")) return input
  if (/^https?:\/\//i.test(input)) return input
  if (/^[\w.-]+\.\w{2,}/.test(input) && !input.includes(" ")) return "https://" + input
  return `https://html.duckduckgo.com/html?q=${encodeURIComponent(input)}`
}

function getDisplayUrl(url: string) {
  if (url === NEW_TAB_URL) return ""
  try {
    const u = new URL(url)
    return u.hostname + u.pathname + (u.search || "")
  } catch {
    return url
  }
}

function getFaviconUrl(url: string) {
  if (url === NEW_TAB_URL) return ""
  try {
    const u = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`
  } catch {
    return ""
  }
}

function newTab(url = NEW_TAB_URL): Tab {
  return {
    id: makeId(),
    url,
    displayUrl: getDisplayUrl(url),
    title: url === NEW_TAB_URL ? "New Tab" : url,
    loading: url !== NEW_TAB_URL,
    canGoBack: false,
    canGoForward: false,
    history: [url],
    historyIndex: 0,
    favicon: getFaviconUrl(url),
    error: null,
    content: null,
  }
}

const PROXY = "https://api.allorigins.win/raw?url="

async function fetchPage(url: string): Promise<{ content: string; title: string }> {
  const proxyUrl = PROXY + encodeURIComponent(url)
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  let html = await res.text()

  // Inject base tag for relative URLs
  const baseTag = `<base href="${url}" target="_self">`
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`)
  } else {
    html = baseTag + html
  }

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : url

  return { content: html, title }
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([newTab()])
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id)
  const [addressInput, setAddressInput] = useState("")
  const [addressFocused, setAddressFocused] = useState(false)
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})
  const abortRefs = useRef<Record<string, AbortController>>({})

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const loadUrl = useCallback(
    async (tabId: string, url: string, pushHistory = true) => {
      if (url === NEW_TAB_URL) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  url,
                  displayUrl: "",
                  title: "New Tab",
                  loading: false,
                  content: null,
                  error: null,
                  favicon: "",
                  ...(pushHistory && t.historyIndex < t.history.length - 1
                    ? { history: [...t.history.slice(0, t.historyIndex + 1), url], historyIndex: t.historyIndex + 1 }
                    : pushHistory
                      ? { history: [...t.history, url], historyIndex: t.history.length }
                      : {}),
                }
              : t
          )
        )
        return
      }

      // Cancel previous load for this tab
      abortRefs.current[tabId]?.abort()
      const ctrl = new AbortController()
      abortRefs.current[tabId] = ctrl

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId) return t
          const newHistory = pushHistory
            ? [...t.history.slice(0, t.historyIndex + 1), url]
            : t.history
          const newIndex = pushHistory ? newHistory.length - 1 : t.historyIndex
          return {
            ...t,
            url,
            displayUrl: getDisplayUrl(url),
            title: getDisplayUrl(url) || url,
            loading: true,
            content: null,
            error: null,
            favicon: getFaviconUrl(url),
            history: newHistory,
            historyIndex: newIndex,
            canGoBack: newIndex > 0,
            canGoForward: newIndex < newHistory.length - 1,
          }
        })
      )

      try {
        const { content, title } = await fetchPage(url)
        if (ctrl.signal.aborted) return
        updateTab(tabId, { content, title, loading: false })
      } catch (err: unknown) {
        if (ctrl.signal.aborted) return
        const msg = err instanceof Error ? err.message : String(err)
        updateTab(tabId, {
          loading: false,
          error: `Failed to load "${url}": ${msg}`,
          title: "Error",
        })
      }
    },
    [updateTab]
  )

  // Sync address bar with active tab
  useEffect(() => {
    if (!addressFocused) {
      setAddressInput(activeTab.url === NEW_TAB_URL ? "" : activeTab.url)
    }
  }, [activeTab.url, activeTab.id, addressFocused])

  const handleNavigate = useCallback(
    (input: string) => {
      const url = normalizeUrl(input)
      loadUrl(activeTab.id, url)
    },
    [activeTab.id, loadUrl]
  )

  const handleAddressKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleNavigate(addressInput)
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === "Escape") {
      setAddressInput(activeTab.url === NEW_TAB_URL ? "" : activeTab.url)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const openNewTab = (url = NEW_TAB_URL) => {
    const tab = newTab(url)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    if (url !== NEW_TAB_URL) loadUrl(tab.id, url)
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    abortRefs.current[id]?.abort()
    setTabs((prev) => {
      if (prev.length === 1) return [newTab()]
      const next = prev.filter((t) => t.id !== id)
      if (activeTabId === id) {
        const idx = prev.findIndex((t) => t.id === id)
        setActiveTabId(next[Math.min(idx, next.length - 1)].id)
      }
      return next
    })
  }

  const goBack = () => {
    const t = activeTab
    if (!t.canGoBack) return
    const idx = t.historyIndex - 1
    const url = t.history[idx]
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === t.id
          ? { ...tab, historyIndex: idx, canGoBack: idx > 0, canGoForward: true }
          : tab
      )
    )
    loadUrl(t.id, url, false)
  }

  const goForward = () => {
    const t = activeTab
    if (!t.canGoForward) return
    const idx = t.historyIndex + 1
    const url = t.history[idx]
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === t.id
          ? { ...tab, historyIndex: idx, canGoBack: true, canGoForward: idx < tab.history.length - 1 }
          : tab
      )
    )
    loadUrl(t.id, url, false)
  }

  const refresh = () => {
    if (activeTab.url !== NEW_TAB_URL) loadUrl(activeTab.id, activeTab.url, false)
  }

  return (
    <div className="browser-shell">
      {/* ── Tab bar ── */}
      <div className="tab-bar">
        <div className="tabs-scroll">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-item ${tab.id === activeTabId ? "tab-active" : ""}`}
              onClick={() => setActiveTabId(tab.id)}
              title={tab.title}
            >
              {tab.favicon && tab.url !== NEW_TAB_URL ? (
                <img src={tab.favicon} alt="" className="tab-favicon" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
              ) : (
                <span className="tab-favicon-placeholder">⬡</span>
              )}
              <span className="tab-title">{tab.title}</span>
              {tab.loading && <span className="tab-spinner" />}
              <span
                className="tab-close"
                onClick={(e) => closeTab(tab.id, e)}
                role="button"
                aria-label="Close tab"
              >
                ✕
              </span>
            </button>
          ))}
        </div>
        <button className="new-tab-btn" onClick={() => openNewTab()} title="New tab">
          +
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <button className="nav-btn" onClick={goBack} disabled={!activeTab.canGoBack} title="Back">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="nav-btn" onClick={goForward} disabled={!activeTab.canGoForward} title="Forward">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="nav-btn" onClick={refresh} disabled={activeTab.loading} title="Refresh">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13 8A5 5 0 1 1 8 3c1.5 0 2.8.6 3.8 1.6L13 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M13 3v3h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="nav-btn" onClick={() => loadUrl(activeTab.id, HOME_URL)} title="Home">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 7.5L8 2l6 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 6.5V13h3v-3h2v3h3V6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className={`address-bar ${addressFocused ? "address-focused" : ""}`}>
          {activeTab.url !== NEW_TAB_URL && !addressFocused && (
            <span className="address-protocol">
              {activeTab.url.startsWith("https") ? "🔒" : "⚠️"}
            </span>
          )}
          <input
            type="text"
            className="address-input"
            value={addressFocused ? addressInput : (activeTab.url === NEW_TAB_URL ? "" : activeTab.url)}
            onChange={(e) => setAddressInput(e.target.value)}
            onFocus={(e) => {
              setAddressFocused(true)
              setAddressInput(activeTab.url === NEW_TAB_URL ? "" : activeTab.url)
              setTimeout(() => e.target.select(), 0)
            }}
            onBlur={() => setAddressFocused(false)}
            onKeyDown={handleAddressKey}
            placeholder="Search or enter URL…"
            spellCheck={false}
          />
          {addressInput && addressFocused && (
            <button className="address-go" onMouseDown={(e) => { e.preventDefault(); handleNavigate(addressInput); ;(document.activeElement as HTMLElement)?.blur() }}>
              Go
            </button>
          )}
          {activeTab.loading && <div className="address-loader" />}
        </div>

        <button className="nav-btn" title="Open in new tab" onClick={() => activeTab.url !== NEW_TAB_URL && openNewTab(activeTab.url)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 2h7v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2L7 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Content area ── */}
      <div className="content-area">
        {activeTab.url === NEW_TAB_URL ? (
          <NewTabPage onNavigate={(url) => loadUrl(activeTab.id, url)} onOpenNewTab={openNewTab} />
        ) : activeTab.error ? (
          <ErrorPage error={activeTab.error} url={activeTab.url} onRetry={() => refresh()} />
        ) : activeTab.loading && !activeTab.content ? (
          <LoadingPage url={activeTab.url} />
        ) : activeTab.content ? (
          <iframe
            key={activeTab.id + activeTab.content.slice(0, 40)}
            ref={(el) => { iframeRefs.current[activeTab.id] = el }}
            srcDoc={activeTab.content}
            className="page-frame"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            title={activeTab.title}
          />
        ) : null}
      </div>
    </div>
  )
}

function NewTabPage({ onNavigate, onOpenNewTab }: { onNavigate: (url: string) => void; onOpenNewTab: (url: string) => void }) {
  const [search, setSearch] = useState("")

  const handleSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && search.trim()) {
      onNavigate(normalizeUrl(search))
    }
  }

  return (
    <div className="newtab">
      <div className="newtab-inner">
        <div className="newtab-logo">
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <circle cx="26" cy="26" r="25" stroke="#4a9eff" strokeWidth="2" />
            <circle cx="26" cy="26" r="17" stroke="#4a9eff" strokeWidth="1.5" strokeDasharray="3 3" />
            <ellipse cx="26" cy="26" rx="9" ry="25" stroke="#4a9eff" strokeWidth="1.5" />
            <line x1="1" y1="26" x2="51" y2="26" stroke="#4a9eff" strokeWidth="1.5" />
          </svg>
          <span className="newtab-brand">VaultBrowser</span>
        </div>

        <div className="newtab-search-wrap">
          <svg className="newtab-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="7.5" cy="7.5" r="5.5" stroke="#888" strokeWidth="1.6" />
            <path d="M12 12l4 4" stroke="#888" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            className="newtab-search"
            placeholder="Search the web or enter a URL"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearch}
            autoFocus
          />
        </div>

        <div className="quick-links">
          {QUICK_LINKS.map((ql) => (
            <button
              key={ql.url}
              className="quick-link"
              onClick={() => onNavigate(ql.url)}
              onContextMenu={(e) => { e.preventDefault(); onOpenNewTab(ql.url) }}
              title={`${ql.label}\n${ql.url}\nRight-click → open in new tab`}
            >
              <span className="quick-link-icon" style={{ background: ql.color }}>
                {ql.label[0]}
              </span>
              <span className="quick-link-label">{ql.label}</span>
            </button>
          ))}
        </div>

        <p className="newtab-hint">Right-click a quick link to open in a new tab</p>
      </div>
    </div>
  )
}

function LoadingPage({ url }: { url: string }) {
  return (
    <div className="status-page">
      <div className="spinner-ring" />
      <p className="status-url">{getDisplayUrl(url)}</p>
      <p className="status-sub">Fetching page…</p>
    </div>
  )
}

function ErrorPage({ error, url, onRetry }: { error: string; url: string; onRetry: () => void }) {
  return (
    <div className="status-page">
      <div className="error-icon">!</div>
      <p className="status-title">Page couldn&apos;t be loaded</p>
      <p className="status-url">{getDisplayUrl(url)}</p>
      <p className="status-sub">{error}</p>
      <button className="retry-btn" onClick={onRetry}>Try Again</button>
    </div>
  )
}
