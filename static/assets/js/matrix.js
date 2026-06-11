/* Draws a sparse binary parity-check matrix into #matrix and, unless the user
   prefers reduced motion, occasionally "flips" a bit — echoing the bit-flipping
   decoders the group studies. Purely decorative. */
(function () {
  var svg = document.getElementById('matrix');
  if (!svg) return;

  var COLS = 16, ROWS = 10, GAP = 4;
  var W = 320, H = 200;
  var cw = (W - (COLS - 1) * GAP) / COLS;
  var ch = (H - (ROWS - 1) * GAP) / ROWS;
  var SET_RATE = 0.18;          // sparsity of the parity-check matrix
  var cells = [];

  var ns = 'http://www.w3.org/2000/svg';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', (c * (cw + GAP)).toFixed(2));
      rect.setAttribute('y', (r * (ch + GAP)).toFixed(2));
      rect.setAttribute('width', cw.toFixed(2));
      rect.setAttribute('height', ch.toFixed(2));
      rect.setAttribute('rx', '2');
      var set = Math.random() < SET_RATE;
      paint(rect, set);
      svg.appendChild(rect);
      cells.push({ el: rect, set: set });
    }
  }

  function paint(el, set) {
    if (set) {
      // most set bits indigo, a few amber for accent
      el.setAttribute('fill', Math.random() < 0.18 ? 'var(--signal)' : 'var(--accent)');
      el.setAttribute('opacity', '1');
    } else {
      el.setAttribute('fill', 'var(--line)');
      el.setAttribute('opacity', '1');
    }
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  setInterval(function () {
    for (var k = 0; k < 2; k++) {
      var i = Math.floor(Math.random() * cells.length);
      cells[i].set = !cells[i].set;
      cells[i].el.style.transition = 'fill .5s ease, opacity .5s ease';
      paint(cells[i].el, cells[i].set);
    }
  }, 1400);
})();
