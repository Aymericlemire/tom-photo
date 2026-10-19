import { useEffect, useId, useRef, useState } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export default function PdfPreviewModal({ file, onClose }) {
  const titleId = useId();
  const pagesRef = useRef(null);
  const [url, setUrl] = useState('');
  const [ready, setReady] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    setReady(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file.blob]);

  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return undefined;

    let cancelled = false;
    let loadingTask;
    let pdfDocument;
    container.replaceChildren();
    setReady(false);
    setPreviewError('');

    const renderPdf = async () => {
      try {
        const bytes = new Uint8Array(await file.blob.arrayBuffer());
        if (cancelled) return;
        const pdfjsLib = await import('pdfjs-dist');
        if (cancelled) return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjsLib.getDocument({ data: bytes });
        pdfDocument = await loadingTask.promise;

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdfDocument.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(1, container.clientWidth - 36);
          const scale = Math.min(1.5, availableWidth / baseViewport.width);
          const viewport = page.getViewport({ scale });
          const pixelRatio = window.devicePixelRatio || 1;
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Le navigateur ne peut pas afficher les pages de ce PDF.');

          canvas.width = Math.ceil(viewport.width * pixelRatio);
          canvas.height = Math.ceil(viewport.height * pixelRatio);
          canvas.style.width = `${Math.ceil(viewport.width)}px`;
          canvas.style.height = `${Math.ceil(viewport.height)}px`;
          canvas.setAttribute('aria-label', `Page ${pageNumber} sur ${pdfDocument.numPages}`);
          container.append(canvas);

          await page.render({
            canvasContext: context,
            viewport,
            transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0]
          }).promise;
        }
        if (!cancelled) setReady(true);
      } catch (error) {
        if (!cancelled) {
          setPreviewError(`L’aperçu de ce PDF n’a pas pu être affiché : ${error.message}`);
        }
      }
    };

    renderPdf();
    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [file.blob]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="pdf-preview-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="pdf-preview" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="pdf-preview__header">
          <div>
            <span className="admin-section-kicker">APERÇU DU DOCUMENT</span>
            <h2 id={titleId}>{file.fileName}</h2>
          </div>
          <div className="pdf-preview__actions">
            {url && <a className="button button--dark button--small" href={url} download={file.fileName}>Télécharger le PDF</a>}
            <button type="button" className="button button--outline button--small" onClick={onClose}>Fermer</button>
          </div>
        </header>
        <div className="pdf-preview__viewer">
          {!ready && <p className="pdf-preview__loading">Préparation de l’aperçu…</p>}
          {previewError && <p className="pdf-preview__error" role="alert">{previewError}</p>}
          <div className="pdf-preview__pages" ref={pagesRef} aria-label={`Pages du document ${file.fileName}`} />
        </div>
      </section>
    </div>
  );
}
