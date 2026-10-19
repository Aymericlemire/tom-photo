import PageIntro from '../components/PageIntro.jsx';
import PhotoCard from '../components/PhotoCard.jsx';

export default function ExpertisePage({ expertise }) {
  return (
    <>
      <PageIntro eyebrow={expertise.eyebrow} title={expertise.title} intro={expertise.intro} />
      <section className="section-wrap section-wrap--top">
        <div className="content-grid">
          {expertise.cards.map((item, index) => (
            <PhotoCard key={`${item.title}-${index}`} item={item} action={expertise.cardAction} actionTo="/galerie" />
          ))}
        </div>
      </section>
    </>
  );
}
