import { Outlet } from 'react-router-dom';
import Footer from './Footer.jsx';
import Header from './Header.jsx';

export default function SiteLayout({ content }) {
  return (
    <>
      <a className="skip-link" href="#main-content">Aller au contenu</a>
      <Header site={content.site} socialLinks={content.footer.socialLinks} />
      <main id="main-content"><Outlet /></main>
      <Footer site={content.site} footer={content.footer} navigation={content.site.navigation} />
    </>
  );
}
