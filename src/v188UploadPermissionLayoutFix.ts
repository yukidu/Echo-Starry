const LEGACY_STYLE_IDS = [
  'echostars-v188-upload-permission-layout-fix',
  'echostars-v188b-upload-permission-layout-fix',
  'echostars-v188c-upload-permission-layout-fix',
  'echostars-v188d-upload-permission-layout-fix'
];
const STYLE_ID = 'echostars-v188e-upload-permission-structural-fix';

LEGACY_STYLE_IDS.forEach(id => document.getElementById(id)?.remove());

let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
if (!style) {
  style = document.createElement('style');
  style.id = STYLE_ID;
  document.head.appendChild(style);
}

style.textContent = `
  /*
   * v188e structural fix:
   * 瀏覽權限與兩個可見性 checkbox 現在已由 React 放在同一個容器內。
   * 外層只負責整張權限卡的位置；內層 checkbox 使用正常文件流，不再指定 grid-row。
   */
  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
    grid-column: 5 / 7 !important;
    grid-row: 2 / span 2 !important;
    align-self: stretch !important;
    display: block !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    position: relative !important;
    inset: auto !important;
    transform: none !important;
    isolation: isolate !important;
    z-index: 3 !important;
    box-sizing: border-box !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] .relative.inline-block,
  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] > div:first-child > span {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] button {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    pointer-events: auto !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] [data-upload-guest-visibility="true"] {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    grid-column: auto !important;
    grid-row: auto !important;
    margin: 1rem 0 0 !important;
    padding: 1rem 0 0 !important;
    position: static !important;
    inset: auto !important;
    transform: none !important;
    z-index: auto !important;
    box-sizing: border-box !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] [data-upload-guest-visibility="true"] > div {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: .8rem !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] [data-upload-guest-visibility="true"] label {
    display: flex !important;
    align-items: center !important;
    gap: .65rem !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    position: static !important;
    line-height: 1.4 !important;
  }

  #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] [data-upload-guest-visibility="true"] input[type="checkbox"] {
    width: 1.25rem !important;
    height: 1.25rem !important;
    min-width: 1.25rem !important;
    min-height: 1.25rem !important;
    max-width: 1.25rem !important;
    max-height: 1.25rem !important;
    flex: 0 0 1.25rem !important;
    margin: 0 !important;
    position: static !important;
    transform: none !important;
  }

  @media (max-width: 767px) {
    #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
      grid-column: 1 / -1 !important;
      grid-row: 5 !important;
      width: 100% !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-vip="1"] {
      grid-column: 1 / -1 !important;
      grid-row: 6 !important;
      width: 100% !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-library="1"] {
      grid-column: 1 / -1 !important;
      grid-row: 7 !important;
      width: 100% !important;
    }
  }
`;
