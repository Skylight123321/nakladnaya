(function () {
  'use strict';

  const root = document.documentElement;
  const visual = window.visualViewport;
  let screenMode = 'calculator';
  history.scrollRestoration = 'manual';

  function update() {
    const frame = document.querySelector('#appHost iframe');
    const child = frame?.contentDocument;
    const atDefaultScale = visual && Math.abs(visual.scale - 1) < 0.01;
    const focused = document.activeElement === frame ? child?.activeElement : document.activeElement;
    const editing = focused?.matches(
      'textarea:not([readonly]), input:not([readonly]):is(:not([type]),[type=text],[type=search],[type=tel],[type=email],[type=url],[type=password],[type=number]), [contenteditable]:not([contenteditable="false"])'
    );
    // Pin the app to the browser's layout viewport. Mobile browser chrome can
    // change the visual viewport on its own, even without a software keyboard.
    const keyboard = atDefaultScale && editing && innerHeight - visual.height > 80;
    const offset = screenMode === 'app' && keyboard ? Math.max(0, visual.offsetTop) : 0;

    if (keyboard) {
      root.style.setProperty('--jaan-keyboard-height', visual.height + 'px');
    } else {
      root.style.removeProperty('--jaan-keyboard-height');
    }
    root.style.setProperty('--jaan-viewport-top', offset + 'px');

    const style = getComputedStyle(root);
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const inset = parseFloat(style.getPropertyValue('--jaan-env-' + side)) || 0;
      root.style.setProperty('--jaan-safe-' + side, inset + 'px');
      const appInset = keyboard && side === 'bottom' ? 0
        : side === 'top' ? Math.max(0, inset - offset) : inset;
      child?.documentElement?.style.setProperty('--jaan-safe-' + side, appInset + 'px');
    }

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
