import React from 'react';

interface StickerCardProps {
  stickerUrl: string;
  proxyUrl: string;
  index: number;
  isSelected: boolean;
  onToggleSelect: (index: number) => void;
  onDownloadClick: (url: string, index: number, e: React.MouseEvent) => void;
  altText: string;
  downloadLabel: string;
  style?: React.CSSProperties;
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const DownloadSmallIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

export default function StickerCard({
  stickerUrl,
  proxyUrl,
  index,
  isSelected,
  onToggleSelect,
  onDownloadClick,
  altText,
  downloadLabel,
  style,
}: StickerCardProps) {
  return (
    <div
      className={`sticker-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onToggleSelect(index)}
      style={style}
    >
      <div className="checkbox-badge">
        {isSelected && <CheckIcon />}
      </div>

      <div className="sticker-img-wrapper">
        <img
          src={proxyUrl}
          alt={altText}
          className="sticker-img"
          loading="lazy"
        />
      </div>

      <div className="card-actions">
        <button
          onClick={(e) => onDownloadClick(stickerUrl, index, e)}
          className="btn-download-card"
        >
          <DownloadSmallIcon /> {downloadLabel}
        </button>
      </div>
    </div>
  );
}
