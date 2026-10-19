import { Link } from 'react-router-dom';
import { configuredSocialLinks } from '../lib/social-links.js';

export default function Footer({ site, footer, navigation }) {
  const socialLinks = configuredSocialLinks(footer.socialLinks);

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-about">
          <img src={site.logo} alt={site.brand} />
          <p>{footer.about}</p>
          <p>{site.tagline}</p>
        </div>
        <div>
          <h2>{footer.navigationTitle}</h2>
          <ul className="footer-links">
            {navigation.map(({ label, path }) => (
              <li key={path}><Link to={path}>{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h2>{footer.contactTitle}</h2>
          <a href={`mailto:${site.email}`}>{site.email}</a>
          {site.phone && <p>{site.phone}</p>}
          <p>{site.city}</p>
          {socialLinks.length > 0 && (
            <div className="social-links">
              {socialLinks.map((item) => (
                <a href={item.url} key={item.label} target="_blank" rel="noreferrer">{item.label}</a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} {site.brand} — Tous droits réservés</span>
        <span>{footer.locations}</span>
        <Link className="footer-admin-link" to="/admin">{footer.adminLabel}</Link>
      </div>
    </footer>
  );
}
