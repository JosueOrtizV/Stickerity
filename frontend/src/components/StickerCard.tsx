import React from 'react';

interface StickerCardProps {
  stickerUrl: string;
  proxyUrl: string;
  index: number;
  isSelected: boolean;
  onToggleSelect: (index: number) => void;
  altText: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export default function StickerCard({
  proxyUrl,
  index,
  isSelected,
  onToggleSelect,
  altText,
  style,
  children,
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
        {children}
      </div>
    </div>
  );
}
