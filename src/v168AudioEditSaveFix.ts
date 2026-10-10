const EDITOR_SELECTOR = '.v161-track-editor-overlay';
const EDIT_FORM_ID = 'track-upload-form';

function editorFormForButton(button: HTMLButtonElement) {
  const editor = button.closest<HTMLElement>(EDITOR_SELECTOR);
  return editor?.querySelector<HTMLFormElement>(`form#${EDIT_FORM_ID}`) || null;
}

// v168: the audio editor is rendered through a portal while the original upload page
// remains mounted underneath it. Both UploadModal instances therefore contain the same
// legacy form id. A header button using form="track-upload-form" can submit the hidden
// background form instead of the visible editor form. Route the click to the form that
// belongs to the visible editor instance.
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>(
    `${EDITOR_SELECTOR} button[type="submit"][form="${EDIT_FORM_ID}"]`
  );
  if (!button || button.disabled) return;

  const form = editorFormForButton(button);
  if (!form) return;

  event.preventDefault();
  event.stopPropagation();
  form.requestSubmit();
}, true);
