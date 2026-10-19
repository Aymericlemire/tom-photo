// AdminPage.jsx - Espace Administrateur (version complète et optimisée)
// =====================================================================
// Composant principal pour la gestion du site de Tom
// - Gestion des pages (accueil, à propos, tarifs, etc.)
// - Gestion de la galerie (photos, vidéos, catégories)
// - Gestion des demandes de devis
// - Gestion du planning des rendez-vous
// - Gestion des avis clients
// - Gestion comptable
// =====================================================================

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import PlanningManager from '../components/PlanningManager.jsx';
import QuoteManager from '../components/QuoteManager.jsx';
import AccountingManager from '../components/AccountingManager.jsx';
import CRMManager from '../components/CRMManager.jsx';
import WixPageBuilder from '../components/WixPageBuilder.jsx';

// =====================================================================
// CONSTANTES ET CONFIGURATION
// =====================================================================

const LABELS = {
  about: 'À propos',
  aboutTitle: 'Titre de la page À propos',
  adminLabel: 'Lien administrateur',
  brand: 'Nom du site',
  cards: 'Cartes',
  city: 'Ville',
  completed: 'Terminés',
  calendarEyebrow: 'Accroche du calendrier',
  calendarNoTimes: 'Message sans créneau',
  calendarNote: 'Note sur les créneaux',
  calendarOptional: 'Mention date facultative',
  calendarSelectHint: 'Instruction de sélection de date',
  calendarSelectedPrefix: 'Préfixe de date sélectionnée',
  calendarTitle: 'Titre du calendrier',
  contact: 'Contact',
  contactTitle: 'Titre de la page Contact',
  description: 'Description',
  details: 'Détails',
  duration: 'Durée',
  email: 'E-mail',
  emailLabel: 'Libellé e-mail',
  expertise: 'Expertises',
  footer: 'Pied de page',
  formIntro: 'Texte du formulaire',
  formTitle: 'Titre du formulaire',
  gallery: 'Galerie',
  galleryAction: 'Bouton vers la galerie',
  group: 'Sous-catégorie',
  heroImage: 'Image de couverture',
  heroVideo: 'Vidéo de couverture',
  home: 'Accueil',
  image: 'Photo',
  inquiries: 'Demandes de devis',
  intro: 'Introduction',
  label: 'Nom affiché',
  locations: 'Villes desservies',
  logo: 'Logo',
  message: 'Message',
  messageLabel: 'Libellé message',
  navigation: 'Menu de navigation',
  navigationTitle: 'Titre de navigation',
  name: 'Nom',
  nameLabel: 'Libellé du nom',
  phoneLabel: 'Libellé du téléphone',
  paragraphs: 'Paragraphes',
  path: 'Page liée',
  phone: 'Téléphone',
  price: 'Prix',
  pricing: 'Tarifs',
  pricingAction: 'Bouton vers les tarifs',
  pricingEyebrow: 'Accroche des tarifs',
  pricingTitle: 'Titre des tarifs',
  projectPlaceholder: 'Aide à la rédaction du message',
  reservationNote: 'Note sur la réservation',
  panelDescription: 'Description du panneau contact',
  panelEyebrow: 'Accroche du panneau contact',
  panelTitle: 'Titre du panneau contact',
  role: 'Contexte',
  socialLinks: 'Réseaux sociaux',
  sectionEyebrow: 'Accroche de section',
  sectionIntro: 'Introduction de section',
  sectionTitle: 'Titre de section',
  serviceLabel: 'Libellé de la prestation',
  services: 'Prestations proposées',
  site: 'Identité et navigation',
  storyAction: 'Bouton de contact',
  subtitle: 'Sous-titre',
  submitLabel: 'Texte du bouton d’envoi',
  tagline: 'Phrase de présentation',
  testimonials: 'Avis clients',
  testimonialsEyebrow: 'Accroche des avis',
  testimonialsTitle: 'Titre des avis',
  times: 'Horaires proposés',
  title: 'Titre',
  type: 'Type de média',
  unavailableDates: 'Dates indisponibles',
  video: 'Fichier vidéo',
  weddingAction: 'Bouton mariages',
  weddingEyebrow: 'Accroche mariages',
  weddingTitle: 'Titre mariages',
  weddings: 'Formules de mariage',
  zoneLabel: 'Libellé de la zone'
};

// Rubriques affichées dans l'éditeur des pages. Chaque rubrique correspond à
// une partie précise du contenu envoyé au serveur lors de l'enregistrement.
const CONTENT_EDITOR_SECTIONS = [
  { key: 'site', label: 'Identité du site', description: 'Nom, logo, coordonnées et liens de navigation.', preview: '/' },
  { key: 'builder', label: 'Éditeur visuel', description: 'Composez les pages éditoriales avec un canevas libre, des textes, des boutons et des images.', preview: '/' },
  { key: 'home', label: 'Accueil', description: 'Bannière, textes, photos et avis clients.', preview: '/' },
  { key: 'expertise', label: 'Expertises', description: 'Vos prestations et les images qui les présentent.', preview: '/expertises' },
  { key: 'pricing', label: 'Tarifs', description: 'Tarifs des séances et formules de mariage.', preview: '/tarifs' },
  { key: 'about', label: 'À propos', description: 'Votre présentation et votre parcours.', preview: '/qui-suis-je' },
  { key: 'contact', label: 'Contact', description: 'Coordonnées, formulaire et calendrier de réservation.', preview: '/contact' },
  { key: 'footer', label: 'Pied de page', description: 'Informations et liens visibles en bas du site.', preview: '/' }
];

const INQUIRY_STATUSES = {
  new: 'Nouveau',
  in_progress: 'En cours',
  done: 'Traitée',
  rejected: 'Rejetée'
};

const EMAIL_STATUSES = {
  not_sent: 'Non envoyé',
  sent: 'Envoyé',
  failed: 'Échec'
};

const STATUS_CLASSES = {
  pending: 'is-pending',
  confirmed: 'is-confirmed',
  completed: 'is-completed',
  cancelled: 'is-cancelled'
};

