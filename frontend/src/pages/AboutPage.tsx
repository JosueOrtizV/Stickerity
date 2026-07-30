import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="legal-card" style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div className="legal-header">
        <h1>{t('aboutPage.title')}</h1>
        <Link to="/" className="back-link">
          ← {t('header.title')}
        </Link>
      </div>
      <p style={{ color: 'var(--color-ink-muted)', marginBottom: 'var(--space-6)' }}>
        {t('aboutPage.subtitle')}
      </p>

      <div className="legal-text">
        <h2 style={{ marginTop: 0, color: 'var(--color-ink)' }}>
          {t('aboutPage.whatIsTitle')}
        </h2>
        <p>
          {t('aboutPage.whatIsText')}
        </p>

        <h2 style={{ color: 'var(--color-ink)' }}>
          {t('aboutPage.whyTitle')}
        </h2>
        <p>
          {t('aboutPage.whyText')}
        </p>

        <h2 style={{ color: 'var(--color-ink)' }}>
          {t('aboutPage.privacyTitle')}
        </h2>
        <p>
          {t('aboutPage.privacyText')}
        </p>
      </div>
    </div>
  );
}
