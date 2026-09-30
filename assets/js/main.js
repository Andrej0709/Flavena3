/* Flavena — interakcije */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var PRODUCTS = window.FLAVENA_PRODUCTS || [];
  var GROUPS = window.FLAVENA_GROUPS || {};
  var ICON = function (id, cls) { return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>'; };
  var productUrl = function (p) { return 'proizvod.html?p=' + p.slug; };

  /* ------------------------------------------------------------------
     Opruga kao CSS easing: kritično prigušena (damping 1.0, response 0.4s)
     x(t) = 1 − (1 + ωt)·e^(−ωt), ω = 2π / response
     ------------------------------------------------------------------ */
  try {
    if (window.CSS && CSS.supports('transition-timing-function', 'linear(0, 1)')) {
      var w = 2 * Math.PI / 0.4, T = 0.6, N = 36, pts = [];
      for (var i = 0; i <= N; i++) {
        var t = (i / N) * T;
        pts.push((1 - (1 + w * t) * Math.exp(-w * t)).toFixed(4));
      }
      pts[N] = '1';
      root.style.setProperty('--spring', 'linear(' + pts.join(', ') + ')');
    }
  } catch (e) { /* zadržava cubic-bezier rezervu */ }

  /* ------------------------------------------------------------------
     Fizička opruga za gestove (prekidljiva, nasleđuje brzinu)
     ------------------------------------------------------------------ */
  function spring(opts) {
    var response = opts.response || 0.4, damping = opts.damping == null ? 1 : opts.damping;
    var k = Math.pow(2 * Math.PI / response, 2);
    var c = 4 * Math.PI * damping / response;
    var x = opts.from, v = opts.velocity || 0, to = opts.to;
    var last = performance.now(), raf = 0, stopped = false;
    function step(now) {
      if (stopped) return;
      var dt = Math.min(0.064, (now - last) / 1000); last = now;
      var n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (var j = 0; j < n; j++) { var a = -k * (x - to) - c * v; v += a * h; x += v * h; }
      if (Math.abs(v) < 2 && Math.abs(x - to) < 0.5) { opts.onUpdate(to); if (opts.onDone) opts.onDone(); return; }
      opts.onUpdate(x);
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return { stop: function () { stopped = true; cancelAnimationFrame(raf); } };
  }
  // Apple projekcija zamaha: gde bi se element zaustavio posle "bacanja"
  function project(v, d) { d = d || 0.998; return (v / 1000) * d / (1 - d); }
  function rubberband(over, dim) { var c = 0.55; return (over * dim * c) / (dim + c * Math.abs(over)); }

  /* ------------------------------------------------------------------
     Liste proizvoda (mega meni, mobilni meni, podnožje)
     ------------------------------------------------------------------ */
  function byGroup(g) { return PRODUCTS.filter(function (p) { return p.group === g; }); }

  $$('[data-mega-list]').forEach(function (ul) {
    ul.innerHTML = byGroup(ul.getAttribute('data-mega-list')).map(function (p) {
      return '<li><a href="' + productUrl(p) + '"><span class="mega__thumb"><img src="' + p.thumb + '" alt="" loading="lazy" width="38" height="38"></span>' + p.title + '</a></li>';
    }).join('');
  });
  $$('[data-link-list]').forEach(function (ul) {
    ul.innerHTML = byGroup(ul.getAttribute('data-link-list')).map(function (p) {
      return '<li><a href="' + productUrl(p) + '">' + p.title + '</a></li>';
    }).join('');
  });

  /* ------------------------------------------------------------------
     Zaglavlje: stanje pri skrolu + dugme "na vrh"
     ------------------------------------------------------------------ */
  var header = $('.site-header');
  var toTop = $('.to-top');
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (toTop) toTop.classList.toggle('is-visible', y > 900);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  });

  /* ------------------------------------------------------------------
     Mega meni
     ------------------------------------------------------------------ */
  var megaItem = $('.nav-item--mega');
  if (megaItem) {
    var trigger = $('.nav__link', megaItem);
    var closeTimer = 0;
    var setMega = function (open) {
      megaItem.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', String(open));
    };
    if (window.matchMedia('(hover: hover)').matches) {
      megaItem.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(closeTimer); setMega(true);
      });
      megaItem.addEventListener('pointerleave', function (e) {
        if (e.pointerType !== 'mouse') return;
        closeTimer = setTimeout(function () { setMega(false); }, 140);
      });
    }
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      setMega(!megaItem.classList.contains('is-open'));
    });
    document.addEventListener('click', function (e) { if (!megaItem.contains(e.target)) setMega(false); });
    megaItem.addEventListener('focusout', function (e) { if (!megaItem.contains(e.relatedTarget)) setMega(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && megaItem.classList.contains('is-open')) { setMega(false); trigger.focus(); }
    });
  }

  /* ------------------------------------------------------------------
     Mobilni meni — sheet sa prevlačenjem, projekcijom zamaha i oprugom
     ------------------------------------------------------------------ */
  var sheet = $('.sheet'), scrim = $('.scrim'), menuBtn = $('.menu-btn');
  if (sheet && scrim && menuBtn) {
    var sheetX = 0, anim = null, isOpen = false, drag = null, suppressClick = false;
    var width = function () { return sheet.offsetWidth || 360; };
    var render = function (x) {
      sheetX = x;
      sheet.style.transform = 'translate3d(' + x + 'px,0,0)';
      scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - x / width())));
    };
    var animateTo = function (target, velocity, done) {
      if (anim) anim.stop();
      if (reduceMotion.matches) { render(target); if (done) done(); return; }
      anim = spring({ from: sheetX, to: target, velocity: velocity || 0, damping: 1, response: 0.38, onUpdate: render, onDone: done });
    };
    var openSheet = function () {
      if (isOpen) return;
      isOpen = true;
      sheet.classList.add('is-active'); scrim.classList.add('is-active');
      sheet.setAttribute('aria-hidden', 'false');
      menuBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('sheet-open');
      if (!anim) render(width());
      animateTo(0, 0);
      var first = $('a, button, summary', sheet); if (first) first.focus({ preventScroll: true });
    };
    var closeSheet = function (velocity, restoreFocus) {
      if (!isOpen) return;
      isOpen = false;
      menuBtn.setAttribute('aria-expanded', 'false');
      sheet.setAttribute('aria-hidden', 'true');
      animateTo(width(), velocity || 0, function () {
        anim = null;
        if (!isOpen) {
          sheet.classList.remove('is-active'); scrim.classList.remove('is-active');
          document.body.classList.remove('sheet-open');
        }
      });
      if (restoreFocus !== false) menuBtn.focus({ preventScroll: true });
    };

    menuBtn.addEventListener('click', openSheet);
    scrim.addEventListener('click', function () { closeSheet(0); });
    $$('[data-sheet-close]', sheet).forEach(function (b) { b.addEventListener('click', function () { closeSheet(0); }); });
    $$('a[href]', sheet).forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (suppressClick) { e.preventDefault(); return; }
        closeSheet(0, false);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') closeSheet(0);
      if (e.key === 'Tab') {
        var f = $$('a[href], button:not([disabled]), summary', sheet).filter(function (el) { return el.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });

    // Prevlačenje udesno zatvara; prati prst 1:1, gumeno opiranje ulevo
    sheet.addEventListener('pointerdown', function (e) {
      if (!isOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, start: sheetX, active: false, hist: [{ x: e.clientX, t: e.timeStamp }] };
    });
    sheet.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.active) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          drag.active = true;
          if (anim) { anim.stop(); anim = null; }
          drag.start = sheetX;
          try { sheet.setPointerCapture(e.pointerId); } catch (err) {}
        } else {
          if (Math.abs(dy) > 10) drag = null;
          return;
        }
      }
      var x = drag.start + (e.clientX - drag.x0);
      if (x < 0) x = -rubberband(-x, width());
      render(x);
      drag.hist.push({ x: e.clientX, t: e.timeStamp });
      if (drag.hist.length > 6) drag.hist.shift();
    });
    var endDrag = function () {
      if (!drag) return;
      var d = drag; drag = null;
      if (!d.active) return;
      suppressClick = true; setTimeout(function () { suppressClick = false; }, 0);
      var a = d.hist[0], b = d.hist[d.hist.length - 1];
      var v = b.t - a.t > 0 ? (b.x - a.x) / ((b.t - a.t) / 1000) : 0;
      var projected = sheetX + project(v);
      if (projected > width() / 2) closeSheet(v); else animateTo(0, v);
    };
    sheet.addEventListener('pointerup', endDrag);
    sheet.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', function () { if (!isOpen && !anim) render(width()); });
  }

  /* ------------------------------------------------------------------
     Početna: mreža proizvoda + filter
     ------------------------------------------------------------------ */
  var grid = $('[data-products-grid]');
  if (grid) {
    grid.innerHTML = PRODUCTS.map(function (p, i) {
      return '<li data-group="' + p.group + '" class="reveal" style="--d:' + (i % 4) + ';view-transition-name:pc-' + i + '">' +
        '<a class="pcard" href="' + productUrl(p) + '">' +
          '<div class="pcard__media"><img src="' + p.thumb + '" alt="' + p.title + '" loading="lazy" width="540" height="540"></div>' +
          '<div class="pcard__body"><div><span class="pcard__tag">' + GROUPS[p.group] + '</span><h3>' + p.title + '</h3></div>' +
          '<span class="pcard__arrow">' + ICON('arrow-right') + '</span></div>' +
        '</a></li>';
    }).join('') +
      // Kartica-poziv popunjava ostatak poslednjeg reda, pa mreža nikad nema "rupu"
      '<li class="grid-cta reveal" data-cta style="view-transition-name:pc-cta">' +
        '<a class="gcta" href="#kontakt" data-topic="korisnicki-servis">' +
          '<span class="eyebrow">Rešenja po meri</span>' +
          '<h3>Ne vidite aromu koju tražite?</h3>' +
          '<p>Na specifične zahteve nabavljamo i uvozimo arome iz kompletne AKRAS palete.</p>' +
          '<span class="link-more">Pošaljite upit' + ICON('arrow-right') + '</span>' +
        '</a></li>';

    var cta = $('[data-cta]', grid);
    var fitCta = function () {
      var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      var visible = $$('li[data-group]', grid).filter(function (li) { return !li.hidden; }).length;
      var rem = visible % cols;
      var span = rem === 0 ? cols : cols - rem;
      cta.style.gridColumn = 'span ' + span;
      cta.classList.toggle('is-wide', span > 1);
    };
    fitCta();
    window.addEventListener('resize', fitCta);

    var seg = $('.segmented');
    if (seg) {
      var pill = $('.segmented__pill', seg);
      var btns = $$('button', seg);
      var counts = { sve: PRODUCTS.length, pica: byGroup('pica').length, hrana: byGroup('hrana').length };
      btns.forEach(function (b) { var c = $('span', b); if (c) c.textContent = counts[b.dataset.filter]; });

      var movePill = function (btn, instant) {
        var r = btn.getBoundingClientRect(), pr = seg.getBoundingClientRect();
        if (instant) pill.style.transition = 'none';
        pill.style.width = r.width + 'px';
        pill.style.transform = 'translateX(' + (r.left - pr.left - 1) + 'px)';
        if (instant) { void pill.offsetWidth; pill.style.transition = ''; }
      };
      var applyFilter = function (f) {
        var items = $$('li[data-group]', grid);
        var run = function () {
          items.forEach(function (li) {
            li.hidden = !(f === 'sve' || li.dataset.group === f);
            li.classList.add('is-in');
          });
          cta.classList.add('is-in');
          fitCta();
        };
        if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(run);
        else run();
      };
      var select = function (btn) {
        if (btn.getAttribute('aria-pressed') === 'true') return;
        btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        movePill(btn);
        applyFilter(btn.dataset.filter);
      };
      btns.forEach(function (b) {
        // Reaguje već na pritisak (miš), klik pokriva tastaturu i dodir
        b.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button === 0) select(b); });
        b.addEventListener('click', function () { select(b); });
      });
      var active = function () { return $('[aria-pressed="true"]', seg) || btns[0]; };
      movePill(active(), true);
      window.addEventListener('resize', function () { movePill(active(), true); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { movePill(active(), true); });
    }
  }

  /* ------------------------------------------------------------------
     Stranica proizvoda
     ------------------------------------------------------------------ */
  var page = $('[data-product-page]');
  if (page && PRODUCTS.length) {
    var slug = new URLSearchParams(location.search).get('p');
    var idx = PRODUCTS.findIndex(function (p) { return p.slug === slug; });
    if (idx < 0) idx = 0;
    var p = PRODUCTS[idx];
    var prev = PRODUCTS[(idx - 1 + PRODUCTS.length) % PRODUCTS.length];
    var next = PRODUCTS[(idx + 1) % PRODUCTS.length];

    document.title = p.title + ' – Flavena';
    var md = $('meta[name="description"]'); if (md) md.setAttribute('content', p.short + ' Zvanični distributer AKRAS aroma za Srbiju i region.');

    $('[data-p="group"]').textContent = GROUPS[p.group];
    $('[data-p="crumb"]').textContent = p.title;
    $('[data-p="title"]').textContent = p.title;
    $('[data-p="tagline"]').textContent = p.tagline;
    $('[data-p="intro"]').textContent = p.intro;
    var img = $('[data-p="image"]'); img.src = p.image; img.alt = p.title;
    $$('[data-p="inquiry"]').forEach(function (a) { a.href = 'index.html?tema=' + p.slug + '#kontakt'; });

    $('[data-p="sections"]').innerHTML = p.sections.map(function (s, i) {
      var html = '<section class="reveal"><h2><span class="n">0' + (i + 1) + '</span>' + s.h + '</h2>';
      html += s.p.map(function (t) { return '<p>' + t + '</p>'; }).join('');
      if (s.list) {
        if (s.listTitle) html += '<h3>' + s.listTitle + '</h3>';
        html += '<ul class="chips">' + s.list.map(function (l) { return '<li>' + ICON('check') + '<span>' + l + '</span></li>'; }).join('') + '</ul>';
      }
      return html + '</section>';
    }).join('');

    var nav = $('[data-p="catnav"]');
    nav.innerHTML = Object.keys(GROUPS).map(function (g) {
      return '<h4>' + GROUPS[g] + '</h4><ul class="cat-list">' + byGroup(g).map(function (x) {
        return '<li><a href="' + productUrl(x) + '"' + (x === p ? ' aria-current="page"' : '') + '><span>' + x.title + '</span>' + ICON('chevron-right') + '</a></li>';
      }).join('') + '</ul>';
    }).join('');

    $('[data-p="pager"]').innerHTML =
      '<a href="' + productUrl(prev) + '" class="prev"><small>' + ICON('arrow-left') + 'Prethodna</small><strong>' + prev.title + '</strong></a>' +
      '<a href="' + productUrl(next) + '" class="next"><small>Sledeća' + ICON('arrow-right') + '</small><strong>' + next.title + '</strong></a>';
  }

  /* ------------------------------------------------------------------
     Kontakt forma: validacija u toku unosa + priprema emaila
     ------------------------------------------------------------------ */
  var form = $('#contact-form');
  if (form) {
    var topic = form.elements.tema;
    var og = document.createElement('optgroup');
    og.label = 'Proizvodi';
    PRODUCTS.forEach(function (x) { var o = document.createElement('option'); o.value = x.slug; o.textContent = x.title; og.appendChild(o); });
    topic.appendChild(og);

    var preset = new URLSearchParams(location.search).get('tema');
    if (preset && $('option[value="' + preset + '"]', topic)) topic.value = preset;

    $$('[data-topic]').forEach(function (a) {
      a.addEventListener('click', function () {
        topic.value = a.getAttribute('data-topic');
        setTimeout(function () { form.elements.ime.focus({ preventScroll: true }); }, reduceMotion.matches ? 0 : 450);
      });
    });

    var rules = {
      ime: function (v) { return v.trim().length >= 2 || 'Unesite ime i prezime.'; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Unesite ispravnu email adresu.'; }
    };
    var check = function (input) {
      var rule = rules[input.name]; if (!rule) return true;
      var res = rule(input.value);
      var field = input.closest('.field');
      var ok = res === true;
      field.classList.toggle('is-invalid', !ok);
      input.setAttribute('aria-invalid', String(!ok));
      $('.field__error', field).textContent = ok ? '' : res;
      return ok;
    };
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      input.addEventListener('blur', function () { if (input.value) check(input); });
      input.addEventListener('input', function () { if (input.closest('.field').classList.contains('is-invalid')) check(input); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = Object.keys(rules).map(function (n) { return check(form.elements[n]) ? null : form.elements[n]; }).filter(Boolean);
      if (bad.length) { bad[0].focus(); return; }
      var t = topic.options[topic.selectedIndex].text;
      var subject = 'Upit sa sajta: ' + t;
      var body = form.elements.poruka.value + '\n\n—\n' + form.elements.ime.value + '\n' + form.elements.email.value;
      // TODO: zameniti pravim slanjem (npr. PHP skripta ili Formspree) pri objavi sajta
      window.location.href = 'mailto:flavena.doo@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      var status = $('.form__status', form);
      status.classList.add('is-visible');
    });
  }

  /* ------------------------------------------------------------------
     Aktivna stavka navigacije prema sekciji (orijentacija)
     ------------------------------------------------------------------ */
  var spyLinks = $$('.nav__list a[href^="#"], .nav__list a[href^="index.html#"]');
  if (spyLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    spyLinks.forEach(function (a) { var id = a.getAttribute('href').split('#')[1]; var s = document.getElementById(id); if (s) map[id] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = map[en.target.id]; if (!a) return;
        if (en.isIntersecting) { spyLinks.forEach(function (l) { l.removeAttribute('aria-current'); }); a.setAttribute('aria-current', 'true'); }
        else if (a.getAttribute('aria-current')) a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { spy.observe(document.getElementById(id)); });
  }

  /* ------------------------------------------------------------------
     Pojavljivanje pri skrolu
     ------------------------------------------------------------------ */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ------------------------------------------------------------------
     Hero: blagi paralaks prema pokazivaču (samo precizni pokazivač)
     ------------------------------------------------------------------ */
  var hero = $('.hero'), visual = $('.hero__visual');
  if (hero && visual && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion.matches) {
    var tx = 0, ty = 0, cx = 0, cy = 0, praf = 0;
    var tick = function () {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      visual.style.setProperty('--px', cx.toFixed(4));
      visual.style.setProperty('--py', cy.toFixed(4));
      praf = (Math.abs(tx - cx) > 0.0005 || Math.abs(ty - cy) > 0.0005) ? requestAnimationFrame(tick) : 0;
    };
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      if (!praf) praf = requestAnimationFrame(tick);
    });
    hero.addEventListener('pointerleave', function () { tx = 0; ty = 0; if (!praf) praf = requestAnimationFrame(tick); });
  }

  /* Godina u podnožju */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
