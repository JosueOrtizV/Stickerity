import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <div className="legal-card">
      <div className="legal-header">
        <h1>{t('legalModal.privacyTitle')}</h1>
        <Link to="/" className="back-link">
          ← {t('header.title')}
        </Link>
      </div>

      <div className="legal-text">
        <h3>{t('legalModal.privacy.section1Title')}</h3>
        <p>{t('legalModal.privacy.section1Text')}</p>

        <h3>{t('legalModal.privacy.section2Title')}</h3>
        <p>{t('legalModal.privacy.section2Text')}</p>

        <h3>{t('legalModal.privacy.section3Title')}</h3>
        <p>{t('legalModal.privacy.section3Text')}</p>

        <h3>{t('legalModal.privacy.section4Title')}</h3>
        <p>{t('legalModal.privacy.section4Text')}</p>

        <h3>{t('legalModal.privacy.section5Title')}</h3>
        <p>{t('legalModal.privacy.section5Text')}</p>
      </div>
    </div>
  );
}
