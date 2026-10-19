import { Link } from 'react-router-dom';

export default function PhotoCard({ item, action, actionTo = '/contact', price }) {
  return (
    <article className="content-card">
      <img className="content-card__image" src={item.image} alt={item.title} loading="lazy" />
      <div className="content-card__body">
        {item.category && <span className="content-card__category">{item.category}</span>}
        <h2>{item.title}</h2>
        {item.description && <p>{item.description}</p>}
        {item.details && <p className="card-meta">{item.details}</p>}
        {price && <p className="card-price">{price}</p>}
        {action && <Link className="button button--outline" to={actionTo}>{action}</Link>}
      </div>
    </article>
  );
}

