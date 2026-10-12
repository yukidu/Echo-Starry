const LEGACY_STYLE_ID = 'echostars-v188-upload-permission-layout-fix';
const STYLE_ID = 'echostars-v189-mobile-permission-layout-fix';

// Remove an older runtime layout patch if an already-open PWA tab still has it in memory.
document.getElementById(LEGACY_STYLE_ID)?.remove();
document.getElementById('echostars-v188b-upload-permission-layout-fix')?.remove();

let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
if (!style) {
  style = document.createElement('style');
  style.id = STYLE_ID;
  document.head.appendChild(style);
}

style.textContent = `
  /*
   * v189 hotfix: keep permission selector and visibility checkboxes in separate rows.
   * The older upload presentation policy flattens the field grid, so explicitly restore
   * stable rows and checkbox sizing to prevent overlap on mobile / enlarged fonts.
   */
  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
    grid-column: 5 / 7 !important;
    grid-row: 2 !important;
    align-self: stretch !important;
    display: block !important;
    min-width: 0 !important;
    margin: 0 !important;
    position: relative !important;
    inset: auto !important;
    transform: none !important;
    isolation: isolate !important;
    z-index: 3 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] > span,
  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] .relative.inline-block {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    position: relative !important;
    z-index: 4 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] button {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    position: relative !important;
    inset: auto !important;
    transform: none !important;
    pointer-events: auto !important;
    z-index: 5 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] {
    grid-column: 5 / 7 !important;
    grid-row: 3 !important;
    align-self: stretch !important;
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    position: relative !important;
    inset: auto !important;
    transform: none !important;
    isolation: isolate !important;
    z-index: 2 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] > div {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: .7rem !important;
    align-items: start !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] label {
    display: flex !important;
    align-items: center !important;
    gap: .65rem !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    position: relative !important;
    inset: auto !important;
    transform: none !important;
    line-height: 1.35 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] input[type="checkbox"] {
    width: 1.25rem !important;
    height: 1.25rem !important;
    min-width: 1.25rem !important;
    min-height: 1.25rem !important;
    max-width: 1.25rem !important;
    max-height: 1.25rem !important;
    flex: 0 0 1.25rem !important;
    margin: 0 !important;
    position: relative !important;
    inset: auto !important;
    transform: none !important;
  }

  @media (max-width: 767px) {
    #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
      grid-column: 1 / -1 !important;
      grid-row: 5 !important;
      width: 100% !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] {
      grid-column: 1 / -1 !important;
      grid-row: 6 !important;
      width: 100% !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-vip="1"] {
      grid-column: 1 / -1 !important;
      grid-row: 7 !important;
      width: 100% !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-library="1"] {
      grid-column: 1 / -1 !important;
      grid-row: 8 !important;
      width: 100% !important;
    }
  }
`;
