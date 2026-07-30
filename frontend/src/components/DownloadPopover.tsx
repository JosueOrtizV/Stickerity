import React, { useState, useEffect, useRef } from 'react';

interface DownloadPopoverProps {
  isAnimated?: boolean;
  onDownload: (format: 'webp' | 'gif') => void;
  onCheckFormat?: () => Promise<boolean>;
  downloadingFormat: 'webp' | 'gif' | null;
  triggerLabel: string;
  gifLabel: string;
  webpLabel: string;
  processingGifLabel: string;
  processingWebpLabel: string;
}

const DownloadSmallIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const SpinnerTiny = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinner-icon">
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

export default function DownloadPopover({
  isAnimated,
  onDownload,
  onCheckFormat,
  downloadingFormat,
  triggerLabel,
  gifLabel,
  webpLabel,
  processingGifLabel,
  processingWebpLabel,
}: DownloadPopoverProps) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checking || downloadingFormat !== null) return;

    if (isAnimated === false) {
      onDownload('webp');
      return;
    }

    if (isAnimated === true) {
      setOpen(prev => !prev);
      return;
    }

    // Format is unknown (undefined)
    if (onCheckFormat) {
      setChecking(true);
      try {
        const animResult = await onCheckFormat();
        if (!animResult) {
          onDownload('webp');
        } else {
          setOpen(true);
        }
      } catch (err) {
        console.error('Format check error:', err);
        onDownload('webp');
      } finally {
        setChecking(false);
      }
    } else {
      onDownload('webp');
    }
  };

  const handleOption = (format: 'webp' | 'gif') => {
    onDownload(format);
    setOpen(false);
  };

  const isLoading = checking || downloadingFormat !== null;

  return (
    <div className="download-popover-wrapper" ref={ref}>
      <button
        onClick={handleClick}
        className="btn-download-card"
        disabled={checking}
      >
        {isLoading ? <SpinnerTiny /> : <DownloadSmallIcon />}
        {checking
          ? '...'
          : downloadingFormat
          ? (downloadingFormat === 'gif' ? processingGifLabel : processingWebpLabel)
          : triggerLabel
        }
      </button>

      {open && isAnimated && (
        <div className="download-popover">
          <button
            className="popover-option"
            onClick={(e) => { e.stopPropagation(); handleOption('gif'); }}
            disabled={downloadingFormat !== null}
          >
            {downloadingFormat === 'gif' ? <SpinnerTiny /> : <DownloadSmallIcon />}
            {downloadingFormat === 'gif' ? processingGifLabel : gifLabel}
          </button>
          <button
            className="popover-option"
            onClick={(e) => { e.stopPropagation(); handleOption('webp'); }}
            disabled={downloadingFormat !== null}
          >
            {downloadingFormat === 'webp' ? <SpinnerTiny /> : <DownloadSmallIcon />}
            {downloadingFormat === 'webp' ? processingWebpLabel : webpLabel}
          </button>
        </div>
      )}
    </div>
  );
}
