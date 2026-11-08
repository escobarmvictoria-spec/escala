// Altura de la banda «Demo — no es un seguro real»: el header fijo se coloca justo debajo.
// La portada lo calcula en app.js; las páginas secundarias cargan solo este script.
(() => {
  const set = () => {
    const band = document.querySelector('.demo-band');
    document.documentElement.style.setProperty('--band-h', `${band ? band.offsetHeight : 0}px`);
  };
  set();
  addEventListener('resize', set);
  addEventListener('load', set);
})();
