import { Link } from 'react-router-dom';
import PageIntro from '../components/PageIntro.jsx';
import PhotoCard from '../components/PhotoCard.jsx';

export default function PricingPage({ pricing }) {
  return (
    <>
      <PageIntro eyebrow={pricing.eyebrow} title={pricing.title} intro={pricing.intro} />
      <section className="section-wrap section-wrap--top">
        <div className="content-grid">
          {pricing.cards.map((item, index) => (
            <PhotoCard key={`${item.title}-${index}`} item={item} price={item.price} action={pricing.cardAction} />
          ))}
        </div>
      </section>
      <section className="section-wrap wedding-section">
        <div className="section-heading">
          <span className="eyebrow eyebrow--dark">{pricing.weddingEyebrow}</span>
          <h2>{pricing.weddingTitle}</h2>
        </div>
        <div className="wedding-grid">
          {pricing.weddings.map((item, index) => (
            <article className="wedding-card" key={`${item.title}-${index}`}>
              <h3>{item.title}</h3>
              <strong>{item.price}</strong>
              <p>{item.description}</p>
              <Link className="button button--outline" to="/contact">{pricing.weddingAction}</Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
