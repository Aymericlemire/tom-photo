export default function PageIntro({ eyebrow, title, intro }) {
  return (
    <section className="page-intro">
      <div className="page-intro__inner">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
    </section>
  );
}
