// Testimonials.jsx
// -----------------------------------------------------------------------------
// Section "Vos retours" (avis clients) affichée en bas de la page d'accueil.
// Le contenu (les avis) est éditable depuis l'espace admin, section "Accueil".
// On reçoit tout l'objet "home" et on lit ses champs liés aux témoignages.
// -----------------------------------------------------------------------------

export default function Testimonials({ home }) {
  // Si aucun avis n'est défini, on n'affiche pas la section du tout.
  if (!home.testimonials?.length) return null;

  return (
    <section className="section-wrap testimonials">
      {/* Titre + accroche de la section */}
      <div className="section-heading">
        <span className="eyebrow eyebrow--dark">{home.testimonialsEyebrow}</span>
        <h2>{home.testimonialsTitle}</h2>
      </div>

      {/* La liste des avis, un par carte */}
      <div className="testimonial-grid">
        {home.testimonials.map((testimonial, index) => (
          <figure className="testimonial" key={`${testimonial.name}-${index}`}>
            {/* Grand guillemet décoratif */}
            <span className="testimonial__quote" aria-hidden="true">“</span>
            {/* Le message de l'avis */}
            <blockquote>{testimonial.message}</blockquote>
            {/* Nom + contexte (ex. "Mariage à Niort") */}
            <figcaption>
              <strong>{testimonial.name}</strong>
              <span>{testimonial.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

