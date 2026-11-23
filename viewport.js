(function () {
  'use strict';

  const root = document.documentElement;
  const visual = window.visualViewport;
  let screenMode = 'calculator';
  history.scrollRestoration = 'manual';

  function update() {
    const frame = document.querySelector('#appHost iframe');
    const child = frame?.contentDocument;
    const style = getComputedStyle(root);
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const inset = parseFloat(style.getPropertyValue('--jaan-env-' + side)) || 0;
      root.style.setProperty('--jaan-safe-' + side, inset + 'px');
      child?.documentElement?.style.setProperty('--jaan-safe-' + side, inset + 'px');
    }

    const atDefaultScale = visual && Math.abs(visual.scale - 1) < 0.01;
    const focused = document.activeElement === frame ? child?.activeElement : document.activeElement;
    const editing = focused?.matches(
      'textarea:not([readonly]), input:not([readonly]):not([type=button]):not([type=checkbox]):not([type=file]), [contenteditable="true"]'
    );
    // Keep the CSS viewport at normal size. A smaller visual viewport can
    // reflect system chrome, so only use it to fit an open software keyboard.
    const keyboard = atDefaultScale && editing && innerHeight - visual.height > 80;
    if (keyboard) {
      root.style.setProperty('--jaan-keyboard-height', visual.height + 'px');
    } else {
      root.style.removeProperty('--jaan-keyboard-height');
    }

    // Safari can pan the visual viewport without scrolling the document.
    // Move the app with that viewport while leaving the invoice's scroll alone.
    const offset = screenMode === 'app' && atDefaultScale ? Math.max(0, visual.offsetTop || 0) : 0;
    root.style.setProperty('--jaan-viewport-top', offset + 'px');
  }

  function mode(value) {
    screenMode = value;
    root.dataset.screen = value;
    root.style.colorScheme = value === 'app' ? 'light' : 'dark';
    const color = value === 'app' ? '#f6f7f9' : '#000000';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    update();
  }

  window.JaanViewport = { mode, update };
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => requestAnimationFrame(update));
  window.addEventListener('pageshow', () => mode(screenMode));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestAnimationFrame(update);
  });
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => requestAnimationFrame(update));
  visual?.addEventListener('resize', update);
  visual?.addEventListener('scroll', update);
  mode('calculator');
})();
