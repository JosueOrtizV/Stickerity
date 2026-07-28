import React, { useState } from 'react';
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
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickers, setStickers] = useState<string[]>([]);
  const [modalConfig, setModalConfig] = useState<{ url: string, index: number, isAnimated: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'otras'>('whatsapp');
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

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
        throw new Error(data.error || 'Error al extraer los stickers');
      }

      if (data.stickers && data.stickers.length > 0) {
        setStickers(data.stickers);
      } else {
        setError('No se encontraron stickers ni imágenes compatibles en el enlace proporcionado.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
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
      alert('Error procesando sticker');
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="logo">Stickerity</h1>
        <p className="subtitle">Extrae stickers de cualquier enlace y envíalos directo a WhatsApp</p>
      </header>

      <form onSubmit={handleExtract} className="search-box">
        <input
          type="url"
          className="search-input"
          placeholder="Pega cualquier enlace con contenido o imágenes aquí..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" className="btn-extract" disabled={loading}>
          {loading ? (
            <>
              <SpinnerIcon />
              Extrayendo...
            </>
          ) : (
            'Obtener Stickers'
          )}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Analizando el enlace y procesando recursos multimedias...</p>
          <small style={{ color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
            Esto puede tomar entre 5 a 15 segundos dependiendo del origen.
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
                  alt={`Sticker ${index + 1}`}
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
                  <DownloadIcon /> Descargar
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
            <h2>Descargar Sticker</h2>
            
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
                        <SpinnerIcon /> Procesando GIF...
                      </>
                    ) : (
                      <>
                        <DownloadIcon /> Descargar GIF
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
                        <SpinnerIcon /> Procesando WebP...
                      </>
                    ) : (
                      <>
                        <DownloadIcon /> Descargar WebP
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
                      <SpinnerIcon /> Procesando WebP...
                    </>
                  ) : (
                    <>
                      <DownloadIcon /> Descargar WebP
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
                <span><strong>Nota:</strong> Para conservar la animación al crearlo en WhatsApp, descárgalo como <strong>GIF</strong>.</span>
              </div>
            )}

            <div className="modal-tabs">
              <button className={activeTab === 'whatsapp' ? 'active' : ''} onClick={() => setActiveTab('whatsapp')}>Vía WhatsApp</button>
              <button className={activeTab === 'otras' ? 'active' : ''} onClick={() => setActiveTab('otras')}>Vía Otras Apps</button>
            </div>
            
            <div className="modal-instructions">
              {activeTab === 'whatsapp' && (
                <div>
                  <p><strong>Instrucciones para WhatsApp:</strong></p>
                  <ol>
                    {modalConfig.isAnimated ? (
                      <>
                        <li>Descarga el sticker como <strong>GIF</strong>.</li>
                        <li>Abre WhatsApp e ingresa a cualquier chat.</li>
                        <li>Ve a la sección de stickers y presiona <strong>Crear sticker</strong>.</li>
                        <li>Selecciona el archivo GIF descargado y guárdalo.</li>
                      </>
                    ) : (
                      <>
                        <li>Descarga el sticker como <strong>WebP</strong>.</li>
                        <li>Abre WhatsApp e ingresa a cualquier chat.</li>
                        <li>Ve a la sección de stickers y presiona <strong>Crear sticker</strong>.</li>
                        <li>Selecciona el archivo WebP descargado y guárdalo.</li>
                      </>
                    )}
                  </ol>
                </div>
              )}
              {activeTab === 'otras' && (
                <div>
                  <p><strong>Usar Sticker Maker o Sticker.ly:</strong></p>
                  <ol>
                    {modalConfig.isAnimated ? (
                      <>
                        <li>Descarga el sticker como <strong>GIF</strong> o <strong>WebP</strong>.</li>
                        <li>Instala una aplicación como <strong>Sticker Maker</strong> o <strong>Sticker.ly</strong>.</li>
                        <li>Abre la app, crea un paquete de stickers y selecciona el archivo descargado.</li>
                        <li>Toca <strong>Añadir a WhatsApp</strong> para tenerlo listo en tu teclado.</li>
                      </>
                    ) : (
                      <>
                        <li>Descarga el sticker como <strong>WebP</strong>.</li>
                        <li>Instala una aplicación como <strong>Sticker Maker</strong> o <strong>Sticker.ly</strong>.</li>
                        <li>Abre la app, crea un paquete de stickers y selecciona el archivo descargado.</li>
                        <li>Toca <strong>Añadir a WhatsApp</strong> para tenerlo listo en tu teclado.</li>
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
            <h2>{legalModal === 'terms' ? 'Términos de Servicio' : 'Política de Privacidad'}</h2>
            <div className="legal-text">
              {legalModal === 'terms' ? (
                <>
                  <h3>1. Uso de la herramienta</h3>
                  <p>Stickerity es una herramienta de utilidad en línea diseñada para procesar y adaptar imágenes de enlaces públicos a formatos compatibles con aplicaciones de mensajería (como WhatsApp).</p>
                  <h3>2. Exención de responsabilidad de propiedad</h3>
                  <p>Stickerity no almacena, aloja, vende ni reclama la propiedad intelectual de ninguna de las imágenes procesadas. El usuario es el único responsable de la adquisición y uso que le dé a los contenidos que extrae mediante enlaces públicos.</p>
                  <h3>3. Marcas de terceros</h3>
                  <p>WhatsApp y otras marcas mencionadas pertenecen a sus respectivos dueños y no están afiliadas a esta plataforma.</p>
                </>
              ) : (
                <>
                  <h3>1. Información recolectada</h3>
                  <p>Stickerity no requiere registro ni almacena datos personales de los usuarios.</p>
                  <h3>2. Procesamiento en tránsito</h3>
                  <p>Los enlaces ingresados por el usuario son procesados temporalmente en memoria para convertir los formatos de imagen y son descartados inmediatamente después.</p>
                  <h3>3. Cookies</h3>
                  <p>Utilizamos almacenamiento local básico únicamente para la caché técnica y el rendimiento de la aplicación.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <p>© {new Date().getFullYear()} Stickerity — Herramienta de utilidad libre</p>
        <div className="footer-links">
          <button className="footer-link" onClick={() => setLegalModal('terms')}>Términos de Servicio</button>
          <button className="footer-link" onClick={() => setLegalModal('privacy')}>Política de Privacidad</button>
        </div>
      </footer>
    </div>
  );
}
