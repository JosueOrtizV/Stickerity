import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className="legal-card">
      <div className="legal-header">
        <h1>{t('legalModal.termsTitle')}</h1>
        <Link to="/" className="back-link">
          ← {t('header.title')}
        </Link>
      </div>

      <div className="legal-text">
        <h3>{t('legalModal.terms.section1Title')}</h3>
        <p>{t('legalModal.terms.section1Text')}</p>

        <h3>{t('legalModal.terms.section2Title')}</h3>
        <p>{t('legalModal.terms.section2Text')}</p>

        <h3>{t('legalModal.terms.section3Title')}</h3>
        <p>{t('legalModal.terms.section3Text')}</p>
      </div>
    </div>
  );
}
