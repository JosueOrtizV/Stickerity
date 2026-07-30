import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function HelpPage() {
  const { t } = useTranslation();

  return (
    <div className="legal-card" style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div className="legal-header">
        <h1>{t('helpPage.title')}</h1>
        <Link to="/" className="back-link">
          ← {t('header.title')}
        </Link>
      </div>
      <p style={{ color: 'var(--color-ink-muted)', marginBottom: 'var(--space-6)' }}>
        {t('helpPage.subtitle')}
      </p>

      <div className="legal-text">
        <div style={{
          background: 'var(--color-surface-raised)',
          padding: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--space-6)',
          border: '1px solid var(--color-border)'
        }}>
          <h3 style={{ marginTop: 0, color: 'var(--color-accent)' }}>
            💬 {t('helpPage.whatsappTitle')}
          </h3>
          <ol style={{ paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <li>{t('helpPage.whatsappStep1')}</li>
            <li>{t('helpPage.whatsappStep2')}</li>
            <li>{t('helpPage.whatsappStep3')}</li>
            <li>{t('helpPage.whatsappStep4')}</li>
          </ol>
        </div>

        <div style={{
          background: 'var(--color-surface-raised)',
          padding: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)'
        }}>
          <h3 style={{ marginTop: 0, color: 'var(--color-teal)' }}>
            📱 {t('helpPage.otherAppsTitle')}
          </h3>
          <ol style={{ paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <li>{t('helpPage.otherAppsStep1')}</li>
            <li>{t('helpPage.otherAppsStep2')}</li>
            <li>{t('helpPage.otherAppsStep3')}</li>
            <li>{t('helpPage.otherAppsStep4')}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