// Cette liste sert à construire le menu et le titre de la page active.
// Garder les clés identiques à celles des conditions de rendu ci-dessous.
const ADMIN_SECTIONS = [
  { key: 'dashboard', label: 'Tableau de bord', icon: '⌂', description: 'Retrouvez les chiffres clés et les raccourcis de votre site.' },
  { key: 'pages', label: 'Pages du site', icon: '▤', description: 'Modifiez les textes et les visuels des pages du site.' },
  { key: 'gallery', label: 'Galerie', icon: '▧', description: 'Organisez les photos et vidéos par catégorie.' },
  { key: 'inquiries', label: 'Demandes de devis', icon: '✉', description: 'Consultez et suivez les demandes de devis reçues.' },
  { key: 'crm', label: 'CRM clients', icon: '◉', description: 'Centralisez les contacts, l’historique commercial et les relances.' },
  { key: 'planning', label: 'Planning', icon: '▦', description: 'Gérez les rendez-vous et les disponibilités.' },
  { key: 'quotes', label: 'Devis', icon: '€', description: 'Préparez et suivez les devis envoyés aux clients.' },
  { key: 'accounting', label: 'Comptabilité', icon: '↗', description: 'Consultez les revenus encaissés et ceux à venir.' }
];

// =====================================================================
// FONCTIONS UTILITAIRES
// =====================================================================

/**
 * Convertit un chemin de type "a.b.c" en tableau ["a", "b", "c"]
 */
const parsePath = (path) => {
  if (Array.isArray(path)) return path;
  return path.split('.');
};

/**
 * Met à jour une valeur dans un objet imbriqué à un chemin donné
 */
const updateAtPath = (root, path, value) => {
  const copy = structuredClone(root);
  let parent = copy;

  const pathParts = parsePath(path);
  for (let i = 0; i < pathParts.length - 1; i++) {
    parent = parent[pathParts[i]];
  }

  parent[pathParts[pathParts.length - 1]] = value;
  return copy;
};

/**
 * Crée une structure vide pour un champ donné
 */
const emptyLike = (value) => {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, emptyLike(child)])
    );
  }
  return null;
};

// Quand une liste est vide, aucun ancien élément n'existe pour servir de
// modèle. Ces structures permettent quand même d'ajouter un nouvel élément
// avec les champs attendus par le serveur.
const emptyArrayItem = (values, path) => {
  if (values.length) return emptyLike(values[0]);

  const templates = {
    'site.navigation': { label: '', path: '/' },
    'home.cards': { title: '', image: '/images/portrait.jpg', description: '' },
    'home.testimonials': { name: '', role: '', message: '' },
    'expertise.cards': { title: '', image: '/images/portrait.jpg', description: '' },
    'pricing.cards': { title: '', image: '/images/portrait.jpg', details: '', price: '' },
    'pricing.weddings': { title: '', price: '', description: '' },
    'about.paragraphs': '',
    'contact.services': '',
    'contact.times': '',
    'contact.unavailableDates': '',
    'footer.socialLinks': { label: '', url: 'https://' }
  };

  return structuredClone(templates[path.join('.')] ?? null);
};

// Un index de tableau n'est pas un nom de champ. Pour afficher un libellé utile,
// on reprend le nom de la liste (ex. "unavailableDates" plutôt que "0").
const fieldLabel = (path) => {
  const lastPart = path.at(-1);
  const labelPart = typeof lastPart === 'number' ? path.at(-2) : lastPart;
  return readable(labelPart);
};

/**
 * Formate un texte pour l'affichage (ex: "about.title" -> "About Title")
 */
