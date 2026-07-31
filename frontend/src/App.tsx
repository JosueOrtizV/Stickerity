import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ThinkingOrb } from 'thinking-orbs';
import './index.css';
import { Toaster, toast } from 'sonner';
import StickerCard from './components/StickerCard';
import FloatingSelectionBar from './components/FloatingSelectionBar';
import DownloadPopover from './components/DownloadPopover';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import HelpPage from './pages/HelpPage';
import AboutPage from './pages/AboutPage';
import ScrollToTop from './components/ScrollToTop';
import { trackEvent, getDomainFromUrl } from './utils/analytics';

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const hostname = window.location.hostname || 'localhost';
  if (hostname.includes('stickerity.app')) {
    return 'https://api.stickerity.app/api';
  }
  return `http://${hostname}:3000/api`;
};

// --- SVG Icons ---
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// --- Theme Hook ---
function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('stickerity-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'system' as unknown as 'light' | 'dark';
  });

  useEffect(() => {
    if (theme === ('system' as string)) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('stickerity-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(prev => {
      const currentlyDark =
        prev === 'dark' ||
        (prev === ('system' as string) && window.matchMedia('(prefers-color-scheme: dark)').matches);
      return currentlyDark ? 'light' : 'dark';
    });
  }, []);

  const isDark =
    theme === 'dark' ||
    (theme === ('system' as string) && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return { theme, toggle, isDark };
}

