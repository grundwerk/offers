/* =========================================================================
   WarmedIn Konkurrenz-Posting-Raster — raster.js
   Vanilla JS, 0 dependencies, IIFE. Reads window.WARMEDIN_RASTER, builds the
   complete widget into #warmedin-raster: lead calendar + competitor calendar
   with tabs + stats bar + FOMO line + click-overlay. Replicates the visual
   design of sections/competitor-calendar.html, now from real data.
   ========================================================================= */
(function () {
  'use strict';

  var mount = document.getElementById('warmedin-raster');
  var DATA = window.WARMEDIN_RASTER;
  if (!mount || !DATA) return; // silently bail — no crash

  var lead = DATA.lead;
  if (!lead) return; // no lead -> nothing to show

  var competitors = Array.isArray(DATA.competitors) ? DATA.competitors : [];
  var windowDays = (typeof DATA.window_days === 'number' && DATA.window_days > 0) ? DATA.window_days : 30;
  var assetBase = (typeof DATA.asset_base === 'string') ? DATA.asset_base : '';
  var todayStr = DATA.today;

  /* ---------------------------------------------------------------------
     HELPERS
     --------------------------------------------------------------------- */

  // XSS-safe escape for any string going into innerHTML.
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Format number: 1234 -> "1,2K", < 1000 stays plain.
  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'K';
    return String(n);
  }

  // Parse "YYYY-MM-DD" -> UTC Date (avoids timezone day-shift).
  function parseDate(s) {
    if (!s || typeof s !== 'string') return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }

  function addDays(d, n) {
    var c = new Date(d.getTime());
    c.setUTCDate(c.getUTCDate() + n);
    return c;
  }

  function isoOf(d) {
    var y = d.getUTCFullYear();
    var mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    var da = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da;
  }

  // Weekday with Monday=0 ... Sunday=6.
  function mondayIndex(d) {
    return (d.getUTCDay() + 6) % 7;
  }

  var MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  function prettyDate(d) {
    return d.getUTCDate() + '. ' + MONTHS_DE[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
  }

  function photoUrl(person) {
    if (!person || !person.photo) return '';
    return assetBase + person.photo;
  }

  // ---- Window setup: rolling windowDays ending on `today` ----
  var end = parseDate(todayStr) || new Date();
  var start = addDays(end, -(windowDays - 1));
  var startOffset = mondayIndex(start); // leading empty cells

  // Build the ordered list of dates in the window.
  var windowDates = [];
  for (var di = 0; di < windowDays; di++) windowDates.push(addDays(start, di));

  // Month label.
  function monthLabel() {
    var sM = start.getUTCMonth(), sY = start.getUTCFullYear();
    var eM = end.getUTCMonth(), eY = end.getUTCFullYear();
    if (sM === eM && sY === eY) return MONTHS_DE[sM] + ' ' + sY;
    if (sY === eY) return MONTHS_DE[sM] + ' – ' + MONTHS_DE[eM] + ' ' + eY;
    return MONTHS_DE[sM] + ' ' + sY + ' – ' + MONTHS_DE[eM] + ' ' + eY;
  }

  // Group a person's posts by ISO date; per day keep the post with most reactions.
  function buildPostMap(person) {
    var map = {};
    var posts = Array.isArray(person.posts) ? person.posts : [];
    posts.forEach(function (p) {
      if (!p || !p.date) return;
      var key = p.date.slice(0, 10);
      var existing = map[key];
      if (!existing || (Number(p.reactions) || 0) > (Number(existing.reactions) || 0)) {
        map[key] = p;
      }
    });
    return map;
  }

  /* ---------------------------------------------------------------------
     SVG SNIPPETS (from reference)
     --------------------------------------------------------------------- */
  var LI_SVG = '<svg viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<text x="0" y="12" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="white">in</text>'
    + '</svg>';
  var THUMB_SVG = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M2 14V7h2.5L7 2l1 .5v3.5h5l.5 1-1.5 7H2z" fill="#0A66C2"/></svg>';
  var HEART_SVG = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M8 13.5C8 13.5 2 9.5 2 5.5a3 3 0 016 0 3 3 0 016 0c0 4-6 8-6 8z" fill="#df704d"/></svg>';
  var COMMENT_SVG = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M2 2h12v9H9l-3 3V11H2V2z" stroke="#9ca3af" stroke-width="1.5" fill="none"/></svg>';
  var REPOST_SVG = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M3 6l2-2 2 2M5 4v5a2 2 0 002 2h3M13 10l-2 2-2-2M11 12V7a2 2 0 00-2-2H6" '
    + 'stroke="#4b5563" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Avatar HTML with onerror -> initials fallback.
  function avatarHtml(cls, person, sizeFont) {
    var url = photoUrl(person);
    var color = esc(person.color || '#0A66C2');
    var initials = esc(person.initials || (firstName(person.name).slice(0, 2).toUpperCase()) || '?');
    var inner;
    if (url) {
      inner = '<img src="' + esc(url) + '" alt="' + esc(firstName(person.name)) + '" '
        + 'onerror="this.style.display=&#39;none&#39;;this.parentNode.textContent=this.parentNode.getAttribute(&#39;data-ini&#39;);">';
    } else {
      inner = esc(person.initials || initials);
    }
    return '<div class="' + cls + '" data-ini="' + initials + '" style="background:' + color + ';">' + inner + '</div>';
  }

  /* ---------------------------------------------------------------------
     MINI POST CARD
     --------------------------------------------------------------------- */
  function miniPostCard(person, post, dayNum) {
    var reactions = Number(post.reactions) || 0;
    var comments = Number(post.comments) || 0;
    var av = avatarHtml('wr-mini-avatar', person, 5);

    var head = '<div class="wr-mini-post-head">' + av
      + '<div class="wr-mini-name-block">'
        + '<div class="wr-mini-name">' + esc(firstName(person.name)) + '</div>'
        + '<div class="wr-mini-subline">' + esc(person.company || '') + '</div>'
      + '</div>'
      + '<div class="wr-mini-li-badge">' + LI_SVG + '</div>'
      + '</div>';

    var body = '<div class="wr-mini-post-body">' + esc(post.text || '') + '</div>';

    var foot = '<div class="wr-mini-post-foot">'
      + '<div class="wr-mini-reactions">'
        + '<div class="wr-mini-reaction-icon">' + THUMB_SVG + '</div>'
        + '<div class="wr-mini-reaction-icon">' + HEART_SVG + '</div>'
        + '<span class="wr-mini-reaction-count">' + fmtNum(reactions) + '</span>'
      + '</div>'
      + '<div class="wr-mini-comment-wrap">'
        + '<span class="wr-mini-comment-icon">' + COMMENT_SVG + '</span>'
        + '<span class="wr-mini-comment-count">' + esc(fmtNum(comments)) + '</span>'
      + '</div>'
      + '</div>';

    return '<span class="wr-post-day-num">' + dayNum + '</span>'
      + '<div class="wr-mini-post">' + head + body + foot + '</div>';
  }

  /* ---------------------------------------------------------------------
     RENDER A CALENDAR GRID for a person, into the given .wr-cal-days element.
     `who` = 'lead' | competitor-slug, used as data-person on has-post cells.
     --------------------------------------------------------------------- */
  function renderCalendarDays(el, person, who, animate) {
    var postMap = buildPostMap(person);

    function draw() {
      var html = '';
      for (var i = 0; i < startOffset; i++) html += '<div class="wr-cal-day wr-empty"></div>';
      windowDates.forEach(function (d) {
        var iso = isoOf(d);
        var dayNum = d.getUTCDate();
        var post = postMap[iso];
        if (post) {
          html += '<div class="wr-cal-day wr-has-post" data-person="' + esc(who) + '" data-date="' + iso + '" '
            + 'title="Post am ' + dayNum + '. ' + MONTHS_DE[d.getUTCMonth()] + '" role="button" tabindex="0">'
            + miniPostCard(person, post, dayNum)
            + '</div>';
        } else {
          html += '<div class="wr-cal-day wr-no-post">' + dayNum + '</div>';
        }
      });
      el.innerHTML = html;
      if (animate) {
        // force reflow then fade/scale back in
        void el.offsetHeight;
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
      }
    }

    if (animate) {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.96)';
      setTimeout(draw, 200);
    } else {
      draw();
    }
  }

  /* ---------------------------------------------------------------------
     POST LOOKUP for overlay (person-slug + ISO date -> chosen post)
     --------------------------------------------------------------------- */
  var postMaps = {}; // who -> {iso: post}
  function postMapFor(person, who) {
    if (!postMaps[who]) postMaps[who] = buildPostMap(person);
    return postMaps[who];
  }
  function personByWho(who) {
    if (who === 'lead') return lead;
    return competitors.find(function (c) { return c.slug === who; }) || null;
  }

  /* ---------------------------------------------------------------------
     BUILD STATIC STRUCTURE
     --------------------------------------------------------------------- */
  var hasComp = competitors.length > 0;
  var activeComp = hasComp ? competitors[0] : null;

  // Format a 1-decimal "x" multiplier with German comma.
  function multStr(num, denom) {
    return (num / Math.max(denom, 1)).toFixed(1).replace('.', ',') + 'x';
  }

  // Average reactions (likes) per post for a person, rounded to a whole number.
  function avgLikes(person) {
    var posts = (person && Array.isArray(person.posts)) ? person.posts : [];
    if (!posts.length) return 0;
    var sum = 0;
    for (var i = 0; i < posts.length; i++) sum += (Number(posts[i].reactions) || 0);
    return Math.round(sum / posts.length);
  }

  /* Adaptive framing — the "Zwei Gates" logic.
     Decides per active competitor whether the comparison is framed negatively
     (competitor posts MORE -> yellow/FOMO) or positively (lead posts
     same/more -> green/positive).
     Returns:
       tone:      'yellow' | 'green'
       ratioNum:  the "Nx" string shown in the highlighted pill/stat
       fomoText:  full sentence for the FOMO line ("Deine Konkurrenz postet" / "Du postest")
       statLabel: label under the stat-ratio tile
       leadVsName: short connector used in the FOMO pill                           */
  function frameFor(comp) {
    var leadTotal = Number(lead.total) || 0;
    var compTotal = Number(comp.total) || 0;
    if (compTotal > leadTotal) {
      // Competitor posts more -> keep the FOMO (yellow) framing.
      return {
        tone: 'yellow',
        ratioNum: multStr(compTotal, leadTotal),
        fomoLead: 'Deine Konkurrenz postet',
        fomoTrail: 'öfter',
        statLabel: 'mehr LinkedIn-Sichtbarkeit'
      };
    }
    // Lead posts same or more -> positive (green) framing.
    if (compTotal === 0) {
      return {
        tone: 'green',
        ratioNum: '',
        fomoLead: 'Du bist aktiv, ' + (firstName(comp.name) || comp.name) + ' nicht',
        fomoTrail: '',
        statLabel: 'mehr LinkedIn-Sichtbarkeit als ' + (firstName(comp.name) || comp.name)
      };
    }
    return {
      tone: 'green',
      ratioNum: multStr(leadTotal, compTotal),
      fomoLead: 'Du postest',
      fomoTrail: 'öfter',
      statLabel: 'mehr LinkedIn-Sichtbarkeit als ' + (firstName(comp.name) || comp.name)
    };
  }

  // Back-compat thin wrapper (still used by the competitor's own ratio display).
  function ratioStr(comp) {
    return frameFor(comp).ratioNum || '–';
  }

  function weekdaysHtml() {
    var wd = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    return '<div class="wr-cal-weekdays">'
      + wd.map(function (w) { return '<div class="wr-cal-wd">' + w + '</div>'; }).join('')
      + '</div>';
  }

  var leadFirst = esc(firstName(lead.name));

  // ---- FOMO header ----
  var fomoHtml = '<div class="wr-fomo-header">'
    + '<span class="wr-fomo-eyebrow">LinkedIn-Aktivität im Vergleich</span>'
    + '<h2 class="wr-fomo-headline">'
      + '<span class="wr-name-lead">' + esc(lead.name) + ': ' + (Number(lead.total) || 0) + ' Posts</span>';
  if (hasComp) {
    fomoHtml += '&nbsp; vs &nbsp;'
      + '<span class="wr-name-comp" id="wr-fomo-comp-name">' + esc(activeComp.name) + ': ' + (Number(activeComp.total) || 0) + ' Posts</span>';
  }
  fomoHtml += '<br>in den letzten ' + windowDays + ' Tagen</h2>';
  if (hasComp) {
    var fr0 = frameFor(activeComp);
    fomoHtml += '<div class="wr-fomo-ratio' + (fr0.tone === 'green' ? ' wr-tone-green' : '') + '" id="wr-fomo-ratio-pill">'
      + '<span id="wr-fomo-lead">' + esc(fr0.fomoLead) + '</span>'
      + (fr0.ratioNum ? '<span class="wr-ratio-num" id="wr-fomo-ratio">' + fr0.ratioNum + '</span>' : '<span class="wr-ratio-num" id="wr-fomo-ratio" style="display:none"></span>')
      + '<span id="wr-fomo-trail">' + esc(fr0.fomoTrail) + '</span>'
      + '</div>';
  }
  fomoHtml += '</div>';

  // ---- Tabs ----
  var tabsHtml = '';
  if (hasComp) {
    tabsHtml = '<div class="wr-competitor-tabs" id="wr-comp-tabs">'
      + competitors.map(function (c) {
        var active = c.slug === activeComp.slug ? ' wr-active' : '';
        return '<button class="wr-comp-tab' + active + '" data-slug="' + esc(c.slug) + '">'
          + avatarHtml('wr-comp-tab-avatar', c)
          + '<div class="wr-comp-tab-info">'
            + '<div class="wr-comp-tab-name">' + esc(c.name) + '</div>'
            + '<div class="wr-comp-tab-desc">' + esc(c.company || '') + '</div>'
          + '</div>'
          + '<div class="wr-comp-tab-count">' + (Number(c.total) || 0) + ' Posts</div>'
          + '</button>';
      }).join('')
      + '</div>';
  }

  // ---- Lead calendar card ----
  var leadCardHtml = '<div class="wr-cal-card wr-cal-lead">'
    + '<div class="wr-cal-header">'
      + avatarHtml('wr-cal-header-avatar wr-avatar-lead-gray', lead)
      + '<div>'
        + '<div class="wr-cal-header-name">' + esc(lead.name) + '</div>'
        + '<div class="wr-cal-header-company">' + esc(lead.company || '') + '</div>'
      + '</div>'
      + '<div class="wr-cal-header-posts">'
        + '<div class="wr-cal-posts-num">' + (Number(lead.total) || 0) + '</div>'
        + '<div class="wr-cal-posts-label">Posts</div>'
      + '</div>'
    + '</div>'
    + '<div class="wr-cal-body">'
      + '<div class="wr-cal-month-label">' + esc(monthLabel()) + '</div>'
      + weekdaysHtml()
      + '<div class="wr-cal-days" id="wr-lead-days"></div>'
    + '</div>'
    + '<div class="wr-cal-cta">'
      + '<div class="wr-cal-cta-dot"></div>'
      + 'Mit WarmedIn füllst du deinen Kalender wie sie'
    + '</div>'
    + '</div>';

  // ---- Competitor calendar card ----
  var compCardHtml = '';
  if (hasComp) {
    compCardHtml = '<div class="wr-cal-card wr-cal-comp">'
      + '<div class="wr-cal-header">'
        + '<div class="wr-cal-header-avatar" id="wr-comp-avatar" data-ini="' + esc(activeComp.initials || '') + '" '
          + 'style="background:' + esc(activeComp.color || '#0A66C2') + ';"></div>'
        + '<div>'
          + '<div class="wr-cal-header-name" id="wr-comp-name">' + esc(activeComp.name) + '</div>'
          + '<div class="wr-cal-header-company" id="wr-comp-company">' + esc(activeComp.company || '') + '</div>'
        + '</div>'
        + '<div class="wr-cal-header-posts">'
          + '<div class="wr-cal-posts-num" id="wr-comp-posts-num">' + (Number(activeComp.total) || 0) + '</div>'
          + '<div class="wr-cal-posts-label">Posts</div>'
        + '</div>'
      + '</div>'
      + '<div class="wr-cal-body">'
        + '<div class="wr-cal-month-label">' + esc(monthLabel()) + '</div>'
        + weekdaysHtml()
        + '<div class="wr-cal-days" id="wr-comp-days"></div>'
      + '</div>'
      + '</div>';
  }

  // ---- Stats bar ----
  var statsHtml = '';
  if (hasComp) {
    var emptyDays = windowDays - (Number(lead.active_days) || 0);
    var frS = frameFor(activeComp);
    statsHtml = '<div class="wr-stats-bar">'
      + '<div class="wr-stat-item">'
        + '<div class="wr-stat-num" id="wr-stat-comp-posts">' + (Number(activeComp.total) || 0) + '</div>'
        + '<div class="wr-stat-label">Posts des Wettbewerbers (' + windowDays + ' Tage)</div>'
      + '</div>'
      + '<div class="wr-stat-item' + (frS.tone === 'green' ? ' wr-tone-green' : '') + '" id="wr-stat-ratio-item">'
        + '<div class="wr-stat-num' + (frS.tone === 'green' ? ' wr-tone-green' : '') + '" id="wr-stat-ratio">' + (frS.ratioNum || '–') + '</div>'
        + '<div class="wr-stat-label" id="wr-stat-ratio-label">' + esc(frS.statLabel) + '</div>'
      + '</div>'
      + '<div class="wr-stat-item">'
        + '<div class="wr-stat-num">' + emptyDays + '</div>'
        + '<div class="wr-stat-label">Tage ohne Post (' + leadFirst + ')</div>'
      + '</div>'
      + '<div class="wr-stat-item wr-stat-likes' + (avgLikes(lead) >= avgLikes(activeComp) ? ' wr-tone-green' : '') + '" id="wr-stat-likes-item">'
        + '<div class="wr-stat-num" id="wr-stat-likes">' + leadFirst + ': Ø ' + avgLikes(lead)
          + ' <span class="wr-stat-likes-sep">·</span> ' + esc(firstName(activeComp.name)) + ': Ø ' + avgLikes(activeComp) + '</div>'
        + '<div class="wr-stat-label">Likes pro Post im Schnitt</div>'
      + '</div>'
      + '</div>';
  }

  // ---- Footer ----
  var footerHtml = '<div class="wr-footer">Daten-Stand: ' + esc(prettyDate(end)) + '</div>';

  // ---- Overlay root ----
  var overlayHtml = '<div class="wr-overlay" id="wr-overlay" aria-hidden="true">'
    + '<div class="wr-overlay-card" role="dialog" aria-modal="true">'
      + '<button class="wr-overlay-close" id="wr-overlay-close" aria-label="Schließen">&times;</button>'
      + '<div class="wr-overlay-head">'
        + '<div class="wr-overlay-avatar" id="wr-ov-avatar"></div>'
        + '<div class="wr-overlay-id">'
          + '<div class="wr-overlay-name" id="wr-ov-name"></div>'
          + '<div class="wr-overlay-company" id="wr-ov-company"></div>'
        + '</div>'
        + '<div class="wr-overlay-li-badge">' + LI_SVG + '</div>'
      + '</div>'
      + '<div class="wr-overlay-date" id="wr-ov-date"></div>'
      + '<div class="wr-overlay-body" id="wr-ov-body"></div>'
      + '<div class="wr-overlay-foot" id="wr-ov-foot"></div>'
    + '</div>'
    + '</div>';

  // ---- Assemble ----
  var calWrapClass = hasComp ? 'wr-calendars-wrap' : 'wr-calendars-wrap wr-lead-only';
  mount.innerHTML = fomoHtml
    + tabsHtml
    + '<div class="' + calWrapClass + '">' + leadCardHtml + compCardHtml + '</div>'
    + statsHtml
    + footerHtml
    + overlayHtml;

  /* ---------------------------------------------------------------------
     INITIAL CALENDAR RENDER
     --------------------------------------------------------------------- */
  var leadDaysEl = document.getElementById('wr-lead-days');
  renderCalendarDays(leadDaysEl, lead, 'lead', false);

  var compDaysEl = hasComp ? document.getElementById('wr-comp-days') : null;
  if (hasComp) renderCalendarDays(compDaysEl, activeComp, activeComp.slug, false);

  // Fill the competitor header avatar (image/initials) once after structure exists.
  function fillCompAvatar(comp) {
    var el = document.getElementById('wr-comp-avatar');
    if (!el) return;
    el.style.background = comp.color || '#0A66C2';
    el.setAttribute('data-ini', comp.initials || '');
    var url = photoUrl(comp);
    if (url) {
      el.innerHTML = '<img src="' + esc(url) + '" alt="' + esc(comp.name) + '" '
        + 'onerror="this.style.display=&#39;none&#39;;this.parentNode.textContent=this.parentNode.getAttribute(&#39;data-ini&#39;);">';
    } else {
      el.textContent = comp.initials || '';
    }
  }
  if (hasComp) fillCompAvatar(activeComp);

  /* ---------------------------------------------------------------------
     TAB SWITCHING
     --------------------------------------------------------------------- */
  function selectComp(slug) {
    var comp = competitors.find(function (c) { return c.slug === slug; });
    if (!comp || comp.slug === activeComp.slug) return;
    activeComp = comp;

    document.querySelectorAll('#warmedin-raster .wr-comp-tab').forEach(function (t) {
      t.classList.toggle('wr-active', t.getAttribute('data-slug') === slug);
    });

    // Header
    fillCompAvatar(comp);
    document.getElementById('wr-comp-name').textContent = comp.name;
    document.getElementById('wr-comp-company').textContent = comp.company || '';
    document.getElementById('wr-comp-posts-num').textContent = Number(comp.total) || 0;

    // FOMO + stats — recompute adaptive framing (green if lead posts >= comp).
    var fr = frameFor(comp);
    var fName = document.getElementById('wr-fomo-comp-name');
    if (fName) fName.textContent = comp.name + ': ' + (Number(comp.total) || 0) + ' Posts';

    var fPill = document.getElementById('wr-fomo-ratio-pill');
    if (fPill) fPill.classList.toggle('wr-tone-green', fr.tone === 'green');
    var fLead = document.getElementById('wr-fomo-lead');
    if (fLead) fLead.textContent = fr.fomoLead;
    var fRatio = document.getElementById('wr-fomo-ratio');
    if (fRatio) {
      fRatio.textContent = fr.ratioNum;
      fRatio.style.display = fr.ratioNum ? '' : 'none';
    }
    var fTrail = document.getElementById('wr-fomo-trail');
    if (fTrail) fTrail.textContent = fr.fomoTrail;

    var sPosts = document.getElementById('wr-stat-comp-posts');
    if (sPosts) sPosts.textContent = Number(comp.total) || 0;
    var sRatioItem = document.getElementById('wr-stat-ratio-item');
    if (sRatioItem) sRatioItem.classList.toggle('wr-tone-green', fr.tone === 'green');
    var sRatio = document.getElementById('wr-stat-ratio');
    if (sRatio) {
      sRatio.textContent = fr.ratioNum || '–';
      sRatio.classList.toggle('wr-tone-green', fr.tone === 'green');
    }
    var sRatioLabel = document.getElementById('wr-stat-ratio-label');
    if (sRatioLabel) sRatioLabel.textContent = fr.statLabel;

    // Like-Vergleich — recompute Ø-likes for the newly selected competitor.
    var sLikes = document.getElementById('wr-stat-likes');
    if (sLikes) {
      sLikes.innerHTML = esc(firstName(lead.name)) + ': Ø ' + avgLikes(lead)
        + ' <span class="wr-stat-likes-sep">·</span> ' + esc(firstName(comp.name)) + ': Ø ' + avgLikes(comp);
    }
    var sLikesItem = document.getElementById('wr-stat-likes-item');
    if (sLikesItem) sLikesItem.classList.toggle('wr-tone-green', avgLikes(lead) >= avgLikes(comp));

    // Calendar (animated)
    renderCalendarDays(compDaysEl, comp, comp.slug, true);
  }

  if (hasComp) {
    var tabsEl = document.getElementById('wr-comp-tabs');
    tabsEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.wr-comp-tab');
      if (btn) selectComp(btn.getAttribute('data-slug'));
    });
  }

  /* ---------------------------------------------------------------------
     CLICK OVERLAY
     --------------------------------------------------------------------- */
  var overlayEl = document.getElementById('wr-overlay');
  var ovCard = overlayEl.querySelector('.wr-overlay-card');
  var ovAvatar = document.getElementById('wr-ov-avatar');
  var ovName = document.getElementById('wr-ov-name');
  var ovCompany = document.getElementById('wr-ov-company');
  var ovDate = document.getElementById('wr-ov-date');
  var ovBody = document.getElementById('wr-ov-body');
  var ovFoot = document.getElementById('wr-ov-foot');
  var prevScroll = '';

  function openOverlay(who, iso) {
    var person = personByWho(who);
    if (!person) return;
    var post = postMapFor(person, who)[iso];
    if (!post) return;

    // Avatar
    ovAvatar.style.background = person.color || '#0A66C2';
    ovAvatar.setAttribute('data-ini', person.initials || '');
    var url = photoUrl(person);
    if (url) {
      ovAvatar.innerHTML = '<img src="' + esc(url) + '" alt="' + esc(person.name) + '" '
        + 'onerror="this.style.display=&#39;none&#39;;this.parentNode.textContent=this.parentNode.getAttribute(&#39;data-ini&#39;);">';
    } else {
      ovAvatar.textContent = person.initials || '';
    }

    ovName.textContent = person.name || '';
    ovCompany.textContent = person.company || '';

    var d = parseDate(post.date);
    ovDate.textContent = d ? prettyDate(d) : (post.date || '');

    // full text — use textContent to preserve newlines + escape
    ovBody.textContent = post.text_full || post.text || '';

    // metrics
    var metricsHtml = ''
      + '<span class="wr-overlay-metric"><span class="wr-overlay-metric-icon">' + THUMB_SVG + '</span>'
        + fmtNum(post.reactions) + ' Reaktionen</span>'
      + '<span class="wr-overlay-metric"><span class="wr-overlay-metric-icon">' + COMMENT_SVG + '</span>'
        + fmtNum(post.comments) + ' Kommentare</span>'
      + '<span class="wr-overlay-metric"><span class="wr-overlay-metric-icon">' + REPOST_SVG + '</span>'
        + fmtNum(post.reposts) + ' Reposts</span>';
    if (post.url) {
      metricsHtml += '<a class="wr-overlay-link" href="' + esc(post.url) + '" target="_blank" rel="noopener noreferrer">'
        + 'Auf LinkedIn ansehen</a>';
    }
    ovFoot.innerHTML = metricsHtml;

    // open
    prevScroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlayEl.classList.add('wr-open');
    overlayEl.setAttribute('aria-hidden', 'false');
  }

  function closeOverlay() {
    overlayEl.classList.remove('wr-open');
    overlayEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = prevScroll || '';
  }

  // Event delegation: one listener on the container for cell clicks.
  mount.addEventListener('click', function (ev) {
    var cell = ev.target.closest('.wr-cal-day.wr-has-post');
    if (!cell) return;
    openOverlay(cell.getAttribute('data-person'), cell.getAttribute('data-date'));
  });
  // keyboard accessibility on cells
  mount.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var cell = ev.target.closest && ev.target.closest('.wr-cal-day.wr-has-post');
    if (!cell) return;
    ev.preventDefault();
    openOverlay(cell.getAttribute('data-person'), cell.getAttribute('data-date'));
  });

  // close on backdrop click, X-button, Esc
  document.getElementById('wr-overlay-close').addEventListener('click', closeOverlay);
  overlayEl.addEventListener('click', function (ev) {
    if (ev.target === overlayEl) closeOverlay(); // backdrop only, not the card
  });
  ovCard.addEventListener('click', function (ev) { ev.stopPropagation(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && overlayEl.classList.contains('wr-open')) closeOverlay();
  });
})();
