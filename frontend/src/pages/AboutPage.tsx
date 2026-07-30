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
        <h3>{t('aboutPage.whatIsTitle')}</h3>
        <p>{t('aboutPage.whatIsText')}</p>

        <h3>{t('aboutPage.whyTitle')}</h3>
        <p>{t('aboutPage.whyText')}</p>

        <h3>{t('aboutPage.privacyTitle')}</h3>
        <p>{t('aboutPage.privacyText')}</p>
      </div>
    </div>
  );
}
