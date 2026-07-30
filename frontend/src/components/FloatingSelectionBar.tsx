interface FloatingSelectionBarProps {
  selectedCount: number;
  totalCount: number;
  onDeselectAll: () => void;
  onSelectAll: () => void;
  onDownloadZip: () => void;
  isCheckingFormat: boolean;
  selectAllLabel: string;
  downloadLabel: string;
  countLabel: string;
  processingLabel: string;
}

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const SpinnerSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinner-icon">
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

export default function FloatingSelectionBar({
  selectedCount,
  totalCount,
  onDeselectAll,
  onSelectAll,
  onDownloadZip,
  isCheckingFormat,
  selectAllLabel,
  downloadLabel,
  countLabel,
  processingLabel,
}: FloatingSelectionBarProps) {
  if (selectedCount === 0) return null;

  const allSelected = selectedCount === totalCount;

  return (
    <div className="floating-bar">
      <button
        className="floating-bar-dismiss"
        onClick={onDeselectAll}
        aria-label="Deselect all"
      >
        <CloseIcon />
      </button>

      <span className="floating-bar-count">{countLabel}</span>

      <div className="floating-bar-actions">
        {!allSelected && (
          <button className="btn-float-select-all" onClick={onSelectAll}>
            {selectAllLabel}
          </button>
        )}
        <button
          className="btn-float-action"
          onClick={onDownloadZip}
          disabled={isCheckingFormat}
        >
          {isCheckingFormat ? <SpinnerSmall /> : <DownloadIcon />}
          {isCheckingFormat ? processingLabel : downloadLabel}
        </button>
      </div>
    </div>
  );
}