function HomePage() {
  const { t } = useTranslation();

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickers, setStickers] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const [zipModalOpen, setZipModalOpen] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number, total: number } | null>(null);
  const [checkingZipFormat, setCheckingZipFormat] = useState(false);

  // Per-card download state
  const [cardDownloading, setCardDownloading] = useState<Map<number, 'webp' | 'gif'>>(new Map());
  const [cardAnimated, setCardAnimated] = useState<Map<number, boolean>>(new Map());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!zipProgress) setZipModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zipProgress]);

  const getErrorMessage = (errKeyOrMsg: string) => {
    if (!errKeyOrMsg) return t('errors.server_error');
    const translated = t(`errors.${errKeyOrMsg}`);
    if (translated !== `errors.${errKeyOrMsg}`) return translated;
    return errKeyOrMsg;
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const domain = getDomainFromUrl(url);
    trackEvent('extract_start', { url_domain: domain });

    setLoading(true);
    setError(null);
    setStickers([]);
    setSelectedIndices(new Set());
    setCardAnimated(new Map());

    try {
      const response = await fetch(`${getApiBaseUrl()}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('errors.extraction_failed'));
      }

      if (!response.body) throw new Error(t('errors.server_error'));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.type === 'sticker' && data.sticker) {
              receivedCount++;
              setStickers(prev => [...prev, data.sticker]);
            } else if (data.type === 'error') {
              throw new Error(data.error || t('errors.extraction_failed'));
            }
          } catch (err: any) {
            if (err.message && !err.message.includes('Unexpected end of JSON input') && !err.message.includes('JSON at position')) {
              console.error('Stream parse error:', err);
            }
          }
        }
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim());
          if (data.type === 'sticker' && data.sticker) {
            receivedCount++;
            setStickers(prev => [...prev, data.sticker]);
          }
        } catch (e) {}
      }

      if (receivedCount === 0) {
        setError(t('errors.no_stickers_found'));
        trackEvent('extract_error', { url_domain: domain, error_type: 'no_stickers_found' });
      } else {
        toast.success(t('toast.extractionSuccess', { count: receivedCount }));
        trackEvent('extract_success', { url_domain: domain, sticker_count: receivedCount });
      }
    } catch (err: any) {
      setError(getErrorMessage(err.message));
      trackEvent('extract_error', { url_domain: domain, error_type: err.message || 'extraction_failed' });
    } finally {
      setLoading(false);
    }
  };

  const getStickerProxyUrl = (rawUrl: string) =>
    `${getApiBaseUrl()}/sticker?url=${encodeURIComponent(rawUrl)}&v=2`;

  const toggleSelectSticker = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const handleSelectAll = () => {
    const all = new Set<number>();
    stickers.forEach((_, i) => all.add(i));
    setSelectedIndices(all);
  };

  const handleDeselectAll = () => setSelectedIndices(new Set());

  // Check format on demand
  const checkStickerFormat = async (rawUrl: string, index: number): Promise<boolean> => {
    let isAnimated = rawUrl.toLowerCase().includes('awebp') || rawUrl.toLowerCase().includes('.gif');
    try {
      const res = await fetch(getStickerProxyUrl(rawUrl), { method: 'HEAD' });
      const header = res.headers.get('X-Sticker-Animated');
      if (header) isAnimated = header === 'true';
    } catch (err) {
      console.error('HEAD check failed', err);
    }
    setCardAnimated(prev => new Map(prev).set(index, isAnimated));
    return isAnimated;
  };

  const executeCardDownload = async (rawUrl: string, index: number, format: 'webp' | 'gif') => {
    setCardDownloading(prev => new Map(prev).set(index, format));
    try {
      const proxyUrl = getStickerProxyUrl(rawUrl) + `&format=${format}`;
      const res = await fetch(proxyUrl);
      const contentType = res.headers.get('content-type') || '';
      const actualExt = contentType.includes('gif') ? 'gif' : 'webp';
      const blob = await res.blob();
      const filename = `stickerity-${index + 1}.${actualExt}`;
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      toast.success(t('toast.downloadSuccess'));
      trackEvent('download_single', { format: actualExt });
    } catch (err) {
      console.error(err);
      alert(t('errors.process_sticker_failed'));
    } finally {
      setCardDownloading(prev => {
        const next = new Map(prev);
        next.delete(index);
        return next;
      });
    }
  };

  // ZIP download
  const executeZipDownload = async (requestedFormat: 'webp' | 'gif') => {
    const indicesToDownload = Array.from(selectedIndices);
    if (indicesToDownload.length === 0) return;

    const zip = new JSZip();
    setZipProgress({ current: 0, total: indicesToDownload.length });
    const CONCURRENCY_LIMIT = 3;
    let completed = 0;

    const processBatch = async (indices: number[]) => {
      for (let i = 0; i < indices.length; i += CONCURRENCY_LIMIT) {
        const batch = indices.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(
          batch.map(async (idx) => {
            const rawUrl = stickers[idx];
            const proxyUrl = getStickerProxyUrl(rawUrl) + `&format=${requestedFormat}`;
            try {
              const res = await fetch(proxyUrl);
              const contentType = res.headers.get('content-type') || '';
              const actualExt = contentType.includes('gif') ? 'gif' : 'webp';
              const blob = await res.blob();
              zip.file(`stickerity-${idx + 1}.${actualExt}`, blob);
            } catch (e) {
              console.error(`ZIP: failed sticker #${idx + 1}`, e);
            } finally {
              completed++;
              setZipProgress({ current: completed, total: indicesToDownload.length });
            }
          })
        );
      }
    };

    try {
      await processBatch(indicesToDownload);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Stickerity-Pack-${requestedFormat.toUpperCase()}.zip`);
      toast.success(t('toast.zipSuccess'));
      trackEvent('download_zip', { format: requestedFormat, count: indicesToDownload.length });
      setSelectedIndices(new Set());
    } catch (err) {
      console.error(err);
      alert(t('errors.zip_failed'));
    } finally {
      setZipProgress(null);
      setZipModalOpen(false);
    }
  };

  const handleZipButtonClick = async () => {
    if (selectedIndices.size === 0) return;
    setCheckingZipFormat(true);
    let hasAnimated = false;

    try {
      const selectedUrls = Array.from(selectedIndices).map(idx => stickers[idx]);
      const results = await Promise.all(
        selectedUrls.map(async (rawUrl) => {
          try {
            const res = await fetch(getStickerProxyUrl(rawUrl), { method: 'HEAD' });
            return res.headers.get('X-Sticker-Animated') === 'true';
          } catch { return false; }
        })
      );
      hasAnimated = results.some(Boolean);
    } catch (e) {
      console.error('Format check failed', e);
    } finally {
      setCheckingZipFormat(false);
    }

    if (hasAnimated) {
      setZipModalOpen(true);
    } else {
      setZipModalOpen(true);
      executeZipDownload('webp');
    }
  };

  const selectedCount = selectedIndices.size;

  return (
    <>
      <form onSubmit={handleExtract} className="search-box">
        <input
          type="url"
          className="search-input"
          placeholder={t('search.placeholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" className="btn-extract" disabled={loading}>
          {loading ? (
            <>
              <ThinkingOrb state="searching" size={20} theme="dark" />
              {t('search.loading')}
            </>
          ) : (
            t('search.button')
          )}
        </button>
      </form>

      {!loading && stickers.length === 0 && !error && (
        <>
          <p className="trust-line">
            {t('search.supportedSources')}
          </p>

          <section className="seo-section" style={{ marginTop: 'var(--space-8)', textAlign: 'left' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)', color: 'var(--color-ink)', fontFamily: 'var(--font-display)' }}>
              {t('homeSeo.howItWorksTitle')}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
              <div style={{ background: 'var(--color-surface-raised)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)', marginBottom: 'var(--space-2)', marginTop: 0 }}>{t('homeSeo.step1Title')}</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0, lineHeight: 1.5 }}>{t('homeSeo.step1Desc')}</p>
              </div>
              <div style={{ background: 'var(--color-surface-raised)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-teal)', marginBottom: 'var(--space-2)', marginTop: 0 }}>{t('homeSeo.step2Title')}</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0, lineHeight: 1.5 }}>{t('homeSeo.step2Desc')}</p>
              </div>
              <div style={{ background: 'var(--color-surface-raised)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)', marginBottom: 'var(--space-2)', marginTop: 0 }}>{t('homeSeo.step3Title')}</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0, lineHeight: 1.5 }}>{t('homeSeo.step3Desc')}</p>
              </div>
            </div>

            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)', color: 'var(--color-ink)', fontFamily: 'var(--font-display)' }}>
              {t('homeSeo.faqTitle')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <article style={{ background: 'var(--color-surface-raised)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', margin: '0 0 var(--space-2) 0', color: 'var(--color-ink)' }}>{t('homeSeo.faq1Q')}</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0, lineHeight: 1.5 }}>{t('homeSeo.faq1A')}</p>
              </article>
              <article style={{ background: 'var(--color-surface-raised)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', margin: '0 0 var(--space-2) 0', color: 'var(--color-ink)' }}>{t('homeSeo.faq2Q')}</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0, lineHeight: 1.5 }}>{t('homeSeo.faq2A')}</p>
              </article>
              <article style={{ background: 'var(--color-surface-raised)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', margin: '0 0 var(--space-2) 0', color: 'var(--color-ink)' }}>{t('homeSeo.faq3Q')}</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0, lineHeight: 1.5 }}>
                  {t('homeSeo.faq3A')}{' '}
                  <Link 
                    to="/help" 
                    onClick={() => window.scrollTo(0,0)} 
                    style={{ 
                      color: 'var(--color-accent)', 
                      fontWeight: 600, 
                      textDecoration: 'underline',
                      display: 'inline-block',
                      marginLeft: '4px' 
                    }}
                  >
                    {t('header.help')} →
                  </Link>
                </p>
              </article>
              <article style={{ background: 'var(--color-surface-raised)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', margin: '0 0 var(--space-2) 0', color: 'var(--color-ink)' }}>{t('homeSeo.faq4Q')}</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0, lineHeight: 1.5 }}>{t('homeSeo.faq4A')}</p>
              </article>
            </div>
          </section>
        </>
      )}

      {error && <div className="error-banner">{error}</div>}

      {/* Skeleton loading state */}
      {loading && stickers.length === 0 && (
        <div className="loading-state">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <ThinkingOrb state="searching" size={64} />
          </div>
          <p>{t('loadingState.title')}</p>
          <small>{t('loadingState.subtext')}</small>
        </div>
      )}

      {/* Live extraction counter */}
      {loading && stickers.length > 0 && (
        <div className="loading-inline">
          <ThinkingOrb state="searching" size={20} />
          <span>{t('loadingState.liveStatus', { count: stickers.length })}</span>
        </div>
      )}

      {/* Sticker Grid */}
      {stickers.length > 0 && (
        <section className="grid">
          {stickers.map((stickerUrl, index) => {
            const isAnimated = cardAnimated.get(index);
            const downloadFormat = cardDownloading.get(index) || null;

            return (
              <StickerCard
                key={index}
                stickerUrl={stickerUrl}
                proxyUrl={getStickerProxyUrl(stickerUrl)}
                index={index}
                isSelected={selectedIndices.has(index)}
                onToggleSelect={toggleSelectSticker}
                altText={t('grid.stickerAlt', { index: index + 1 })}
                style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
              >
                <DownloadPopover
                  isAnimated={isAnimated}
                  onCheckFormat={() => checkStickerFormat(stickerUrl, index)}
                  onDownload={(format) => executeCardDownload(stickerUrl, index, format)}
                  downloadingFormat={downloadFormat}
                  triggerLabel={t('grid.downloadButton')}
                  gifLabel={t('downloadModal.downloadGif')}
                  webpLabel={t('downloadModal.downloadWebp')}
                  processingGifLabel={t('downloadModal.processingGif')}
                  processingWebpLabel={t('downloadModal.processingWebp')}
                />
              </StickerCard>
            );
          })}
        </section>
      )}

      {/* HF3: Floating Selection Bar */}
      {stickers.length > 0 && (
        <FloatingSelectionBar
          selectedCount={selectedCount}
          totalCount={stickers.length}
          onDeselectAll={handleDeselectAll}
          onSelectAll={handleSelectAll}
          onDownloadZip={handleZipButtonClick}
          isCheckingFormat={checkingZipFormat}
          selectAllLabel={t('grid.selectAll')}
          downloadLabel={t('grid.downloadZip', { count: selectedCount })}
          countLabel={t('grid.selectedCount', { count: selectedCount, total: stickers.length })}
          processingLabel={t('zipModal.progressTitle')}
        />
      )}

      {/* ZIP Format Modal — only shows when animated stickers detected */}
      {zipModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => { if (!zipProgress) setZipModalOpen(false); }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {!zipProgress && <button className="modal-close" onClick={() => setZipModalOpen(false)}>✕</button>}
            <h2>{t('zipModal.title', { count: selectedCount })}</h2>

            {zipProgress ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                  <ThinkingOrb state="working" size={64} />
                </div>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>{t('zipModal.progressTitle')}</p>
                <small style={{ color: 'var(--color-ink-muted)' }}>
                  {t('zipModal.progressStatus', { current: zipProgress.current, total: zipProgress.total })}
                </small>
                <div className="progress-bar-wrapper">
                  <div className="progress-bar-fill" style={{ width: `${(zipProgress.current / zipProgress.total) * 100}%` }} />
                </div>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
                  {t('zipModal.formatSubtitle')}
                </p>
                <div className="modal-actions">
                  <button onClick={() => executeZipDownload('gif')} className="btn-primary">
                    <DownloadIcon /> {t('zipModal.downloadGifZip')}
                  </button>
                  <small style={{ color: 'var(--color-ink-faint)', fontSize: 'var(--text-xs)', textAlign: 'center' }}>
                    {t('zipModal.gifNote')}
                  </small>
                  <button onClick={() => executeZipDownload('webp')} className="btn-secondary">
                    <DownloadIcon /> {t('zipModal.downloadWebpZip')}
                  </button>
                  <small style={{ color: 'var(--color-ink-faint)', fontSize: 'var(--text-xs)', textAlign: 'center' }}>
                    {t('zipModal.webpNote')}
                  </small>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { toggle, isDark } = useTheme();
  const currentLang = i18n.language || 'es';

  return (
    <BrowserRouter>
      <div className="container">
        <header className="header">
          <div className="header-controls">
            <div className="lang-switcher">
              <button
                className={`lang-btn ${currentLang.startsWith('es') ? 'active' : ''}`}
                onClick={() => i18n.changeLanguage('es')}
              >
                ES
              </button>
              <button
                className={`lang-btn ${currentLang.startsWith('en') ? 'active' : ''}`}
                onClick={() => i18n.changeLanguage('en')}
              >
                EN
              </button>
            </div>
            <Link to="/help" className="theme-toggle" style={{ textDecoration: 'none', width: 'auto', padding: '0 10px', fontSize: 'var(--text-xs)', fontWeight: 600 }} aria-label="Help">
              {t('header.help')}
            </Link>
            <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme">
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>

          <Link to="/" style={{ textDecoration: 'none' }}>
            <h1 className="logo">{t('header.title')}</h1>
          </Link>
          <p className="subtitle">{t('header.subtitle')}</p>
        </header>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>

        <footer className="footer">
          <div className="footer-content">
            <p className="copyright">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
            <div className="footer-links">
              <Link to="/about" className="footer-link" onClick={() => window.scrollTo(0,0)}>{t('footer.about')}</Link>
              <Link to="/help" className="footer-link" onClick={() => window.scrollTo(0,0)}>{t('header.help')}</Link>
              <Link to="/terms" className="footer-link" onClick={() => window.scrollTo(0,0)}>{t('footer.terms')}</Link>
              <Link to="/privacy" className="footer-link" onClick={() => window.scrollTo(0,0)}>{t('footer.privacy')}</Link>
            </div>
          </div>
        </footer>
      </div>
      <ScrollToTop />
      <Toaster position="top-center" theme={isDark ? 'dark' : 'light'} toastOptions={{ className: 'stickerity-toast' }} />
    </BrowserRouter>
  );
}
