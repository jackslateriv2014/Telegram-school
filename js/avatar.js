/**
 * avatar.js — рисует аватар ученика кодом (SVG): персонаж + цвет + шапка + аксессуар + рамка.
 * Картинок нет — поэтому ничего не нужно хранить или скачивать. Avatar.svg(look, size).
 */
var Avatar = (function () {
  'use strict';
  var COLORS = {
    blue: ['#5B9BF0', '#3A78CF'], green: ['#4CB879', '#2F9160'], orange: ['#F29A4A', '#D47A2C'], pink: ['#F28BB4', '#D4658F'],
    purple: ['#9B7BEA', '#7A58CF'], mint: ['#4FD1C1', '#2EAE9F'], gold: ['#F2C14E', '#D49E22']
  };
  var LIGHT = '#FFF6EA', INK = '#2B2F3A', BLUSH = '#FF9BB0';
  var seq = 0;

  function eyes(y, dx) {
    dx = dx || 10;
    return '<circle cx="' + (50 - dx) + '" cy="' + y + '" r="4" fill="' + INK + '"/><circle cx="' + (50 + dx) + '" cy="' + y + '" r="4" fill="' + INK + '"/>' +
      '<circle cx="' + (51.5 - dx) + '" cy="' + (y - 1.5) + '" r="1.4" fill="#fff"/><circle cx="' + (51.5 + dx) + '" cy="' + (y - 1.5) + '" r="1.4" fill="#fff"/>';
  }
  function blush(y) {
    return '<ellipse cx="33" cy="' + y + '" rx="4.5" ry="2.8" fill="' + BLUSH + '" opacity=".7"/><ellipse cx="67" cy="' + y + '" rx="4.5" ry="2.8" fill="' + BLUSH + '" opacity=".7"/>';
  }
  function smile(y) { return '<path d="M45 ' + y + ' q5 4 10 0" stroke="' + INK + '" stroke-width="2" fill="none" stroke-linecap="round"/>'; }

  var CHARS = {
    cat: function (c, d) {
      return '<path d="M27 46 L31 20 L47 33 Z" fill="' + c + '"/><path d="M73 46 L69 20 L53 33 Z" fill="' + c + '"/>' +
        '<path d="M31 40 L33 27 L41 34 Z" fill="' + BLUSH + '" opacity=".6"/><path d="M69 40 L67 27 L59 34 Z" fill="' + BLUSH + '" opacity=".6"/>' +
        '<circle cx="50" cy="58" r="26" fill="' + c + '"/><ellipse cx="50" cy="67" rx="12" ry="8" fill="' + LIGHT + '"/>' +
        eyes(55) + blush(64) + '<path d="M47.5 63 h5 l-2.5 3 z" fill="' + BLUSH + '"/>' + smile(67) +
        '<path d="M24 62 h10 M24 67 l10 -2 M76 62 h-10 M76 67 l-10 -2" stroke="' + d + '" stroke-width="1.4" stroke-linecap="round"/>';
    },
    bear: function (c, d) {
      return '<circle cx="29" cy="37" r="9.5" fill="' + c + '"/><circle cx="71" cy="37" r="9.5" fill="' + c + '"/>' +
        '<circle cx="29" cy="37" r="4.5" fill="' + LIGHT + '"/><circle cx="71" cy="37" r="4.5" fill="' + LIGHT + '"/>' +
        '<circle cx="50" cy="58" r="26" fill="' + c + '"/><ellipse cx="50" cy="67" rx="12" ry="9" fill="' + LIGHT + '"/>' +
        eyes(54) + blush(63) + '<ellipse cx="50" cy="63.5" rx="4" ry="3" fill="' + INK + '"/>' + smile(67);
    },
    robot: function (c, d) {
      return '<line x1="50" y1="21" x2="50" y2="32" stroke="' + d + '" stroke-width="3"/><circle cx="50" cy="20" r="4.5" fill="#F2C14E"/>' +
        '<rect x="18" y="50" width="7" height="14" rx="3" fill="' + d + '"/><rect x="75" y="50" width="7" height="14" rx="3" fill="' + d + '"/>' +
        '<rect x="24" y="32" width="52" height="46" rx="12" fill="' + c + '"/><rect x="30" y="40" width="40" height="27" rx="8" fill="' + INK + '"/>' +
        '<rect x="36" y="48" width="9" height="8" rx="3" fill="#7FF0FF"/><rect x="55" y="48" width="9" height="8" rx="3" fill="#7FF0FF"/>' +
        '<path d="M43 61 q7 4 14 0" stroke="#7FF0FF" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
        '<circle cx="34" cy="72" r="2" fill="' + d + '"/><circle cx="66" cy="72" r="2" fill="' + d + '"/>';
    },
    fox: function (c, d) {
      return '<path d="M26 48 L28 16 L46 34 Z" fill="' + c + '"/><path d="M74 48 L72 16 L54 34 Z" fill="' + c + '"/>' +
        '<path d="M30 40 L31 25 L40 34 Z" fill="' + INK + '" opacity=".75"/><path d="M70 40 L69 25 L60 34 Z" fill="' + INK + '" opacity=".75"/>' +
        '<circle cx="50" cy="58" r="26" fill="' + c + '"/>' +
        '<path d="M24 60 Q36 58 50 72 Q64 58 76 60 Q72 82 50 84 Q28 82 24 60 Z" fill="' + LIGHT + '"/>' +
        eyes(54) + '<circle cx="50" cy="66" r="3.5" fill="' + INK + '"/>' + smile(70);
    },
    owl: function (c, d) {
      return '<path d="M26 40 L30 22 L42 34 Z" fill="' + d + '"/><path d="M74 40 L70 22 L58 34 Z" fill="' + d + '"/>' +
        '<circle cx="50" cy="58" r="27" fill="' + c + '"/><ellipse cx="50" cy="72" rx="14" ry="10" fill="' + LIGHT + '" opacity=".85"/>' +
        '<circle cx="39" cy="53" r="10" fill="#fff"/><circle cx="61" cy="53" r="10" fill="#fff"/>' +
        '<circle cx="40" cy="54" r="5" fill="' + INK + '"/><circle cx="60" cy="54" r="5" fill="' + INK + '"/>' +
        '<circle cx="41.5" cy="52.5" r="1.6" fill="#fff"/><circle cx="61.5" cy="52.5" r="1.6" fill="#fff"/>' +
        '<path d="M46 62 L54 62 L50 68 Z" fill="#F2A33A"/>';
    },
    astro: function (c, d) {
      return '<circle cx="50" cy="56" r="29" fill="#F4F6FA" stroke="#C9D1DE" stroke-width="2"/>' +
        '<rect x="44" y="20" width="12" height="7" rx="3" fill="#C9D1DE"/>' +
        '<ellipse cx="50" cy="57" rx="20" ry="16" fill="' + d + '"/>' +
        '<ellipse cx="50" cy="57" rx="17" ry="13" fill="' + c + '" opacity=".55"/>' +
        '<path d="M38 50 q4 -6 11 -6" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/>' +
        eyes(58, 8) + '<path d="M46 64 q4 3 8 0" stroke="' + INK + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<circle cx="24" cy="62" r="4" fill="#C9D1DE"/><circle cx="76" cy="62" r="4" fill="#C9D1DE"/>';
    },
    dragon: function (c, d) {
      return '<path d="M34 38 L30 18 L44 32 Z" fill="#FFE08A"/><path d="M66 38 L70 18 L56 32 Z" fill="#FFE08A"/>' +
        '<path d="M44 33 L50 24 L56 33 Z" fill="' + d + '"/>' +
        '<circle cx="50" cy="58" r="26" fill="' + c + '"/>' +
        '<ellipse cx="50" cy="69" rx="15" ry="9" fill="' + LIGHT + '" opacity=".9"/>' +
        '<circle cx="45" cy="67" r="1.6" fill="' + INK + '"/><circle cx="55" cy="67" r="1.6" fill="' + INK + '"/>' +
        eyes(53) + blush(61) + '<path d="M44 72 q6 4 12 0" stroke="' + INK + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M22 58 q-6 -4 -4 -12 q6 2 8 8 Z" fill="' + d + '"/><path d="M78 58 q6 -4 4 -12 q-6 2 -8 8 Z" fill="' + d + '"/>';
    }
  };

  var HATS = {
    cap: '<path d="M27 40 Q29 22 50 22 Q71 22 73 40 Z" fill="#E5534B"/><path d="M50 40 L84 40 Q84 45 76 45 L50 45 Z" fill="#C43C35"/>' +
      '<circle cx="50" cy="23" r="2.5" fill="#C43C35"/>',
    headphones: '<path d="M23 58 Q23 26 50 26 Q77 26 77 58" stroke="' + INK + '" stroke-width="5" fill="none"/>' +
      '<rect x="16" y="50" width="11" height="18" rx="5" fill="' + INK + '"/><rect x="73" y="50" width="11" height="18" rx="5" fill="' + INK + '"/>' +
      '<rect x="18" y="53" width="7" height="12" rx="3" fill="#FF6B8B"/><rect x="75" y="53" width="7" height="12" rx="3" fill="#FF6B8B"/>',
    wizard: '<path d="M30 38 L50 3 L70 38 Z" fill="#6B4FD8"/><rect x="26" y="34" width="48" height="7" rx="3.5" fill="#4E36B0"/>' +
      '<path d="M50 14 l2 4.5 5 .5 -3.8 3.2 1.2 4.8 -4.4 -2.6 -4.4 2.6 1.2 -4.8 -3.8 -3.2 5 -.5 z" fill="#F2C14E"/>',
    crown: '<path d="M30 38 L30 20 L40 29 L50 15 L60 29 L70 20 L70 38 Z" fill="#F2C14E" stroke="#D49E22" stroke-width="1.5"/>' +
      '<circle cx="50" cy="31" r="3" fill="#E5534B"/><circle cx="38" cy="33" r="2.2" fill="#4FA3F0"/><circle cx="62" cy="33" r="2.2" fill="#4CB879"/>',
    santa: '<path d="M28 38 Q34 14 56 14 Q74 16 82 34 L72 32 Q66 24 58 24 L72 38 Z" fill="#E5534B"/>' +
      '<rect x="25" y="33" width="50" height="9" rx="4.5" fill="#fff"/><circle cx="82" cy="34" r="5" fill="#fff"/>',
    flowers: [['32', '36', '#FF8FB1'], ['41', '30', '#FFD166'], ['50', '28', '#7BD389'], ['59', '30', '#8EC5FF'], ['68', '36', '#C79BFF']].map(function (f) {
      return '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="5.5" fill="' + f[2] + '"/><circle cx="' + f[0] + '" cy="' + f[1] + '" r="2" fill="#FFF3B0"/>';
    }).join('')
  };
  var ACCS = {
    glasses: '<circle cx="40" cy="55" r="8" fill="#fff" fill-opacity=".25" stroke="' + INK + '" stroke-width="2.5"/>' +
      '<circle cx="60" cy="55" r="8" fill="#fff" fill-opacity=".25" stroke="' + INK + '" stroke-width="2.5"/><path d="M48 55 h4" stroke="' + INK + '" stroke-width="2.5"/>',
    bowtie: '<path d="M50 84 L39 78 L39 90 Z" fill="#E5534B"/><path d="M50 84 L61 78 L61 90 Z" fill="#E5534B"/><circle cx="50" cy="84" r="3" fill="#C43C35"/>',
    scarf: '<path d="M28 78 Q50 90 72 78 L72 85 Q50 97 28 85 Z" fill="#E5534B"/><path d="M60 86 L66 99 L58 99 L55 88 Z" fill="#C43C35"/>' +
      '<path d="M36 83 l3 5 M46 86 l2 5 M56 86 l-1 5" stroke="#fff" stroke-width="2" opacity=".7"/>',
    medal: '<path d="M60 74 L64 84 L68 74" fill="#4FA3F0"/><circle cx="64" cy="87" r="6.5" fill="#F2C14E" stroke="#D49E22" stroke-width="1.5"/>' +
      '<path d="M64 84 l1 2.2 2.4.3 -1.8 1.6 .5 2.4 -2.1 -1.2 -2.1 1.2 .5 -2.4 -1.8 -1.6 2.4 -.3 z" fill="#fff"/>'
  };

  function frame(kind, id) {
    if (kind === 'silver') return '<circle cx="50" cy="50" r="47" fill="none" stroke="#B9C2CF" stroke-width="5"/><circle cx="50" cy="50" r="43.5" fill="none" stroke="#E6EBF2" stroke-width="1.5"/>';
    if (kind === 'goldframe') return '<circle cx="50" cy="50" r="47" fill="none" stroke="#E8B730" stroke-width="5.5"/><circle cx="50" cy="50" r="43" fill="none" stroke="#FFE39A" stroke-width="1.5"/>' +
      '<circle cx="50" cy="3.5" r="3" fill="#FFE39A"/>';
    if (kind === 'rainbow') return '<defs><linearGradient id="rb' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6B6B"/><stop offset=".25" stop-color="#FFD166"/>' +
      '<stop offset=".5" stop-color="#7BD389"/><stop offset=".75" stop-color="#4FA3F0"/><stop offset="1" stop-color="#B07CFF"/></linearGradient></defs>' +
      '<circle cx="50" cy="50" r="47" fill="none" stroke="url(#rb' + id + ')" stroke-width="6"/>';
    return '';
  }

  function svg(look, size) {
    look = look || {};
    var id = ++seq, col = COLORS[look.color] || COLORS.blue, draw = CHARS[look.char] || CHARS.cat;
    var bg = look.char === 'astro' ? '#E3E8FF' : col[0] + '33';
    return '<svg class="avatar" width="' + (size || 48) + '" height="' + (size || 48) + '" viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><clipPath id="av' + id + '"><circle cx="50" cy="50" r="48"/></clipPath></defs>' +
      '<circle cx="50" cy="50" r="48" fill="' + bg + '"/>' +
      '<g clip-path="url(#av' + id + ')">' + draw(col[0], col[1]) + (ACCS[look.acc] || '') + (HATS[look.hat] || '') + '</g>' +
      frame(look.frame, id) + '</svg>';
  }
  return { svg: svg, COLORS: COLORS };
})();
