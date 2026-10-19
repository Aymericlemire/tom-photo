import { Link } from 'react-router-dom';

export default function SiteCanvasPage({ canvas, label }) {
  const height = canvas.height || 1200;

  return (
    <section
      className="site-canvas-page"
      aria-label={label}
      style={{ '--site-canvas-height': height, backgroundColor: canvas.background }}
    >
      {canvas.elements.map((element) => {
        const style = {
          left: `${element.x / 12}%`,
          top: `${element.y / height * 100}%`,
          width: `${element.width / 12}%`,
          height: `${element.height / height * 100}%`,
          color: element.color,
          backgroundColor: element.background || 'transparent',
          fontSize: `clamp(10px, ${element.fontSize / 12}cqw, ${element.fontSize}px)`
        };

        if (element.type === 'image') {
          return <img key={element.id} className="site-canvas-page__element site-canvas-page__image" style={style} src={element.src} alt={element.content} />;
        }
        if (element.type === 'button') {
          return <Link key={element.id} className="site-canvas-page__element site-canvas-page__button" style={style} to={element.href}>{element.content}</Link>;
        }
        if (element.type === 'heading') {
          return <h1 key={element.id} className="site-canvas-page__element site-canvas-page__heading" style={style}>{element.content}</h1>;
        }
        return <p key={element.id} className="site-canvas-page__element site-canvas-page__text" style={style}>{element.content}</p>;
      })}
    </section>
  );
}