const readable = (text) => {
  // Les chemins peuvent contenir des nombres (positions dans une liste) ou
  // être vides pour certaines valeurs. Les convertir évite de planter l'éditeur.
  const key = String(text ?? '');
  if (LABELS[key]) return LABELS[key];
  return key
    .split(/(?=[A-Z])|[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// =====================================================================
// COMPOSANTS EMBARQUÉS
// =====================================================================

/**
 * Composant pour éditer une ressource (texte, image, vidéo)
 */
function EditorNode({ value, path, onChange, onError }) {
  if (typeof value === 'string' || typeof value === 'number' || value === null) {
    const field = path.at(-1);
    if (['image', 'logo', 'heroImage', 'heroVideo'].includes(field)) {
      return (
        <AssetEditor
          field={field}
          value={value}
          onChange={(nextValue) => onChange(path, nextValue)}
          onError={onError}
        />
      );
    }

    return (
      <label className="editor-field">
        <span>{fieldLabel(path)}</span>
        {path.includes('unavailableDates') ? (
          <input
            type="date"
            required
            value={value || ''}
            onChange={(event) => onChange(path, event.target.value)}
          />
        ) : typeof value === 'string' && value.length > 140 ? (
          <textarea
            value={value}
            maxLength={4000}
            rows={4}
            onChange={(event) => onChange(path, event.target.value)}
          />
        ) : (
          <input
            value={value || ''}
            maxLength={1200}
            onChange={(event) => onChange(path, event.target.value)}
          />
        )}
      </label>
    );
  }

  if (Array.isArray(value)) {
    return (
      <fieldset className="editor-array">
        <legend>{fieldLabel(path)}</legend>
        {value.map((item, index) => (
          <details
            className="editor-item"
            key={`${path.join('.')}-${index}`}
            open={value.length === 1}
          >
            <summary>
              {item && typeof item === 'object'
                ? item.title || `${readable(path.at(-1))} ${index + 1}`
                : `${readable(path.at(-1))} ${index + 1}`}
            </summary>
            <div className="editor-item__body">
              <EditorNode
                value={item}
                path={[...path, index]}
                onChange={onChange}
                onError={onError}
              />
              <div className="editor-item__actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={index === 0}
                  onClick={() => {
                    const copy = [...value];
                    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
                    onChange(path, copy);
                  }}
                >
                  Monter
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={index === value.length - 1}
                  onClick={() => {
                    const copy = [...value];
                    [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
                    onChange(path, copy);
                  }}
                >
                  Descendre
                </button>
                <button
                  type="button"
                  className="text-button text-button--danger"
                  onClick={() => {
                    const copy = [...value];
                    copy.splice(index, 1);
                    onChange(path, copy);
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </details>
        ))}
        <button
          type="button"
          className="button button--outline button--small"
          onClick={() => {
            const newItem = emptyArrayItem(value, path);
            onChange(path, [...value, newItem]);
          }}
        >
          + Ajouter un élément
        </button>
      </fieldset>
    );
  }

  if (value && typeof value === 'object') {
    return (
      <div className="editor-object">
        {Object.entries(value).map(([key, childValue]) => (
          <EditorNode
            key={`${path.join('.')}.${key}`}
            value={childValue}
            path={[...path, key]}
            onChange={onChange}
            onError={onError}
          />
        ))}
      </div>
    );
  }

  return null;
}

/**
 * Composant pour gérer les téléversements d'images/vidéos
 */
function AssetEditor({ value, onChange, field, onError, compact = false }) {
  const [uploading, setUploading] = useState(false);
  const isVideoField = field.toLowerCase().includes('video') || /\.(mp4|webm)$/i.test(value || '');

  const handleUpload = useCallback(async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setUploading(true);
    onError('');

    try {
      const body = new FormData();
      body.append('kind', isVideoField ? 'video' : 'image');
      body.append('file', file);

      const result = await api('/api/admin/uploads', {
        method: 'POST',
        body,
        timeoutMs: 180000
      });

      if (!result || (result.kind === 'video') !== isVideoField) {
        throw new Error(
          isVideoField
            ? 'Veuillez sélectionner une vidéo pour ce champ.'
            : 'Veuillez sélectionner une image pour ce champ.'
        );
      }

      onChange(result.url);
    } catch (error) {
      onError(error.message || 'Échec du téléversement');
    } finally {
      setUploading(false);
    }
  }, [isVideoField, onChange, onError]);

  return (
    <div className={`asset-editor${compact ? ' asset-editor--compact' : ''}`}>
      {!compact && (
        <label className="editor-field">
          <span>{readable(field)}</span>
          <input
            type="text"
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder="URL de l'image ou de la vidéo"
          />
        </label>
      )}

      <label className="upload-control">
        <input
          type="file"
          accept={isVideoField ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif,image/avif'}
          onChange={handleUpload}
          disabled={uploading}
        />
        {uploading ? 'Téléchargement…' : compact ? 'Choisir' : 'Téléverser'}
      </label>

      {value && (
        <div className="asset-preview">
          {isVideoField ? (
            <video
              src={value}
              controls
              preload="metadata"
              className={compact ? 'asset-preview--compact' : ''}
            />
          ) : (
            <img
              src={value}
              alt={`Aperçu de ${readable(field)}`}
              className={compact ? 'asset-preview--compact' : ''}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gestionnaire de la galerie d'images
 */
function GalleryManager({ gallery, onChange, onError }) {
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadCategory, setUploadCategory] = useState(gallery.categories[0] || '');
  const [newCategory, setNewCategory] = useState('');
  const [draggedCardIndex, setDraggedCardIndex] = useState(null);
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState(null);
  const galleryRef = useRef(gallery);
  galleryRef.current = gallery;

  const addCard = useCallback(() => {
    onChange({
      ...gallery,
      cards: [
        ...gallery.cards,
        {
          title: 'Nouvelle photo',
          image: '/images/portrait.jpg',
          description: '',
          category: gallery.categories[0] || '',
          group: '',
          type: 'photo',
          video: ''
        }
      ]
    });
  }, [gallery, onChange]);

  const updateCard = useCallback((index, key, value) => {
    onChange({
      ...gallery,
      cards: gallery.cards.map((card, cardIndex) =>
        cardIndex === index ? { ...card, [key]: value } : card
      )
    });
  }, [gallery, onChange]);

  const moveCard = useCallback((index, offset) => {
    const nextCards = [...gallery.cards];
    [nextCards[index], nextCards[index + offset]] = [nextCards[index + offset], nextCards[index]];
    onChange({ ...gallery, cards: nextCards });
  }, [gallery, onChange]);

  const placeCard = useCallback((fromIndex, toIndex) => {
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= gallery.cards.length ||
        fromIndex === toIndex || toIndex < 0 || toIndex >= gallery.cards.length) return;
    const nextCards = [...gallery.cards];
    const [card] = nextCards.splice(fromIndex, 1);
    nextCards.splice(toIndex, 0, card);
    onChange({ ...gallery, cards: nextCards });
  }, [gallery, onChange]);

  const placeCategory = useCallback((fromIndex, toIndex) => {
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= gallery.categories.length ||
        fromIndex === toIndex || toIndex < 0 || toIndex >= gallery.categories.length) return;
    const categories = [...gallery.categories];
    const [category] = categories.splice(fromIndex, 1);
    categories.splice(toIndex, 0, category);
    onChange({ ...gallery, categories });
  }, [gallery, onChange]);

  const removeCard = useCallback((index) => {
    onChange({
      ...gallery,
      cards: gallery.cards.filter((_, cardIndex) => cardIndex !== index)
    });
  }, [gallery, onChange]);

  const addCategory = useCallback(() => {
    const category = newCategory.trim();
    if (!category) return;

    if (gallery.categories.length >= 24) {
      onError('Maximum de 24 catégories autorisées');
      return;
    }

    if (gallery.categories.some(c =>
      c.toLowerCase() === category.toLowerCase()
    )) {
      onError('Cette catégorie existe déjà');
      return;
    }

    onChange({
      ...gallery,
      categories: [...gallery.categories, category]
    });
    setUploadCategory(category);
    setNewCategory('');
    onError('');
  }, [gallery, newCategory, onChange, onError]);

  const renameCategory = useCallback((previous, next) => {
    const category = next.trim();
    if (!category) {
      onError('Le nom de la catégorie ne peut pas être vide');
      return;
    }

    if (gallery.categories.some(c =>
      c !== previous && c.toLowerCase() === category.toLowerCase()
    )) {
      onError('Une catégorie avec ce nom existe déjà');
      return;
    }

    onChange({
      ...gallery,
      categories: gallery.categories.map(c => c === previous ? category : c),
      cards: gallery.cards.map(card =>
        card.category === previous ? { ...card, category } : card
      )
    });
    setUploadCategory(category);
    onError('');
  }, [gallery, onChange, onError]);

  const removeCategory = useCallback((category) => {
    if (gallery.cards.some(card => card.category === category)) {
      onError('Supprimez d\'abord les photos de cette catégorie');
      return;
    }

    onChange({
      ...gallery,
      categories: gallery.categories.filter(c => c !== category)
    });
    onError('');
  }, [gallery, onChange, onError]);

  const uploadPhotos = useCallback(async (event) => {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    input.value = '';

    if (!selectedFiles.length) return;

    const availableSlots = 120 - galleryRef.current.cards.length;
    if (availableSlots <= 0) {
      onError('La galerie est pleine (120 photos maximum)');
      return;
    }

    const category = galleryRef.current.categories.includes(uploadCategory)
      ? uploadCategory
      : galleryRef.current.categories[0];

    if (!category) {
      onError('Créez une catégorie avant d\'importer des photos');
      return;
    }

    const files = selectedFiles.slice(0, availableSlots);
    const rejectedCount = selectedFiles.length - files.length;
    const uploadedCards = [];
    const failures = [];

    setUploadingPhotos(true);
    setUploadStatus(`Préparation de ${files.length} photo${files.length > 1 ? 's' : ''}…`);
    onError('');

    try {
      for (const file of files) {
        try {
          const body = new FormData();
          body.append('kind', 'image');
          body.append('file', file);

          const result = await api('/api/admin/uploads', {
            method: 'POST',
            body,
            timeoutMs: 180000
          });

          uploadedCards.push({
            title: file.name.replace(/\.[^/.]+$/, ""),
            image: result.url,
            description: '',
            category,
            group: '',
            type: 'photo',
            video: ''
          });
        } catch (error) {
          failures.push(file.name);
        }
      }

      if (uploadedCards.length > 0) {
        onChange({
          ...galleryRef.current,
          cards: [...galleryRef.current.cards, ...uploadedCards]
        });
      }

      const messages = [];
      if (uploadedCards.length) messages.push(`${uploadedCards.length} photo${uploadedCards.length > 1 ? 's' : ''} ajoutée${uploadedCards.length > 1 ? 's' : ''}`);
      if (rejectedCount) messages.push(`${rejectedCount} photo${rejectedCount > 1 ? 's ignorée' : 's ignorée'}`);
      if (failures.length) messages.push(`${failures.length} échec${failures.length > 1 ? 's' : ''}`);

      setUploadStatus(messages.join(' | '));
      if (failures.length) onError(`${failures.length} photo${failures.length > 1 ? 's n\'ont pas pu être importées' : ' n\'a pas pu être importée'}`);
    } finally {
      setUploadingPhotos(false);
    }
  }, [uploadCategory, onChange, onError]);

  return (
    <div className="gallery-manager">
      <section className="editor-section">
        <header className="editor-section__header">
          <h2>Gestion de la galerie</h2>
          <p>{gallery.cards.length} photo{gallery.cards.length > 1 ? 's' : ''} • {gallery.categories.length} catégorie{gallery.categories.length > 1 ? 's' : ''}</p>
        </header>

        {/* Gestion des catégories */}
        <div className="gallery-categories">
          <h3>Catégories</h3>
          <div className="category-list">
            {gallery.categories.map((category, index) => (
              <div
                className={`category-item${draggedCategoryIndex === index ? ' is-dragging' : ''}`}
                key={category}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const transferValue = event.dataTransfer.getData('text/plain');
                  const sourceIndex = transferValue === '' ? draggedCategoryIndex : Number(transferValue);
                  placeCategory(sourceIndex, index);
                  setDraggedCategoryIndex(null);
                }}
              >
                <button
                  type="button"
                  className="text-button gallery-drag-handle"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(index));
                    setDraggedCategoryIndex(index);
                  }}
                  onDragEnd={() => setDraggedCategoryIndex(null)}
                  aria-label={`Déplacer la catégorie ${category}`}
                  title="Faire glisser pour changer l’ordre"
                >↕</button>
                <span>{category}</span>
                <div className="category-actions">
                  <button type="button" className="text-button" onClick={() => placeCategory(index, index - 1)} disabled={index === 0} aria-label={`Monter ${category}`}>↑</button>
                  <button type="button" className="text-button" onClick={() => placeCategory(index, index + 1)} disabled={index === gallery.categories.length - 1} aria-label={`Descendre ${category}`}>↓</button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      const newName = prompt('Nouveau nom:', category);
                      if (newName) renameCategory(category, newName);
                    }}
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    className="text-button text-button--danger"
                    onClick={() => removeCategory(category)}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="category-form">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nom de la nouvelle catégorie"
              maxLength={50}
            />
            <button
              type="button"
              className="button button--outline"
              onClick={addCategory}
              disabled={!newCategory.trim()}
            >
              + Ajouter une catégorie
            </button>
          </div>
        </div>

        {/* Gestion des photos */}
        <div className="gallery-photos">
          <h3>Photos ({gallery.cards.length}/120)</h3>
          <p className="gallery-reorder-hint">Faites glisser une photo pour changer son ordre. Les flèches restent disponibles pour la déplacer pas à pas.</p>
          <div className="upload-area">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={uploadPhotos}
              disabled={uploadingPhotos}
              id="photo-upload"
              style={{ display: 'none' }}
            />
            <label htmlFor="photo-upload" className="button button--primary">
              {uploadingPhotos ? 'Téléchargement…' : '+ Importer des photos'}
            </label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              disabled={!gallery.categories.length}
            >
              {gallery.categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {uploadStatus && <p className="upload-status">{uploadStatus}</p>}
          </div>

          <div className="photo-grid">
            {gallery.cards.map((card, index) => (
              <div
                className={`photo-card${draggedCardIndex === index ? ' is-dragging' : ''}`}
                key={index}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const transferValue = event.dataTransfer.getData('text/plain');
                  const sourceIndex = transferValue === '' ? draggedCardIndex : Number(transferValue);
                  placeCard(sourceIndex, index);
                  setDraggedCardIndex(null);
                }}
              >
                <div className="photo-preview">
                  <img src={card.image} alt={card.title} />
                </div>
                <div className="photo-info">
                  <input
                    type="text"
                    value={card.title}
                    onChange={(e) => updateCard(index, 'title', e.target.value)}
                    placeholder="Titre"
                  />
                  <select
                    value={card.category}
                    onChange={(e) => updateCard(index, 'category', e.target.value)}
                  >
                    {gallery.categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <textarea
                    value={card.description}
                    onChange={(e) => updateCard(index, 'description', e.target.value)}
                    placeholder="Description"
                    rows={2}
                  />
                  <div className="photo-actions">
                    <button
                      type="button"
                      className="text-button gallery-drag-handle"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', String(index));
                        setDraggedCardIndex(index);
                      }}
                      onDragEnd={() => setDraggedCardIndex(null)}
                      aria-label={`Déplacer ${card.title} par glisser-déposer`}
                      title="Faire glisser pour déplacer"
                    >
                      ↕ Déplacer
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => moveCard(index, -1)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => moveCard(index, 1)}
                      disabled={index === gallery.cards.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="text-button text-button--danger"
                      onClick={() => removeCard(index)}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {gallery.cards.length < 120 && (
              <button
                type="button"
                className="add-photo-btn"
                onClick={addCard}
              >
                + Ajouter une photo
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Gestionnaire des demandes de devis
 */
function InquiryManager({ onError }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0, pageCount: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const loadRequests = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const data = await api(`/api/admin/inquiries?page=${nextPage}`);
      setResult(data);
      setPage(data.page);
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setLoading(false);
    }
  }, [page, onError]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const changeStatus = useCallback(async (id, status) => {
    setUpdatingId(id);
    try {
      await api(`/api/admin/inquiries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setResult(prev => ({
        ...prev,
        items: prev.items.map(item =>
          item.id === id ? { ...item, status } : item
        )
      }));
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setUpdatingId(null);
    }
  }, [onError]);

  const removeRequest = useCallback(async (item) => {
    if (!window.confirm(`Supprimer définitivement la demande de ${item.data.name} ?`)) return;

    setUpdatingId(item.id);
    try {
      await api(`/api/admin/inquiries/${item.id}`, { method: 'DELETE' });
      const nextPage = result.items.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) {
        setPage(nextPage);
      } else {
        setResult(prev => ({
          ...prev,
          items: prev.items.filter(entry => entry.id !== item.id),
          total: prev.total - 1
        }));
      }
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setUpdatingId(null);
    }
  }, [page, result.items, onError]);

  const notify = useCallback(async (id, kind) => {
    setUpdatingId(id);
    try {
      const result = await api(`/api/admin/inquiries/${id}/notify`, {
        method: 'POST',
        body: JSON.stringify({ kind })
      });

      setResult(prev => ({
        ...prev,
        items: prev.items.map(item =>
          item.id === id
            ? {
                ...item,
                confirmation_sent_at: kind === 'confirmation' ? new Date().toISOString() : item.confirmation_sent_at,
                reminder_sent_at: kind === 'reminder' ? new Date().toISOString() : item.reminder_sent_at
              }
            : item
        )
      }));
      onError('');
      return result.message;
    } catch (error) {
      onError(error.message);
    } finally {
      setUpdatingId(null);
    }
  }, [onError]);

  const formatDate = useCallback((dateString) => {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(dateString));
  }, []);

  return (
    <section className="editor-section inquiry-manager" aria-labelledby="inquiry-heading">
      <header className="editor-section__header">
        <div>
          <span className="admin-section-kicker">BOÎTE DE RÉCEPTION</span>
          <h2 id="inquiry-heading">Demandes de devis</h2>
          <p>{result.total} demande{result.total > 1 ? 's' : ''} enregistrée{result.total > 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          className="button button--outline button--small"
          onClick={() => loadRequests(page)}
          disabled={loading}
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </header>

      {loading && !result.items.length ? (
        <p className="inquiry-empty">Chargement des demandes…</p>
      ) : result.items.length ? (
        <div className="inquiry-list">
          {result.items.map((item) => (
            <article className="inquiry-card" key={item.id}>
              <header className="inquiry-card__header">
                <div>
                  <span className="admin-section-kicker">
                    DEMANDE #{item.id} · {formatDate(item.created_at)}
                  </span>
                  <h3>{item.data.name}</h3>
                </div>
                <label className="inquiry-status">
                  <span>Suivi</span>
                  <select
                    value={item.status}
                    onChange={(event) => changeStatus(item.id, event.target.value)}
                    disabled={updatingId === item.id}
                  >
                    {Object.entries(INQUIRY_STATUSES).map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </header>

              <div className="inquiry-card__details">
                <a href={`mailto:${item.data.email}`}>{item.data.email}</a>
                {item.data.phone && (
                  <a href={`tel:${item.data.phone.replace(/[^\d+]/g, '')}`}>
                    {item.data.phone}
                  </a>
                )}
                <span><strong>Prestation :</strong> {item.data.service}</span>
                {item.data.date && (
                  <span>
                    <strong>Date souhaitée :</strong>{' '}
                    {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
                      new Date(`${item.data.date}T00:00:00`)
                    )}
                    {item.data.time ? ` à ${item.data.time}` : ''}
                  </span>
                )}
                {item.data.location && (
                  <span><strong>Lieu :</strong> {item.data.location}</span>
                )}
                <span className={`inquiry-email-status is-${item.email_status}`}>
                  {EMAIL_STATUSES[item.email_status]}
                </span>
                <span className={`inquiry-email-status ${item.confirmation_sent_at ? 'is-sent' : 'is-pending'}`}>
                  {item.confirmation_sent_at
                    ? `Confirmation envoyée le ${formatDate(item.confirmation_sent_at)}`
                    : 'En attente de confirmation'}
                </span>
              </div>

              <footer className="inquiry-card__actions">
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => notify(item.id, 'confirmation')}
                  disabled={updatingId === item.id}
                >
                  Envoyer confirmation
                </button>
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => notify(item.id, 'reminder')}
                  disabled={updatingId === item.id}
                >
                  Envoyer rappel
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => removeRequest(item)}
                  disabled={updatingId === item.id}
                >
                  Supprimer
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <p className="inquiry-empty">Aucune demande de devis pour le moment.</p>
      )}
    </section>
  );
}

// =====================================================================
// COMPOSANT PRINCIPAL AdminPage
// =====================================================================

export default function AdminPage() {
  // authenticated = session ouverte ; checking = requête de vérification en cours.
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [content, setContent] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);
  // Une erreur de chargement du contenu doit proposer "Réessayer", pas rester bloquée.
  const [contentLoadError, setContentLoadError] = useState('');
  const [activeSection, setActiveSection] = useState('dashboard');
  const [editingPageSection, setEditingPageSection] = useState('site');
  const [message, setMessage] = useState({ type: '', text: '' });
  // Ce callback reste identique entre les rendus : les modules qui le
  // surveillent dans leurs effets ne relancent pas leurs chargements en boucle.
  const reportError = useCallback((text) => {
    const nextMessage = { type: text ? 'error' : '', text };
    setMessage((current) => (
      current.type === nextMessage.type && current.text === nextMessage.text
        ? current
        : nextMessage
    ));
  }, []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Ref = valeur gardée entre rendus sans déclencher un nouveau rendu.
  // Elle permet de comparer le contenu au moment où l'enregistrement se termine.
  const latestContent = useRef(content);
  // Évite deux vérifications identiques quand React relance l'effet en développement.
  const sessionCheckStarted = useRef(false);

  // Statistiques du dashboard
  // Une vidéo est aussi une carte de galerie ; on l'exclut ici pour que
  // le compteur "Photos" affiche bien uniquement les images.
  const photoCount = useMemo(() => {
    return content?.gallery?.cards?.filter((card) => card.type !== 'video').length || 0;
  }, [content]);

  const categories = useMemo(() => {
    return content?.gallery?.categories?.length || 0;
  }, [content]);

  const videoCount = useMemo(() => {
    return content?.gallery?.cards?.filter(card => card.type === 'video').length || 0;
  }, [content]);

  const testimonialCount = useMemo(() => {
    return content?.home?.testimonials?.length || 0;
  }, [content]);

  // Raccourcis du dashboard
  const shortcuts = useMemo(() => [
    {
      key: 'pages',
      label: 'Pages du site',
      hint: 'Modifier les textes et images',
      icon: '📄'
    },
    {
      key: 'gallery',
      label: 'Galerie',
      hint: 'Gérer les photos et vidéos',
      icon: '🖼️'
    },
    {
      key: 'inquiries',
      label: 'Demandes de devis',
      hint: 'Voir et répondre aux demandes',
      icon: '📩'
    },
    {
      key: 'crm',
      label: 'CRM clients',
      hint: 'Suivre les contacts et les relances',
      icon: '👥'
    },
    {
      key: 'planning',
      label: 'Planning',
      hint: 'Gérer les rendez-vous',
      icon: '📅'
    },
    {
      key: 'quotes',
      label: 'Devis',
      hint: 'Gérer les devis clients',
      icon: '💰'
    },
    {
      key: 'accounting',
      label: 'Comptabilité',
      hint: 'Suivi financier',
      icon: '📊'
    }
  ], []);

  // Charge le contenu privé après confirmation de la session.
  const loadContent = useCallback(async () => {
    setContentLoading(true);
    setContentLoadError('');
    try {
      const data = await api('/api/admin/content');
      // La copie permet de comparer correctement les modifications à venir.
      latestContent.current = data;
      setContent(data);
      setDirty(false);
      setMessage({ type: '', text: '' });
      return true;
    } catch (error) {
      setContentLoadError(error.message);
      setMessage({ type: 'error', text: error.message });
      if (error.status === 401) {
        setAuthenticated(false);
      }
      return false;
    } finally {
      setContentLoading(false);
    }
  }, []);

  // Le serveur expose /session et répond { authenticated: true/false }.
  // On ne charge les données du site que si cette réponse confirme la connexion.
  const checkSession = useCallback(async () => {
    if (sessionCheckStarted.current) return;
    sessionCheckStarted.current = true;

    try {
      const session = await api('/api/admin/session');
      if (session?.authenticated !== true) {
        setAuthenticated(false);
        setContent(null);
        return;
      }

      setAuthenticated(true);
      await loadContent();
    } catch (error) {
      setAuthenticated(false);
      setContent(null);
      if (error.status !== 401) {
        setMessage({ type: 'error', text: error.message });
      }
    } finally {
      setChecking(false);
    }
  }, [loadContent]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Empêche de perdre accidentellement son travail si l'on ferme ou recharge
  // l'onglet avant d'avoir sauvegardé les changements.
  useEffect(() => {
    if (!dirty) return undefined;

    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  // Mise à jour du contenu en mémoire. La sauvegarde sur le serveur est séparée,
  // afin de pouvoir modifier plusieurs champs avant de cliquer sur "Enregistrer".
  const update = useCallback((path, value) => {
    setContent(current => {
      const next = updateAtPath(current, path, value);
      latestContent.current = next;
      return next;
    });
    setDirty(true);
    setMessage({ type: '', text: '' });
  }, []);

  // Sauvegarde. La comparaison à latestContent détecte les changements faits
  // pendant qu'une requête réseau est encore en cours.
  const save = useCallback(async (event) => {
    event.preventDefault();
    if (!dirty || saving) return;

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const result = await api('/api/admin/content', {
        method: 'PUT',
        body: JSON.stringify(content)
      });

      const hasNewChanges = JSON.stringify(latestContent.current || content) !== JSON.stringify(content);
      setMessage({
        type: 'success',
        text: hasNewChanges
          ? 'Enregistrement terminé. De nouvelles modifications restent à enregistrer.'
          : result.message || 'Contenu sauvegardé avec succès'
      });
      setDirty(hasNewChanges);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      if (error.status === 401) {
        setAuthenticated(false);
      }
    } finally {
      setSaving(false);
    }
  }, [content, dirty, saving]);

  // Déconnexion
  const confirmDiscard = useCallback(() => (
    !dirty || window.confirm('Vous avez des modifications non enregistrées. Les abandonner ?')
  ), [dirty]);

  const logout = useCallback(async () => {
    if (!confirmDiscard()) return;

    try {
      await api('/api/admin/logout', { method: 'POST' });
      setAuthenticated(false);
      setContent(null);
      setDirty(false);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }, [confirmDiscard]);

  // Navigation
  const onNavigate = useCallback((section) => {
    setActiveSection(section);
    setMessage({ type: '', text: '' });
  }, []);

  // Rendu du dashboard
  const renderDashboard = useCallback(() => (
    <div className="dashboard">
      <header className="dashboard-heading">
        <div>
          <span className="admin-section-kicker">VOTRE ESPACE DE PILOTAGE</span>
          <h2>Bonjour, {content.site.brand}</h2>
          <p>Tout votre studio, simplement.</p>
        </div>
        <time dateTime={new Date().toISOString().slice(0, 10)}>
          {new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
        </time>
      </header>

      <section className="dashboard-hero" aria-label="Bienvenue dans votre espace de gestion">
        <div className="dashboard-hero__copy">
          <span className="dashboard-hero__eyebrow"><i aria-hidden="true" /> STUDIO CRÉATIF</span>
          <h3>Votre univers.<br />Votre activité.<br /><em>En harmonie.</em></h3>
          <p>Retrouvez au même endroit votre vitrine, vos clients et les outils qui font avancer votre studio.</p>
          <button type="button" className="dashboard-hero__button" onClick={() => onNavigate('pages')}>
            Personnaliser mon site <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="dashboard-hero__visual" aria-hidden="true">
          <span className="dashboard-hero__seal">TOM<br /><small>PHOTO</small></span>
          <span className="dashboard-hero__caption">L’image raconte<br />ce que les mots ne disent pas.</span>
        </div>
        <div className="dashboard-hero__status">
          <span className="dashboard-live"><i /> VOTRE SITE EST EN LIGNE</span>
          <span>Visible par vos futurs clients</span>
        </div>
      </section>

      <section className="dashboard-stats" aria-label="Statistiques de votre site">
        <article className="dashboard-stat">
          <span className="dashboard-stat__icon" aria-hidden="true">▧</span>
          <div><strong>{photoCount}</strong><span>Photos</span></div>
          <small>dans votre galerie</small>
        </article>
        <article className="dashboard-stat">
          <span className="dashboard-stat__icon" aria-hidden="true">◫</span>
          <div><strong>{categories}</strong><span>Albums</span></div>
          <small>pour organiser vos images</small>
        </article>
        <article className="dashboard-stat">
          <span className="dashboard-stat__icon" aria-hidden="true">▷</span>
          <div><strong>{videoCount}</strong><span>Vidéos</span></div>
          <small>dans votre galerie</small>
        </article>
        <article className="dashboard-stat">
          <span className="dashboard-stat__icon" aria-hidden="true">✳</span>
          <div><strong>{testimonialCount}</strong><span>Témoignages</span></div>
          <small>partagés sur votre site</small>
        </article>
      </section>

      <div className="dashboard-workspace">
        <section className="dashboard-workspace__main" aria-labelledby="dashboard-activity-title">
          <div className="dashboard-section-heading">
            <div>
              <span className="admin-section-kicker">VOTRE QUOTIDIEN</span>
              <h3 id="dashboard-activity-title">Piloter mon activité</h3>
            </div>
            <span>LES ESSENTIELS</span>
          </div>
          <div className="dashboard-workflows">
            {shortcuts.filter(({ key }) => ['inquiries', 'crm', 'planning'].includes(key)).map((shortcut, index) => (
              <button
                type="button"
                className="dashboard-workflow"
                key={shortcut.key}
                onClick={() => onNavigate(shortcut.key)}
              >
                <span className="dashboard-workflow__number">0{index + 1}</span>
                <span className="dashboard-workflow__icon" aria-hidden="true">{shortcut.icon}</span>
                <span className="dashboard-workflow__body">
                  <strong>{shortcut.label}</strong>
                  <small>{shortcut.hint}</small>
                </span>
                <span className="dashboard-workflow__arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="dashboard-workspace__side">
          <section className="dashboard-site-card" aria-labelledby="dashboard-site-title">
            <div className="dashboard-section-heading">
              <div>
                <span className="admin-section-kicker">VOTRE VITRINE</span>
                <h3 id="dashboard-site-title">Le site, à votre image</h3>
              </div>
              <span className="dashboard-site-card__status" aria-label="Site en ligne"><i /></span>
            </div>
            <p>Faites évoluer vos pages et vos galeries au rythme de votre travail.</p>
            <button type="button" className="dashboard-site-card__link" onClick={() => onNavigate('pages')}>
              Gérer les pages <span aria-hidden="true">→</span>
            </button>
            <button type="button" className="dashboard-site-card__link" onClick={() => onNavigate('gallery')}>
              Mettre à jour la galerie <span aria-hidden="true">→</span>
            </button>
          </section>

          <section className="dashboard-tools" aria-labelledby="dashboard-tools-title">
            <span className="admin-section-kicker">GESTION &amp; SUIVI</span>
            <h3 id="dashboard-tools-title">Les outils du studio</h3>
            <div className="dashboard-tools__links">
              {shortcuts.filter(({ key }) => ['quotes', 'accounting'].includes(key)).map((shortcut) => (
                <button type="button" key={shortcut.key} onClick={() => onNavigate(shortcut.key)}>
                  <span aria-hidden="true">{shortcut.icon}</span>
                  <span>{shortcut.label}</span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  ), [content?.site?.brand, photoCount, categories, videoCount, testimonialCount, shortcuts, onNavigate]);

  // Rendu principal
  if (checking) {
    return (
      <div className="admin-loading">
        <p>Vérification de la session...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <AdminLogin
        initialError={message.type === 'error' ? message.text : ''}
        onAuthenticated={() => {
          setAuthenticated(true);
          loadContent();
        }}
        onError={reportError}
      />
    );
  }

  if (!content) {
    return (
      <div className="admin-loading">
        {contentLoading ? (
          <section className="admin-loading__card" aria-live="polite">
            <span className="admin-loading__spinner" aria-hidden="true" />
            <h1>Chargement du contenu…</h1>
            <p>Nous récupérons les informations de votre site.</p>
          </section>
        ) : contentLoadError ? (
          <section className="admin-loading__card" role="alert">
            <span className="admin-section-kicker">ESPACE ADMINISTRATEUR</span>
            <h1>Le contenu n’a pas pu être chargé</h1>
            <p>{contentLoadError}</p>
            <button className="button button--dark" type="button" onClick={loadContent}>
              Réessayer
            </button>
          </section>
        ) : (
          <p>Chargement du contenu…</p>
        )}
      </div>
    );
  }

  const activeSectionInfo = ADMIN_SECTIONS.find((section) => section.key === activeSection) ?? ADMIN_SECTIONS[0];
  const pageEditorSectionInfo = CONTENT_EDITOR_SECTIONS.find((section) => section.key === editingPageSection)
    ?? CONTENT_EDITOR_SECTIONS[0];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <img src={content.site.logo} alt="" />
          <span>
            <strong>{content.site.brand}</strong>
            <small>ESPACE ADMINISTRATEUR</small>
          </span>
        </div>
        <span className="admin-sidebar__label">GESTION DU SITE</span>
        <nav className="admin-nav" aria-label="Navigation de l’administration">
          {ADMIN_SECTIONS.map((section) => (
            <button
              type="button"
              className={`admin-nav__item${activeSection === section.key ? ' is-active' : ''}`}
              key={section.key}
              onClick={() => onNavigate(section.key)}
              aria-current={activeSection === section.key ? 'page' : undefined}
            >
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>
        <footer className="admin-sidebar__footer">
          <Link
            to="/"
            onClick={(event) => {
              if (!confirmDiscard()) event.preventDefault();
            }}
          >
            ← Retour au site
          </Link>
          <button type="button" className="admin-sidebar__logout" onClick={logout}>
            Se déconnecter
          </button>
        </footer>
      </aside>

      <main className="admin-main">
        <div className="admin-topline">
          <span>ADMINISTRATION <b>·</b> {content.site.brand}</span>
          <span className="admin-status"><i /> Session sécurisée</span>
        </div>
        {activeSection !== 'dashboard' && (
          <header className="admin-header">
            <div>
              <span className="admin-section-kicker">ESPACE DE GESTION</span>
              <h1>{activeSectionInfo.label}</h1>
              <p>{activeSectionInfo.description}</p>
            </div>
            {dirty && (
              <span className="admin-unsaved" role="status">
                Modifications à enregistrer
              </span>
            )}
          </header>
        )}
        {message.text && (
          <div className={`form-status form-status--${message.type}`} role="alert">
            {message.text}
          </div>
        )}

        {/* Section active */}
        {activeSection === 'dashboard' && renderDashboard()}

        {activeSection === 'pages' && (
          <div className="cms-editor">
            <nav className="cms-section-tabs" aria-label="Choisir le contenu à modifier">
              {CONTENT_EDITOR_SECTIONS.map((section) => (
                <button
                  type="button"
                  className={`cms-section-tabs__item${editingPageSection === section.key ? ' is-active' : ''}`}
                  key={section.key}
                  onClick={() => setEditingPageSection(section.key)}
                  aria-pressed={editingPageSection === section.key}
                >
                  {section.label}
                </button>
              ))}
            </nav>

            {editingPageSection === 'builder' ? (
              <WixPageBuilder
                content={content}
                onChange={(page, canvas) => update(page === 'home' ? 'home.canvas' : `pageCanvases.${page}`, canvas)}
                onError={reportError}
              />
            ) : (
            <section className="editor-section">
              <header className="editor-section__header cms-editor__header">
                <div>
                  <span className="admin-section-kicker">CONTENU DU SITE</span>
                  <h2>{pageEditorSectionInfo.label}</h2>
                  <p>{pageEditorSectionInfo.description}</p>
                </div>
                <a
                  className="button button--outline button--small"
                  href={pageEditorSectionInfo.preview}
                  target="_blank"
                  rel="noreferrer"
                >
                  Voir la page publiée ↗
                </a>
              </header>
              <p className="cms-editor__help">
                Les modifications restent en brouillon dans cet écran. Cliquez sur « Enregistrer les modifications »
                pour les publier sur le site.
              </p>
              <EditorNode
                value={content[editingPageSection]}
                path={[editingPageSection]}
                onChange={update}
                onError={reportError}
              />
            </section>
            )}
          </div>
        )}

        {activeSection === 'gallery' && (
          <GalleryManager
            gallery={content.gallery}
            onChange={(gallery) => update('gallery', gallery)}
            onError={reportError}
          />
        )}

        {activeSection === 'inquiries' && (
          <InquiryManager
            onError={reportError}
          />
        )}

        {activeSection === 'crm' && <CRMManager onError={reportError} />}

        {activeSection === 'planning' && (
          <PlanningManager
            onError={reportError}
          />
        )}

        {activeSection === 'quotes' && (
          <QuoteManager
            branding={content.site}
            onError={reportError}
          />
        )}

        {activeSection === 'accounting' && (
          <AccountingManager
            branding={content.site}
            onError={reportError}
          />
        )}

        {/* Barre de sauvegarde */}
        {dirty && (
          <form className="content-editor" onSubmit={save}>
            <div className={`save-bar${saving ? ' is-saving' : ''}`} aria-busy={saving}>
              <span className="admin-save-state is-dirty" aria-live="polite">
                Modifications non enregistrées
              </span>
              <button
                className="button button--dark"
                type="submit"
                disabled={saving}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

/**
 * Composant de connexion
 */
function AdminLogin({ onAuthenticated, onError, initialError = '' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const login = useCallback(async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password')
        })
      });
      onAuthenticated();
    } catch (requestError) {
      setError(requestError.message);
      onError(requestError.message);
    } finally {
      setBusy(false);
    }
  }, [onAuthenticated, onError]);

  return (
    <main className="admin-login">
      <Link className="admin-back" to="/">
        ← Retour au site
      </Link>
      <form className="login-card" onSubmit={login}>
        <span className="eyebrow eyebrow--dark">Espace privé</span>
        <h1>Administration</h1>
        <label>
          Identifiant
          <input
            name="username"
            autoComplete="username"
            required
            disabled={busy}
          />
        </label>
        <label>
          Mot de passe
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        {error && (
          <p className="form-status form-status--error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button--dark"
          type="submit"
          disabled={busy}
        >
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}