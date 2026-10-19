import { useRef, useState } from 'react';
import { api } from '../api.js';
import Footer from './Footer.jsx';
import Header from './Header.jsx';
import SiteCanvasPage from './SiteCanvasPage.jsx';
import HomePage from '../pages/HomePage.jsx';

const WIDTH = 1200;
const pages = [
  { key: 'home', label: 'Accueil', path: '/' },
  { key: 'expertise', label: 'Expertises', path: '/expertises' },
  { key: 'pricing', label: 'Tarifs', path: '/tarifs' },
  { key: 'about', label: 'À propos', path: '/qui-suis-je' }
];
const makeId = () => `bloc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const baseElement = (id, type, x, y, width, height, content, values = {}) => ({
  id, type, x, y, width, height, content, href: '/contact', src: '/images/portrait.jpg',
  fontSize: 28, color: '#342a20', background: '', ...values
});

function starterCanvas(pageKey, content) {
  const elements = [];
  const add = (...args) => elements.push(baseElement(...args));

  if (pageKey === 'home') {
    const { home, site } = content;
    const starter = [
      ['accroche', 'text', 140, 190, 920, 50, home.eyebrow, 25],
      ['titre', 'heading', 140, 245, 920, 120, home.title, 78],
      ['sous-titre', 'text', 140, 365, 920, 55, home.subtitle, 32],
      ['bouton-galerie', 'button', 140, 445, 260, 62, home.galleryAction, 18, '/galerie', '#8c6b3f'],
      ['bouton-tarifs', 'button', 420, 445, 240, 62, home.pricingAction, 18, '/tarifs', '#4d4032'],
      ['lieu', 'text', 140, 555, 920, 38, `${site.city} · Photographie & vidéo`, 18]
    ];
    return {
      enabled: true,
      elements: starter.map(([id, type, x, y, width, height, text, fontSize, href, background]) =>
        baseElement(id, type, x, y, width, height, text, { fontSize, href: href || '/contact', background: background || '', color: '#ffffff' }))
    };
  }

  if (pageKey === 'expertise') {
    const page = content.expertise;
    add('page-eyebrow', 'text', 90, 70, 1020, 38, page.eyebrow, { fontSize: 20 });
    add('page-title', 'heading', 90, 115, 1020, 90, page.title, { fontSize: 62 });
    add('page-intro', 'text', 90, 210, 1020, 76, page.intro, { fontSize: 22 });
    page.cards.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 90 + col * 530;
      const y = 340 + row * 350;
      add(`expertise-${index}-image`, 'image', x, y, 490, 230, item.title, { src: item.image });
      add(`expertise-${index}-title`, 'heading', x, y + 236, 490, 46, item.title, { fontSize: 30 });
      add(`expertise-${index}-description`, 'text', x, y + 282, 490, 56, item.description, { fontSize: 18 });
    });
    return { enabled: true, height: Math.max(675, 370 + Math.ceil(page.cards.length / 2) * 350), background: '#f7f4ef', elements };
  }

  if (pageKey === 'pricing') {
    const page = content.pricing;
    add('page-eyebrow', 'text', 90, 62, 1020, 38, page.eyebrow, { fontSize: 20 });
    add('page-title', 'heading', 90, 106, 1020, 90, page.title, { fontSize: 62 });
    add('page-intro', 'text', 90, 200, 1020, 76, page.intro, { fontSize: 22 });
    page.cards.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 90 + col * 530;
      const y = 310 + row * 335;
      add(`price-${index}-image`, 'image', x, y, 490, 190, item.title, { src: item.image });
      add(`price-${index}-title`, 'heading', x, y + 194, 490, 42, item.title, { fontSize: 28 });
      add(`price-${index}-details`, 'text', x, y + 237, 290, 42, item.details, { fontSize: 17 });
      add(`price-${index}-amount`, 'text', x + 295, y + 237, 195, 42, item.price, { fontSize: 18 });
    });
    const weddingY = 340 + Math.ceil(page.cards.length / 2) * 335;
    add('wedding-eyebrow', 'text', 90, weddingY, 1020, 34, page.weddingEyebrow, { fontSize: 18 });
    add('wedding-title', 'heading', 90, weddingY + 36, 1020, 65, page.weddingTitle, { fontSize: 46 });
    page.weddings.forEach((item, index) => {
      const x = 90 + index * 350;
      add(`wedding-${index}-title`, 'heading', x, weddingY + 120, 320, 45, item.title, { fontSize: 26 });
      add(`wedding-${index}-price`, 'text', x, weddingY + 170, 320, 40, item.price, { fontSize: 21 });
      add(`wedding-${index}-description`, 'text', x, weddingY + 215, 320, 72, item.description, { fontSize: 17 });
    });
    return { enabled: true, height: Math.max(675, weddingY + 340), background: '#f7f4ef', elements };
  }

  const page = content.about;
  add('about-eyebrow', 'text', 90, 70, 1020, 38, page.intro, { fontSize: 20 });
  add('about-title', 'heading', 90, 115, 1020, 112, page.title, { fontSize: 58 });
  add('about-image', 'image', 90, 275, 430, 470, 'Portrait de Tom', { src: page.image });
  add('about-section-title', 'heading', 570, 285, 540, 100, page.sectionTitle, { fontSize: 38 });
  page.paragraphs.forEach((paragraph, index) => {
    add(`about-paragraph-${index}`, 'text', 570, 410 + index * 155, 540, 135, paragraph, { fontSize: 19 });
  });
  return { enabled: true, height: Math.max(675, 600 + page.paragraphs.length * 155), background: '#f7f4ef', elements };
}

export default function WixPageBuilder({ content, onChange, onError }) {
  const [pageKey, setPageKey] = useState('home');
  const [selectedId, setSelectedId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState('desktop');
  const drag = useRef(null);
  const canvasRef = useRef(null);
  const imageInputRef = useRef(null);
  const pendingImageId = useRef('');
  const selectedPage = pages.find((page) => page.key === pageKey);
  const canvas = pageKey === 'home' ? content.home.canvas : content.pageCanvases[pageKey];
  const canvasHeight = pageKey === 'home' ? 675 : (canvas.height || 1200);
  const elements = canvas.elements || [];
  const selected = elements.find((element) => element.id === selectedId);
  const previewContent = pageKey === 'home' ? {
    ...content,
    home: { ...content.home, canvas: canvas.enabled ? canvas : starterCanvas('home', content) }
  } : content;

  const updateCanvas = (next) => onChange(pageKey, next);
  const updateElement = (id, values) => {
    updateCanvas({ ...canvas, elements: elements.map((element) => element.id === id ? { ...element, ...values } : element) });
  };

  const addElement = (type) => {
    const maxY = Math.max(100, canvasHeight - 120);
    const next = baseElement(makeId(), type, 60, Math.min(120 + elements.length * 24, maxY), type === 'button' ? 240 : 420, type === 'image' ? 220 : 70,
      type === 'button' ? 'Mon bouton' : type === 'image' ? 'Mon image' : 'Mon nouveau texte',
      { background: type === 'button' ? '#8c6b3f' : '', color: pageKey === 'home' ? '#ffffff' : '#342a20' });
    updateCanvas({ ...canvas, enabled: true, elements: [...elements, next] });
    setSelectedId(next.id);
    if (type === 'image') {
      pendingImageId.current = next.id;
      imageInputRef.current?.click();
    }
  };

  const handleDragStart = (event, element) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = canvasRef.current.getBoundingClientRect();
    drag.current = { id: element.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: element.x, y: element.y, bounds };
    setSelectedId(element.id);
  };

  const handleDrag = (event) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const element = elements.find((item) => item.id === start.id);
    if (!element) return;
    const nextX = Math.round(start.x + (event.clientX - start.startX) * WIDTH / start.bounds.width);
    const nextY = Math.round(start.y + (event.clientY - start.startY) * canvasHeight / start.bounds.height);
    updateElement(start.id, {
      x: Math.max(0, Math.min(WIDTH - element.width, nextX)),
      y: Math.max(0, Math.min(canvasHeight - element.height, nextY))
    });
  };

  const uploadImage = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const imageId = pendingImageId.current || selectedId;
    const imageElement = elements.find((element) => element.id === imageId);
    if (!file || !imageElement || imageElement.type !== 'image') return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('kind', 'image');
      body.append('file', file);
      const result = await api('/api/admin/uploads', { method: 'POST', body, timeoutMs: 180000 });
      updateElement(imageElement.id, { src: result.url });
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setUploading(false);
      pendingImageId.current = '';
      input.value = '';
    }
  };

  const moveLayer = (offset) => {
    const index = elements.findIndex((element) => element.id === selectedId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= elements.length) return;
    const nextElements = [...elements];
    [nextElements[index], nextElements[target]] = [nextElements[target], nextElements[index]];
    updateCanvas({ ...canvas, elements: nextElements });
  };

  const setPage = (key) => {
    setPageKey(key);
    setSelectedId('');
    setPreviewOpen(false);
  };

  return (
    <section className="visual-builder">
      <header className="visual-builder__intro">
        <div>
          <span className="admin-section-kicker">ÉDITEUR VISUEL · CANEVAS LIBRE</span>
          <h2>Construire vos pages</h2>
          <p>Déplacez les textes, images et boutons, réglez leurs dimensions et leur ordre de superposition.</p>
        </div>
        <div className="visual-builder__intro-actions">
          <button type="button" className="button button--dark button--small" onClick={() => setPreviewOpen(true)} disabled={!canvas.enabled}>Aperçu du brouillon ↗</button>
          <a className="button button--outline button--small" href={selectedPage.path} target="_blank" rel="noreferrer">Voir la page ↗</a>
        </div>
      </header>
      <nav className="wix-page-tabs" aria-label="Choisir une page à modifier">
        {pages.map((page) => (
          <button type="button" key={page.key} className={pageKey === page.key ? 'is-active' : ''} aria-pressed={pageKey === page.key} onClick={() => setPage(page.key)}>
            {page.label}
          </button>
        ))}
        <span>Galerie et Contact gardent leurs outils spécialisés.</span>
      </nav>
      <div className="visual-builder__guide">
        <strong>{selectedPage.label} · canevas 1200 × {canvasHeight} px</strong>
        <span>Déplacer : glisser-déposer · Taille et position : panneau latéral.</span>
        <span>Ordre des calques : sélectionnez un bloc puis montez-le ou descendez-le.</span>
        <small>Vos changements restent en brouillon jusqu’à « Enregistrer les modifications » en bas de la page.</small>
      </div>
      <input
        ref={imageInputRef}
        className="wix-upload-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        disabled={uploading}
        onChange={uploadImage}
        aria-label="Charger une image depuis votre appareil"
      />

      {!canvas.enabled ? (
        <div className="visual-builder__empty">
          <h3>Créer un canevas libre pour {selectedPage.label.toLowerCase()}</h3>
          <p>Les éléments de la page actuelle sont repris dans un canevas modifiable. L’ancienne page reste récupérable tant que vous n’enregistrez pas le nouveau contenu.</p>
          <button type="button" className="button button--dark" onClick={() => updateCanvas(starterCanvas(pageKey, content))}>Créer depuis la page actuelle</button>
        </div>
      ) : (
        <>
          <div className="visual-builder__toolbar">
            <div>
              <button type="button" className="button button--outline button--small" onClick={() => addElement('text')}>+ Texte</button>
              <button type="button" className="button button--outline button--small" onClick={() => addElement('heading')}>+ Titre</button>
              <button type="button" className="button button--outline button--small" onClick={() => addElement('button')}>+ Bouton</button>
              <button type="button" className="button button--outline button--small" onClick={() => addElement('image')}>+ Image</button>
            </div>
            <label className="wix-background">Fond
              <input type="color" value={pageKey === 'home' ? '#342a20' : canvas.background} disabled={pageKey === 'home'} onChange={(event) => updateCanvas({ ...canvas, background: event.target.value })} />
            </label>
            <button type="button" className="button button--outline button--small" onClick={() => updateCanvas({ ...canvas, enabled: false })}>Revenir à la page actuelle</button>
          </div>
          <div className="visual-builder__workbench">
            <div
              ref={canvasRef}
              className={`visual-builder__canvas${pageKey === 'home' ? '' : ' visual-builder__canvas--page'}`}
              style={pageKey === 'home'
                ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,.15)), url("${content.home.heroImage}")` }
                : { '--canvas-height': canvasHeight, backgroundColor: canvas.background }}
              onPointerDown={() => setSelectedId('')}
              aria-label={`Canevas visuel de la page ${selectedPage.label}`}
            >
              {elements.map((element) => (
                <div
                  key={element.id}
                  className={`visual-builder__element visual-builder__element--${element.type}${selectedId === element.id ? ' is-selected' : ''}`}
                  style={{
                    left: `${element.x / 12}%`,
                    top: `${element.y / canvasHeight * 100}%`,
                    width: `${element.width / 12}%`,
                    height: `${element.height / canvasHeight * 100}%`,
                    color: element.color,
                    backgroundColor: element.background || 'transparent',
                    fontSize: `clamp(10px, ${element.fontSize / 12}cqw, ${element.fontSize}px)`
                  }}
                  onPointerDown={(event) => handleDragStart(event, element)}
                  onPointerMove={handleDrag}
                  onPointerUp={() => { drag.current = null; }}
                  onPointerCancel={() => { drag.current = null; }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Sélectionner ${element.type} : ${element.content || element.id}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(element.id);
                    }
                  }}
                >
                  {element.type === 'image' ? <img src={element.src} alt={element.content} draggable="false" /> : element.content}
                </div>
              ))}
              {elements.length === 0 && <span className="visual-builder__canvas-hint">Ajoutez un bloc depuis la barre d’outils</span>}
            </div>
            <aside className="visual-builder__inspector">
              <h3>Réglages du bloc</h3>
              {!selected ? <p>Sélectionnez un bloc sur le canevas pour modifier son contenu et son apparence.</p> : (
                <>
                  <label>Texte affiché<input value={selected.content} maxLength="2000" onChange={(event) => updateElement(selected.id, { content: event.target.value })} /></label>
                  <div className="visual-builder__number-grid">
                    {[
                      ['x', 'Position X'], ['y', 'Position Y'], ['width', 'Largeur'], ['height', 'Hauteur']
                    ].map(([key, label]) => (
                      <label key={key}>{label} (px)<input type="number" min={key === 'x' || key === 'y' ? 0 : 20} max={key === 'x' || key === 'width' ? 1200 : canvasHeight} value={selected[key]} onChange={(event) => {
                        const value = Number(event.target.value);
                        const limit = key === 'x' || key === 'width' ? WIDTH : canvasHeight;
                        const safeValue = Math.max(0, Math.min(limit, value));
                        const otherKey = key === 'x' ? 'width' : key === 'y' ? 'height' : key === 'width' ? 'x' : 'y';
                        updateElement(selected.id, { [key]: Math.min(safeValue, limit - selected[otherKey]) });
                      }} /></label>
                    ))}
                  </div>
                  <label>Taille du texte (px)<input type="number" min="10" max="160" value={selected.fontSize} onChange={(event) => updateElement(selected.id, { fontSize: Math.max(10, Math.min(160, Number(event.target.value))) })} /></label>
                  <label>Couleur du texte<input type="color" value={selected.color} onChange={(event) => updateElement(selected.id, { color: event.target.value })} /></label>
                  {selected.type === 'button' && (
                    <>
                      <label>Couleur du bouton<input type="color" value={selected.background || '#8c6b3f'} onChange={(event) => updateElement(selected.id, { background: event.target.value })} /></label>
                      <label>Page liée<select value={selected.href} onChange={(event) => updateElement(selected.id, { href: event.target.value })}>{pages.map((page) => <option key={page.path} value={page.path}>{page.label}</option>)}<option value="/galerie">Galerie</option><option value="/contact">Contact</option></select></label>
                    </>
                  )}
                  {selected.type === 'image' && (
                    <div className="wix-image-field">
                      <span>Image du bloc</span>
                      <button type="button" className="button button--outline button--small" onClick={() => {
                        pendingImageId.current = selected.id;
                        imageInputRef.current?.click();
                      }} disabled={uploading}>
                        {uploading ? 'Téléversement…' : 'Choisir une photo'}
                      </button>
                      <small>{selected.src}</small>
                    </div>
                  )}
                  <div className="wix-layer-actions">
                    <button type="button" className="button button--outline button--small" onClick={() => moveLayer(1)} disabled={elements.findIndex((item) => item.id === selectedId) === elements.length - 1}>Monter le calque</button>
                    <button type="button" className="button button--outline button--small" onClick={() => moveLayer(-1)} disabled={elements.findIndex((item) => item.id === selectedId) === 0}>Descendre le calque</button>
                  </div>
                  <button type="button" className="visual-builder__remove" onClick={() => { updateCanvas({ ...canvas, elements: elements.filter((element) => element.id !== selected.id) }); setSelectedId(''); }}>Supprimer ce bloc</button>
                </>
              )}
            </aside>
          </div>
        </>
      )}
      {previewOpen && canvas.enabled && (
        <div className="visual-builder__preview-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreviewOpen(false);
        }}>
          <section className="visual-builder__preview-dialog" role="dialog" aria-modal="true" aria-labelledby="visual-preview-title">
            <header className="visual-builder__preview-header">
              <div>
                <span className="admin-section-kicker">APERÇU NON PUBLIÉ</span>
                <h2 id="visual-preview-title">{selectedPage.label}</h2>
                <p>La maquette affiche les modifications en cours, sans les publier.</p>
              </div>
              <div className="visual-builder__preview-controls">
                <div className="visual-builder__preview-size" role="group" aria-label="Largeur de l’aperçu">
                  <button type="button" className={previewWidth === 'desktop' ? 'is-active' : ''} aria-pressed={previewWidth === 'desktop'} onClick={() => setPreviewWidth('desktop')}>Ordinateur</button>
                  <button type="button" className={previewWidth === 'mobile' ? 'is-active' : ''} aria-pressed={previewWidth === 'mobile'} onClick={() => setPreviewWidth('mobile')}>Mobile</button>
                </div>
                <button type="button" className="button button--dark button--small" onClick={() => setPreviewOpen(false)}>Fermer l’aperçu</button>
              </div>
            </header>
            <div className={`visual-builder__preview-viewport${previewWidth === 'mobile' ? ' is-mobile' : ''}`}>
              <div className="visual-builder__preview-site" onClickCapture={(event) => {
                if (event.target.closest('a')) event.preventDefault();
              }}>
                <Header site={previewContent.site} socialLinks={previewContent.footer.socialLinks} />
                <main id="main-content">
                  {pageKey === 'home'
                    ? <HomePage content={previewContent} />
                    : <SiteCanvasPage canvas={canvas} label={`Aperçu ${selectedPage.label}`} />}
                </main>
                <Footer site={previewContent.site} footer={previewContent.footer} navigation={previewContent.site.navigation} />
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
