import React, { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
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

export default function App() {
  const { t, i18n } = useTranslation();

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickers, setStickers] = useState<string[]>([]);
  const [modalConfig, setModalConfig] = useState<{ url: string, index: number, isAnimated: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'otras'>('whatsapp');
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

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

    try {
      const response = await fetch(`${getApiBaseUrl()}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('errors.extraction_failed'));
      }

      if (data.stickers && data.stickers.length > 0) {
        setStickers(data.stickers);
      } else {
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

  const [downloadingFormat, setDownloadingFormat] = useState<'webp' | 'gif' | null>(null);

  const handleDownloadClick = (rawUrl: string, index: number) => {
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

  const currentLang = i18n.language || 'es';

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
              <SpinnerIcon />
              {t('search.loading')}
            </>
          ) : (
            t('search.button')
          )}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>{t('loadingState.title')}</p>
          <small style={{ color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
            {t('loadingState.subtext')}
          </small>
        </div>
      )}

      {!loading && stickers.length > 0 && (
        <section className="grid">
          {stickers.map((stickerUrl, index) => (
            <div key={index} className="sticker-card">
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
                  onClick={() => handleDownloadClick(stickerUrl, index)}
                  className="btn-primary"
                  style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <DownloadIcon /> {t('grid.downloadButton')}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Modal Descargar Sticker */}
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
