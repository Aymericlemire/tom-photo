import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { configuredSocialLinks } from '../lib/social-links.js';

export default function Header({ site, socialLinks }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const visibleSocialLinks = configuredSocialLinks(socialLinks);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.body.classList.toggle('menu-open', open);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('menu-open');
    };
  }, [open]);

  return (
    <header className="site-header">
      <Link className="brand" to="/" aria-label={`${site.brand}, accueil`}>
        <img src={site.logo} alt="" />
      </Link>
      <button
        className={`menu-toggle${open ? ' is-open' : ''}`}
        type="button"
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={open}
        aria-controls="main-navigation"
        onClick={() => setOpen((previous) => !previous)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav
        className={`site-nav${open ? ' is-open' : ''}`}
        id="main-navigation"
        aria-label="Navigation principale"
      >
        {site.navigation.map(({ label, path }) => (
          <NavLink
            end={path === '/'}
            key={path}
            to={path}
            className={({ isActive }) => `site-nav__link${path === '/contact' ? ' site-nav__link--contact' : ''}${isActive ? ' is-active' : ''}`}
          >
            {label}
          </NavLink>
        ))}
        {visibleSocialLinks.length > 0 && (
          <div className="site-nav__socials" aria-label="Réseaux sociaux">
            {visibleSocialLinks.map((item) => {
              const network = item.label.toLowerCase();
              return (
                <a
                  className="site-nav__social-link"
                  href={item.url}
                  key={item.label}
                  target="_blank"
                  rel="noreferrer"
                >
                  {network === 'instagram' ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" /></svg>
                  ) : network === 'facebook' ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.2V13H10v8h3.4z" /></svg>
                  ) : <span className="site-nav__social-initial">{item.label.slice(0, 1)}</span>}
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>
        )}
        <NavLink
          end
          className="site-nav__admin-link"
          to="/admin"
        >
          Espace administrateur
        </NavLink>
      </nav>
    </header>
  );
}
