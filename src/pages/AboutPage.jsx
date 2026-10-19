import { useEffect, useRef, useState } from 'react';
import PageIntro from '../components/PageIntro.jsx';

export default function AboutPage({ about, gallery }) {
  const galleryCards = gallery?.cards ?? [];
  const slides = galleryCards.length
    ? galleryCards
    : about?.image
      ? [{ title: 'Tom Photo', image: about.image, description: '' }]
      : [];
  const trackRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  function goToSlide(index) {
    const track = trackRef.current;
    if (!track || !slides.length) return;
    const nextIndex = (index + slides.length) % slides.length;
    const slide = track.children[nextIndex];
    if (!slide) return;
    setActiveSlide(nextIndex);
    track.scrollTo({
      left: nextIndex * track.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  useEffect(() => {
    if (slides.length < 2 || isPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') goToSlide(activeSlide + 1);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeSlide, isPaused, slides.length]);

  function updateActiveSlide() {
    const track = trackRef.current;
    if (!track?.clientWidth || !slides.length) return;
    setActiveSlide(Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  }

  return (
    <>
      <PageIntro eyebrow={about.intro} title={about.title} />
      <section className="section-wrap about-layout">
        <div
          className="about-carousel"
          role="region"
          aria-roledescription="carrousel"
          aria-label="Galerie photo de Tom Photo"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onFocus={() => setIsPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false);
          }}
        >
          <div className="about-carousel__track" ref={trackRef} onScroll={updateActiveSlide}>
            {slides.map((item, index) => (
              <figure
                className="about-carousel__slide"
                key={`${item.title}-${item.image}-${index}`}
                aria-roledescription="diapositive"
                aria-label={`${index + 1} sur ${slides.length}`}
              >
                <img src={item.image} alt={item.title} loading={index === 0 ? 'eager' : 'lazy'} />
                <figcaption>
                  <strong>{item.title}</strong>
                  {item.description && <span>{item.description}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <div className="about-copy">
          <span className="eyebrow eyebrow--dark">Enchanté, moi c’est Tom</span>
          <h2>{about.sectionTitle}</h2>
          {about.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      </section>
    </>
  );
}
