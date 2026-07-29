import React, { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ThinkingOrb } from 'thinking-orbs';
import './index.css';

const getApiBaseUrl = () => {
  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:3000/api`;
};

// --- SVG Icons ---
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle', flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg className="spinner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }}>
    <line x1="12" y1="2" x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="6" y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export default function App() {
  const { t, i18n } = useTranslation();

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickers, setStickers] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  const [modalConfig, setModalConfig] = useState<{ url: string, index: number, isAnimated: boolean } | null>(null);
  const [zipModalOpen, setZipModalOpen] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number, total: number } | null>(null);
  
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'otras'>('whatsapp');
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<'webp' | 'gif' | null>(null);

  const getErrorMessage = (errKeyOrMsg: string) => {
    if (!errKeyOrMsg) return t('errors.server_error');
    const translated = t(`errors.${errKeyOrMsg}`);
    if (translated !== `errors.${errKeyOrMsg}`) {
      return translated;
    }
    return errKeyOrMsg;
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setStickers([]);
    setSelectedIndices(new Set());

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

      if (!response.body) {
        throw new Error(t('errors.server_error'));
      }

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
              const newStickerUrl = data.sticker;
              setStickers((prev) => {
                const nextIndex = prev.length;
                setSelectedIndices((prevSelected) => {
                  const updated = new Set(prevSelected);
                  updated.add(nextIndex);
                  return updated;
                });
                return [...prev, newStickerUrl];
              });
            } else if (data.type === 'error') {
              throw new Error(data.error || t('errors.extraction_failed'));
            }
          } catch (err: any) {
            if (err.message && !err.message.includes('Unexpected end of JSON input') && !err.message.includes('JSON at position')) {
              console.error('Error parsing stream line:', err);
            }
          }
        }
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim());
          if (data.type === 'sticker' && data.sticker) {
            receivedCount++;
            const newStickerUrl = data.sticker;
            setStickers((prev) => {
              const nextIndex = prev.length;
              setSelectedIndices((prevSelected) => {
                const updated = new Set(prevSelected);
                updated.add(nextIndex);
                return updated;
              });
              return [...prev, newStickerUrl];
            });
          }
        } catch (e) {}
      }

      if (receivedCount === 0) {
        setError(t('errors.no_stickers_found'));
      }

    } catch (err: any) {
      setError(getErrorMessage(err.message));
    } finally {
      setLoading(false);
    }
  };

  const getStickerProxyUrl = (rawUrl: string) => {
    return `${getApiBaseUrl()}/sticker?url=${encodeURIComponent(rawUrl)}&v=2`;
  };

  // Selection handlers
  const toggleSelectSticker = (index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const all = new Set<number>();
    stickers.forEach((_, i) => all.add(i));
    setSelectedIndices(all);
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleDownloadClick = (rawUrl: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const isAnimated = rawUrl.toLowerCase().includes('awebp') || rawUrl.toLowerCase().includes('.gif');
    setModalConfig({ url: rawUrl, index, isAnimated });
    setActiveTab('whatsapp');
  };

  const executeAction = async (format: 'webp' | 'gif') => {
    if (!modalConfig || downloadingFormat) return;
    setDownloadingFormat(format);
    try {
      const proxyUrl = getStickerProxyUrl(modalConfig.url) + `&format=${format}`;
      const res = await fetch(proxyUrl);
      const blob = await res.blob();
      const filename = `stickerity-${modalConfig.index + 1}.${format}`;
      
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      alert(t('errors.process_sticker_failed'));
    } finally {
      setDownloadingFormat(null);
    }
  };

  // Batch ZIP Generation Handler with Concurrency Control
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
            const isAnimated = rawUrl.toLowerCase().includes('awebp') || rawUrl.toLowerCase().includes('.gif');
            // Static stickers are always WebP; animated stickers follow requestedFormat
            const targetFormat = isAnimated ? requestedFormat : 'webp';
            const proxyUrl = getStickerProxyUrl(rawUrl) + `&format=${targetFormat}`;
            try {
              const res = await fetch(proxyUrl);
              const blob = await res.blob();
              const filename = `stickerity-${idx + 1}.${targetFormat}`;
              zip.file(filename, blob);
            } catch (e) {
              console.error(`Failed to include sticker #${idx + 1} in zip`, e);
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
    } catch (err) {
      console.error(err);
      alert(t('errors.zip_failed'));
    } finally {
      setZipProgress(null);
      setZipModalOpen(false);
    }
  };

  const handleZipButtonClick = () => {
    if (selectedIndices.size === 0) return;

    const hasAnimated = Array.from(selectedIndices).some((idx) => {
      const rawUrl = stickers[idx]?.toLowerCase() || '';
      return rawUrl.includes('awebp') || rawUrl.includes('.gif');
    });

    if (hasAnimated) {
      setZipModalOpen(true);
    } else {
      setZipModalOpen(true);
      executeZipDownload('webp');
    }
  };

  const currentLang = i18n.language || 'es';
  const selectedCount = selectedIndices.size;

  return (
    <div className="container">
      <header className="header">
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

        <h1 className="logo">{t('header.title')}</h1>
        <p className="subtitle">{t('header.subtitle')}</p>
      </header>

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

      {error && <div className="error-banner">{error}</div>}

      {loading && stickers.length === 0 && (
        <div className="loading-state">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <ThinkingOrb state="searching" size={64} theme="dark" />
          </div>
          <p>{t('loadingState.title')}</p>
          <small style={{ color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
            {t('loadingState.subtext')}
          </small>
        </div>
      )}

      {loading && stickers.length > 0 && (
        <div className="loading-state" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <ThinkingOrb state="searching" size={20} theme="dark" />
          <span>{t('loadingState.liveStatus', { count: stickers.length })}</span>
        </div>
      )}

      {stickers.length > 0 && (
        <>
          {/* Selection Control Bar */}
          <div className="selection-bar">
            <div className="selection-controls">
              <button className="btn-text" onClick={handleSelectAll}>
                {t('grid.selectAll')}
              </button>
              <button className="btn-text" onClick={handleDeselectAll}>
                {t('grid.deselectAll')}
              </button>
              <span className="selection-count">
                {t('grid.selectedCount', { count: selectedCount, total: stickers.length })}
              </span>
            </div>

            <button
              className="btn-primary"
              onClick={handleZipButtonClick}
              disabled={selectedCount === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: selectedCount === 0 ? 0.5 : 1,
                cursor: selectedCount === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <DownloadIcon /> {t('grid.downloadZip', { count: selectedCount })}
            </button>
          </div>

          <section className="grid">
            {stickers.map((stickerUrl, index) => {
              const isSelected = selectedIndices.has(index);
              return (
                <div
                  key={index}
                  className={`sticker-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelectSticker(index)}
                >
                  <div className="checkbox-badge">
                    {isSelected && <CheckIcon />}
                  </div>

                  <div className="sticker-img-wrapper">
                    <img
                      src={getStickerProxyUrl(stickerUrl)}
                      alt={t('grid.stickerAlt', { index: index + 1 })}
                      className="sticker-img"
                      loading="lazy"
                    />
                  </div>
                  <div className="card-actions">
                    <button
                      onClick={(e) => handleDownloadClick(stickerUrl, index, e)}
                      className="btn-secondary"
                      style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
                    >
                      <DownloadIcon /> {t('grid.downloadButton')}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* Modal Descargar Paquete ZIP */}
      {zipModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            {!zipProgress && <button className="modal-close" onClick={() => setZipModalOpen(false)}>✕</button>}
            <h2>{t('zipModal.title', { count: selectedCount })}</h2>

            {zipProgress ? (
              <div className="loading-state" style={{ background: 'none', border: 'none', padding: '20px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                  <ThinkingOrb state="working" size={64} theme="dark" />
                </div>
                <p>{t('zipModal.progressTitle')}</p>
                <small style={{ color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                  {t('zipModal.progressStatus', { current: zipProgress.current, total: zipProgress.total })}
                </small>
                <div className="progress-bar-wrapper">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${(zipProgress.current / zipProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                  {t('zipModal.formatSubtitle')}
                </p>
                
                <div className="modal-actions">
                  <button 
                    onClick={() => executeZipDownload('gif')} 
                    className="btn-primary" 
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <DownloadIcon /> {t('zipModal.downloadGifZip')}
                  </button>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '-4px', marginBottom: '8px' }}>
                    💡 {t('zipModal.gifNote')}
                  </small>

                  <button 
                    onClick={() => executeZipDownload('webp')} 
                    className="btn-secondary" 
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <DownloadIcon /> {t('zipModal.downloadWebpZip')}
                  </button>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '-4px' }}>
                    💡 {t('zipModal.webpNote')}
                  </small>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Descargar Sticker Individual */}
      {modalConfig && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setModalConfig(null)}>✕</button>
            <h2>{t('downloadModal.title')}</h2>
            
            <div className="modal-actions">
              {modalConfig.isAnimated ? (
                <>
                  <button 
                    onClick={() => executeAction('gif')} 
                    className="btn-primary" 
                    disabled={downloadingFormat !== null}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {downloadingFormat === 'gif' ? (
                      <>
                        <SpinnerIcon /> {t('downloadModal.processingGif')}
                      </>
                    ) : (
                      <>
                        <DownloadIcon /> {t('downloadModal.downloadGif')}
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => executeAction('webp')} 
                    className="btn-secondary" 
                    disabled={downloadingFormat !== null}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {downloadingFormat === 'webp' ? (
                      <>
                        <SpinnerIcon /> {t('downloadModal.processingWebp')}
                      </>
                    ) : (
                      <>
                        <DownloadIcon /> {t('downloadModal.downloadWebp')}
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => executeAction('webp')} 
                  className="btn-primary" 
                  disabled={downloadingFormat !== null}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {downloadingFormat === 'webp' ? (
                    <>
                      <SpinnerIcon /> {t('downloadModal.processingWebp')}
                    </>
                  ) : (
                    <>
                      <DownloadIcon /> {t('downloadModal.downloadWebp')}
                    </>
                  )}
                </button>
              )}
            </div>

            {modalConfig.isAnimated && (
              <div style={{
                background: 'rgba(0, 242, 254, 0.1)',
                border: '1px solid rgba(0, 242, 254, 0.3)',
                color: 'var(--accent-cyan)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center'
              }}>
                <InfoIcon /> 
                <span>{t('downloadModal.gifNote')} <strong>GIF</strong>.</span>
              </div>
            )}

            <div className="modal-tabs">
              <button className={activeTab === 'whatsapp' ? 'active' : ''} onClick={() => setActiveTab('whatsapp')}>{t('downloadModal.tabWhatsapp')}</button>
              <button className={activeTab === 'otras' ? 'active' : ''} onClick={() => setActiveTab('otras')}>{t('downloadModal.tabOtherApps')}</button>
            </div>
            
            <div className="modal-instructions">
              {activeTab === 'whatsapp' && (
                <div>
                  <p><strong>{t('downloadModal.whatsappInstructions.title')}</strong></p>
                  <ol>
                    {modalConfig.isAnimated ? (
                      <>
                        <li><Trans i18nKey="downloadModal.whatsappInstructions.animatedStep1">Descarga el sticker como <strong>GIF</strong>.</Trans></li>
                        <li>{t('downloadModal.whatsappInstructions.animatedStep2')}</li>
                        <li><Trans i18nKey="downloadModal.whatsappInstructions.animatedStep3">Ve a la sección de stickers y presiona <strong>Crear sticker</strong>.</Trans></li>
                        <li>{t('downloadModal.whatsappInstructions.animatedStep4')}</li>
                      </>
                    ) : (
                      <>
                        <li><Trans i18nKey="downloadModal.whatsappInstructions.staticStep1">Descarga el sticker como <strong>WebP</strong>.</Trans></li>
                        <li>{t('downloadModal.whatsappInstructions.staticStep2')}</li>
                        <li><Trans i18nKey="downloadModal.whatsappInstructions.staticStep3">Ve a la sección de stickers y presiona <strong>Crear sticker</strong>.</Trans></li>
                        <li>{t('downloadModal.whatsappInstructions.staticStep4')}</li>
                      </>
                    )}
                  </ol>
                </div>
              )}
              {activeTab === 'otras' && (
                <div>
                  <p><strong>{t('downloadModal.otherAppsInstructions.title')}</strong></p>
                  <ol>
                    {modalConfig.isAnimated ? (
                      <>
                        <li><Trans i18nKey="downloadModal.otherAppsInstructions.animatedStep1">Descarga el sticker como <strong>GIF</strong> o <strong>WebP</strong>.</Trans></li>
                        <li><Trans i18nKey="downloadModal.otherAppsInstructions.animatedStep2">Instala una aplicación como <strong>Sticker Maker</strong> o <strong>Sticker.ly</strong>.</Trans></li>
                        <li>{t('downloadModal.otherAppsInstructions.animatedStep3')}</li>
                        <li><Trans i18nKey="downloadModal.otherAppsInstructions.animatedStep4">Toca <strong>Añadir a WhatsApp</strong> para tenerlo listo en tu teclado.</Trans></li>
                      </>
                    ) : (
                      <>
                        <li><Trans i18nKey="downloadModal.otherAppsInstructions.staticStep1">Descarga el sticker como <strong>WebP</strong>.</Trans></li>
                        <li><Trans i18nKey="downloadModal.otherAppsInstructions.staticStep2">Instala una aplicación como <strong>Sticker Maker</strong> o <strong>Sticker.ly</strong>.</Trans></li>
                        <li>{t('downloadModal.otherAppsInstructions.staticStep3')}</li>
                        <li><Trans i18nKey="downloadModal.otherAppsInstructions.staticStep4">Toca <strong>Añadir a WhatsApp</strong> para tenerlo listo en tu teclado.</Trans></li>
                      </>
                    )}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Legal */}
      {legalModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setLegalModal(null)}>✕</button>
            <h2>{legalModal === 'terms' ? t('legalModal.termsTitle') : t('legalModal.privacyTitle')}</h2>
            <div className="legal-text">
              {legalModal === 'terms' ? (
                <>
                  <h3>{t('legalModal.terms.section1Title')}</h3>
                  <p>{t('legalModal.terms.section1Text')}</p>
                  <h3>{t('legalModal.terms.section2Title')}</h3>
                  <p>{t('legalModal.terms.section2Text')}</p>
                  <h3>{t('legalModal.terms.section3Title')}</h3>
                  <p>{t('legalModal.terms.section3Text')}</p>
                </>
              ) : (
                <>
                  <h3>{t('legalModal.privacy.section1Title')}</h3>
                  <p>{t('legalModal.privacy.section1Text')}</p>
                  <h3>{t('legalModal.privacy.section2Title')}</h3>
                  <p>{t('legalModal.privacy.section2Text')}</p>
                  <h3>{t('legalModal.privacy.section3Title')}</h3>
                  <p>{t('legalModal.privacy.section3Text')}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
        <div className="footer-links">
          <button className="footer-link" onClick={() => setLegalModal('terms')}>{t('footer.terms')}</button>
          <button className="footer-link" onClick={() => setLegalModal('privacy')}>{t('footer.privacy')}</button>
        </div>
      </footer>
    </div>
  );
}
