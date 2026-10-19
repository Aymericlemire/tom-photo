import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Testimonials from '../components/Testimonials.jsx';
import { galleryCategoryForHomeCard } from '../lib/gallery-links.js';

export default function HomePage({ content }) {
  const { home, site, gallery } = content;
  const [reduceMotion, setReduceMotion] = useState(() => (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReduceMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  return (
    <>
      <section className="home-hero" style={{ '--hero-image': `url("${home.heroImage}")` }}>
        {home.heroVideo && !reduceMotion && (
          <video
            className="home-hero__video"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
            poster={home.heroImage}
            onError={(event) => { event.currentTarget.hidden = true; }}
          >
            <source src={home.heroVideo} type="video/mp4" />
          </video>
        )}
        <div className="home-hero__shade" />
        {home.canvas?.enabled ? (
          <div className="home-canvas" aria-label="Bannière d’accueil">
            {home.canvas.elements.map((element) => {
              const style = {
                left: `${element.x / 12}%`,
                top: `${element.y / 6.75}%`,
                width: `${element.width / 12}%`,
                height: `${element.height / 6.75}%`,
                color: element.color,
                backgroundColor: element.background || 'transparent',
                fontSize: `clamp(10px, ${element.fontSize / 12}cqw, ${element.fontSize}px)`
              };
              if (element.type === 'image') {
                return <img key={element.id} className="home-canvas__element home-canvas__image" style={style} src={element.src} alt={element.content} />;
              }
              if (element.type === 'button') {
                return <Link key={element.id} className="home-canvas__element home-canvas__button" style={style} to={element.href}>{element.content}</Link>;
              }
              if (element.type === 'heading') {
                return <h1 key={element.id} className="home-canvas__element home-canvas__heading" style={style}>{element.content}</h1>;
              }
              return <p key={element.id} className="home-canvas__element home-canvas__text" style={style}>{element.content}</p>;
            })}
          </div>
        ) : (
          <div className="home-hero__content">
            <span className="eyebrow">{home.eyebrow}</span>
            <h1>{home.title}</h1>
            <p>{home.subtitle}</p>
            <div className="hero-actions">
              <Link className="button button--light" to="/galerie">{home.galleryAction}</Link>
              <Link className="button button--glass" to="/tarifs">{home.pricingAction}</Link>
            </div>
            <span className="hero-location">{site.city} · Photographie & vidéo</span>
          </div>
        )}
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span className="eyebrow eyebrow--dark">{home.sectionEyebrow}</span>
          <h2>{home.sectionTitle}</h2>
          <p>{home.sectionIntro}</p>
        </div>
        <div className="photo-grid">
          {home.cards.map((item, index) => {
            const category = galleryCategoryForHomeCard(item, gallery);
            const destination = category ? `/galerie?category=${encodeURIComponent(category)}` : '/galerie';
            return (
              <Link
                className={`home-photo${index === home.cards.length - 1 ? ' home-photo--wide' : ''}`}
                to={destination}
                key={`${item.title}-${index}`}
              >
                <img src={item.image} alt={item.title} loading="lazy" />
                <span className="home-photo__shade" />
                <span className="home-photo__label">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ⭐ Section "Vos retours" (avis clients) — contenu éditable dans l'admin */}
      <Testimonials home={home} />

      <section className="story-band">
        <img src={site.logo} alt="" />
        <p>{site.tagline}</p>
        <Link className="button button--light" to="/contact">{home.storyAction}</Link>
      </section>
    </>
  );
}
