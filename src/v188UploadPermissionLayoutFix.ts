const STYLE_ID = 'echostars-v188-upload-permission-layout-fix';

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /*
     * v188: keep the required-rank selector and visibility checkboxes in
     * separate layout areas. The legacy presentation layer flattens the React
     * field grid with display: contents; on narrow screens that allowed the
     * checkbox block to paint over the selector and steal its taps.
     */
    #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
      grid-row: 2 !important;
      position: relative;
      z-index: 2;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] {
      grid-column: 5 / 7 !important;
      grid-row: 3 !important;
      align-self: stretch;
      margin: 0 !important;
      position: relative;
      z-index: 1;
    }

    @media (max-width: 767px) {
      /*
       * Mobile deliberately restores this React section as a real one-column
       * grid instead of flattening its children into the outer upload grid.
       * This makes the permission selector a true standalone row.
       */
      #track-upload-form[data-upload-presentation="1"] [data-upload-fields-grid="1"] {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        grid-column: 1 / -1 !important;
        grid-row: auto !important;
        gap: .75rem !important;
        width: 100% !important;
        min-width: 0 !important;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-fields-grid="1"] > * {
        grid-column: 1 / -1 !important;
        grid-row: auto !important;
        min-width: 0 !important;
        width: 100% !important;
      }

      /* First six normal fields stay in rows 1–6. */
      #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
        grid-column: 1 / -1 !important;
        grid-row: 7 !important;
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        position: relative !important;
        z-index: 3 !important;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] select,
      #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] button {
        width: 100% !important;
        min-width: 0 !important;
        position: relative !important;
        z-index: 4 !important;
        pointer-events: auto !important;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] {
        grid-column: 1 / -1 !important;
        grid-row: 8 !important;
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
        position: relative !important;
        z-index: 1 !important;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-vip="1"] {
        grid-column: 1 / -1 !important;
        grid-row: 9 !important;
        width: 100% !important;
        min-width: 0 !important;
      }

      /* Once the inner field grid is restored, the R2 library resumes normal
       * outer-form flow instead of competing for the same numbered rows. */
      #track-upload-form[data-upload-presentation="1"] [data-upload-cover-library="1"] {
        grid-column: 1 / -1 !important;
        grid-row: auto !important;
      }
    }
  `;
  document.head.appendChild(style);
}
