const STYLE_ID = 'echostars-v188-upload-permission-layout-fix';

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /*
     * v188: The guest-visibility block is already marked by React with
     * data-upload-guest-visibility="true". The older presentation grid gave the
     * required-rank card an explicit two-row span but left this block on auto
     * placement, so on narrow screens both could land in the same grid area.
     * That visual overlap also blocked taps on the permission dropdown.
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
      #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
        grid-column: 1 !important;
        grid-row: 5 !important;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] {
        grid-column: 1 !important;
        grid-row: 6 !important;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-vip="1"] {
        grid-column: 1 !important;
        grid-row: 7 !important;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-cover-library="1"] {
        grid-column: 1 !important;
        grid-row: 8 !important;
      }
    }
  `;
  document.head.appendChild(style);
}
