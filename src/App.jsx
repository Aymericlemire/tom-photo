import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import SiteLayout from './components/SiteLayout.jsx';
import AboutPage from './pages/AboutPage.jsx';
import ContactPage from './pages/ContactPage.jsx';
import ExpertisePage from './pages/ExpertisePage.jsx';
import GalleryPage from './pages/GalleryPage.jsx';
import HomePage from './pages/HomePage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import SiteCanvasPage from './components/SiteCanvasPage.jsx';

const ContentContext = createContext(null);

export const useSiteContent = () => useContext(ContentContext);

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);
  return null;
}

function NotFoundPage() {
  return (
    <section className="empty-state">
      <span className="eyebrow eyebrow--dark">Erreur 404</span>
      <h1>Cette page n’existe pas.</h1>
      <Link className="button button--dark" to="/">Retour à l’accueil</Link>
    </section>
  );
}

export default function App() {
  const [content, setContent] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api('/api/content')
      .then(setContent)
      .catch((error) => setLoadError(error.message));
  }, []);

  useEffect(() => {
    if (content) document.title = `${content.site.brand} — Photographe & vidéaste`;
  }, [content]);

  if (!content && loadError) {
    return (
      <main className="empty-state">
        <h1>Le site ne peut pas charger son contenu.</h1>
        <p>{loadError}</p>
        <p>Vérifiez que le serveur de l’application Vite et Express est démarré.</p>
      </main>
    );
  }
  if (!content) return <main className="loading-state" aria-live="polite">Chargement du site…</main>;

  return (
    <ContentContext.Provider value={content}>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<SiteLayout content={content} />}>
            <Route index element={<HomePage content={content} />} />
            <Route path="galerie" element={<GalleryPage gallery={content.gallery} />} />
            <Route path="expertises" element={content.pageCanvases.expertise?.enabled
              ? <SiteCanvasPage canvas={content.pageCanvases.expertise} label="Page Expertises" />
              : <ExpertisePage expertise={content.expertise} />} />
            <Route path="tarifs" element={content.pageCanvases.pricing?.enabled
              ? <SiteCanvasPage canvas={content.pageCanvases.pricing} label="Page Tarifs" />
              : <PricingPage pricing={content.pricing} />} />
            <Route path="qui-suis-je" element={content.pageCanvases.about?.enabled
              ? <SiteCanvasPage canvas={content.pageCanvases.about} label="Page Qui suis-je" />
              : <AboutPage about={content.about} gallery={content.gallery} />} />
            <Route path="contact" element={<ContactPage contact={content.contact} site={content.site} />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </BrowserRouter>
    </ContentContext.Provider>
  );
}
