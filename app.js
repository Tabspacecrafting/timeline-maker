(() => {
  'use strict';

  // ---------- Layout tuning ----------
  // Values keyed by v (vertical) / h (horizontal) layout.
  const STORE_KEY = 'timeline-maker:v1';
  const BASE_GAP = { v: 110, h: 200 };     // px given to a "typical" (median) gap between events
  const MIN_LENGTH = { v: 420, h: 640 };   // the timeline is at least this long (at zoom 1)...
  const MAX_LENGTH = { v: 6000, h: 9000 }; // ...and at most this long (at zoom 1)
  const ANCHOR = { v: 21, h: 18 };         // px from a card's leading edge to its dot
  const START_PAD = { v: 16, h: 40 };
  const FIT_MARGIN = { v: 24, h: 40 };     // gap at each end of the screen when fitting the timeline
  const JUMP_MARGIN = { v: 64, h: 24 };    // px kept clear at each end of the view around a card that Previous/Next brings into view
  const TICK_MIN_PX = { v: 64, h: 90 };    // minimum spacing between axis labels
  // Gridline levels, relative to the date labels: 1 a line per larger unit
  // (e.g. years when labels show months), 2 a line per label, 3 adds the
  // finest in-between lines that are at least GRID_MINOR_PX apart
  const GRID_LEVELS = ['Off', 'Few', 'Some', 'Many'];
  const GRID_MINOR_PX = 6;
  const END_PAD = 32;
  const CARD_SPACING = 10;  // minimum px between two visible cards
  const DOT_RADIUS = 6;     // a dot's visible circle is 12px across
  const CARD_GAP = { v: 20, h: 16 }; // px from the axis to the cards' edge, when no crowd pushes them out
  const CARD_CLEARANCE = 8; // px kept between the dots of a crowd and the cards
  const CARD_LOOKAHEAD = 250; // dots this far past the view's edge still count (a card reaches that far)
  const DOT_STACK = 15;     // dots closer than this along the axis get stacked
  const AXIS_Y = 64;        // horizontal: distance from track top to the axis...
  const AXIS_Y_NO_DATES = 24; // ...or with the date labels turned off
  const CARD_DROP = 16;     // horizontal: gap between the axis and the cards
  const ZOOM_MIN = 0.25;    // you can always zoom out at least this far...
  const ZOOM_MAX = 8;       // ...and in at least this far (more if events need it)
  // The timeline isn't one long page: it's a fixed-size viewport onto it,
  // and the app moves the view itself (see "The view"). So it can be any
  // length, and zoom as deep as the events need.
  const TAIL = { v: 200, h: 300 }; // room after the axis's end, for the last card
  // The sizes of the notes' text the A+ / A- buttons step through (1 is the normal size)
  const NOTE_SCALES = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
  const OUTSIDE = 3000;      // px beyond the view that are still drawn

  // Timeline formats, chosen while the timeline is empty
  const FORMAT_INFO = {
    datetime: 'Events have a date, and optionally a time down to the second. Dates can be partial, like just a year.',
    year: 'Events only have a year. Good for history and other long stretches of time.',
    calendar: 'Events have a day and month (and optionally a time), but no year. The timeline always runs from January to December.',
    number: 'Events are plain numbers from −1,000,000,000,000,000 to 1,000,000,000,000,000, with up to 3 decimals.',
    custom: 'Make your own units, like feet and inches, and say how many of one fit into the next. Events are values in those units.',
  };
  // Custom timelines: up to this many units, biggest first. Each unit after the
  // first says how many of it make 1 of the unit before ("per"): 12 inches = 1 foot.
  const MAX_UNITS = 6;
  const MAX_UNIT_SIZE = 1e12; // the biggest unit is at most this many of the smallest
  const MAX_LABEL = 16; // (characters in a unit's label: long enough for "fortnight" or "centuries")
  // What a save with no usable units falls back on (the builder shows its
  // suggestions as grey placeholder text instead; nothing is pre-filled)
  const FALLBACK_UNITS = [{ label: 'units', per: null }];
  // Calendar-year timelines store dates in this (leap) year, which is never shown
  const CALENDAR_YEAR = 2000;
  const NUM_LIMIT = 1e15;
  // Years can have up to 11 digits: enough for the age of the universe (13.8 billion years)
  const YEAR_LIMIT = 99999999999;

  const SEC = 1e3, MIN = 6e4, HOUR = 36e5, DAY = 864e5, YEAR = 365.2425 * DAY, MONTH = YEAR / 12;

  const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  const $ = (sel) => document.querySelector(sel);
  const els = {
    header: $('.header'),
    title: $('#title'),
    toolbar: $('.toolbar'),
    count: $('#count'),
    home: $('#home'),
    timelineEmpty: $('#timeline-empty'),
    createDialog: $('#create-dialog'),
    cTitle: $('#c-title'),
    timeline: $('#timeline'),
    track: $('#track'),
    jumpPrev: $('#jump-prev'),
    jumpNext: $('#jump-next'),
    toggleAll: $('#toggle-all'),
    startBtn: $('#start-btn'),
    textSize: $('#text-size'),
    textLarger: $('#text-larger'),
    textSmaller: $('#text-smaller'),
    toggleDir: $('#toggle-dir'),
    toggleOrder: $('#toggle-order'),
    toggleGrid: $('#toggle-grid'),
    toggleDates: $('#toggle-dates'),
    zoomIn: $('#zoom-in'),
    zoomOut: $('#zoom-out'),
    zoomFit: $('#zoom-fit'),
    hscroll: $('#hscroll'), // the timeline's scrollbars (custom): in the header when horizontal...
    vscroll: $('#vscroll'), // ...and at the right edge of the window when vertical
    editor: $('#editor'),
    form: $('#editor-form'),
    heading: $('#editor-heading'),
    fTitle: $('#f-title'),
    formatDesc: $('#format-desc'),
    customBuilder: $('#custom-builder'),
    unitList: $('#unit-list'),
    unitAdd: $('#unit-add'),
    unitAddBig: $('#unit-add-big'),
    unitNote: $('#unit-note'),
    placement: $('#f-placement'),
    fHint: $('#f-hint'),
    fError: $('#f-error'),
    fDelete: $('#f-delete'),
    fDuplicate: $('#f-duplicate'),
  };

  // ---------- State ----------
  let state = load();
  let editingId = null;

  // View state (not saved): which cards the user has explicitly revealed,
  // oldest first, and which one is expanded to show its notes.
  let pinned = [];
  let expandedId = null;

  // Rendered events in display order: { id, t, end, pos, card, dot }
  // pos is the dot's distance along the axis from the track's start.
  let items = [];
  let axisEnd = 0;

  // How time maps to position along the axis: pos = start + (t - tMin) * pxPerMs
  // (measured from tMax instead when showing newest first)
  let scale = null;
  let zoomLimits = { min: ZOOM_MIN, max: ZOOM_MAX };
  let fitZoom = null; // the zoom at which the whole timeline fits the screen

  function load() {
    // `started`: the timeline has been created (by naming it or adding an
    // event). Until then the home screen shows instead.
    const defaults = { title: '', started: false, zoom: 1, events: [], categories: [], catsCollapsed: false, hidden: [], horizontal: false, reversed: false, gridLevel: 0, showDates: true, format: 'datetime', custom: null, noteScale: 1 };
    let loaded = defaults;
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.events)) {
        delete s.grid; // replaced by gridLevel
        // Older saves have no `started`: a timeline with events has been started
        loaded = { ...defaults, started: s.events.length > 0, ...s };
      }
    } catch (e) { /* ignore */ }
    loaded.custom = sanitizeCustom(loaded.custom);
    loaded.noteScale = snapNoteScale(loaded.noteScale);
    return loaded;
  }

  // The nearest of the sizes the buttons step through (1 if it isn't a number)
  function snapNoteScale(v) {
    if (!Number.isFinite(v)) return 1;
    return NOTE_SCALES.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), 1);
  }

  // The custom units a save holds ({ units: [{ label, per }] }, biggest first),
  // or null if there are none yet or they're broken
  function sanitizeCustom(custom) {
    const units = custom && custom.units;
    const ok = Array.isArray(units) && units.length >= 1 && units.length <= MAX_UNITS
      && units.every((u, i) => u && typeof u.label === 'string' && u.label && u.label.length <= MAX_LABEL
        && (i === 0 || (Number.isInteger(u.per) && u.per >= 2)))
      && new Set(units.map((u) => u.label)).size === units.length
      && units.reduce((size, u, i) => (i ? size * u.per : 1), 1) <= MAX_UNIT_SIZE;
    return ok ? { units: units.map((u, i) => ({ label: u.label, per: i ? u.per : null })) } : null;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const mode = () => (state.horizontal ? 'h' : 'v');
  const axisY = () => (state.showDates ? AXIS_Y : AXIS_Y_NO_DATES);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Positions are in track coordinates: px from the top/left edge of the
  // timeline's viewport. The view is described by scale.vx: the "axis time"
  // at that edge. Axis time is time itself, or minus time when showing newest
  // first, so it always increases along the axis. A position is then just the
  // time since the edge, times px per ms. Nothing is measured in pixels from
  // the start of the timeline (which could be a quadrillion of them away
  // when zoomed in on a timeline spanning billions of years), so positions
  // stay exact however far in you zoom.
  const ax = (t) => (state.reversed ? -t : t); // time <-> axis time (it is its own inverse)
  const posAt = (t) => (scale.pxPerMs ? (ax(t) - scale.vx) * scale.pxPerMs : scale.start);
  const timeAt = (pos) => (scale.pxPerMs ? ax(scale.vx + pos / scale.pxPerMs) : scale.tMin);
  const axisStartPos = () => posAt(state.reversed ? scale.tMax : scale.tMin); // where the axis begins
  const axisEndPos = () => posAt(state.reversed ? scale.tMin : scale.tMax);   // ...and ends

  // ---------- Dates ----------
  // Events are moments or periods:
  //   { kind: 'moment', date, time, placement }   placement: 'start' | 'middle'
  //   { kind: 'period', date, time, endDate, endTime }
  // A date can be partial: "YYYY", "YYYY-MM" or "YYYY-MM-DD"; a time is "",
  // "HH:MM" or "HH:MM:SS" (only with a full date). Older events have no kind
  // or placement and count as moments placed at the start.
  // Years are astronomical: 0 is 1 BC, -1 is 2 BC, and so on (e.g. "-43-03-15"
  // is 15 March 44 BC); they can have any number of digits.
  function parts(date, time) {
    const [, ys, ms, ds] = /^(-?\d+)(?:-(\d+))?(?:-(\d+))?$/.exec(date);
    const [y, m, d] = [ys, ms, ds].map(Number);
    const t = time ? time.split(':').map(Number) : null;
    return {
      y,
      m: m || null,
      d: d || null,
      hh: t ? t[0] : null,
      mm: t ? t[1] || 0 : 0,
      ss: t ? t[2] || 0 : 0,
      hasSeconds: !!t && t.length === 3,
    };
  }

  function makeDate(y, m = 1, d = 1, hh = 0, mm = 0, ss = 0) {
    const dt = new Date(2000, 0, 1);
    dt.setFullYear(y, m - 1, d); // setFullYear keeps years < 100 literal
    dt.setHours(hh, mm, ss, 0);
    return dt;
  }

  // Start of the year/month/day/moment a date describes
  function toDate(date, time) {
    const p = parts(date, time);
    return makeDate(p.y, p.m || 1, p.d || 1, p.hh || 0, p.mm, p.ss);
  }

  // End of the year/month/day a date without a time describes, or null with a time
  function rangeEnd(date, time) {
    const p = parts(date, time);
    if (p.hh !== null) return null;
    if (!p.m) return makeDate(p.y + 1).getTime();
    if (!p.d) return makeDate(p.y, p.m + 1).getTime();
    return makeDate(p.y, p.m, p.d + 1).getTime();
  }

  const isPeriod = (ev) => ev.kind === 'period';
  const findEvent = (id) => state.events.find((e) => e.id === id);

  // Categories: state.categories = [{ id, name, color }]; an event's
  // categoryId puts it in one. An event's colour is its own if it has one,
  // otherwise its category's, otherwise '' (the default for its type).
  const findCategory = (id) => state.categories.find((c) => c.id === id);
  const eventColor = (ev) => ev.color || (findCategory(ev.categoryId) || {}).color || '';

  // Positions along the axis ("t") are milliseconds for dates, plain years
  // on Years timelines (so they can reach far beyond what dates allow), and
  // the numbers themselves on number timelines.
  const yearsAxis = () => state.format === 'year';
  // Unitless and custom timelines both store a plain number per event (custom
  // ones count in their smallest unit: 5'11" is 71 inches)
  const numeric = () => state.format === 'number' || state.format === 'custom';

  // Browsers can only handle calendar dates up to about 271,800 years either
  // side of 1970, and date timelines only take full dates within DATE_LIMIT
  // years of AD 1 (beyond that, years only). But the Gregorian calendar
  // repeats exactly every 400 years (146,097 days, a whole number of weeks
  // too), so for times further out we shift by whole cycles to where dates
  // work, do the calendar maths there, and shift the results back. That keeps
  // the axis (months, weeks, days, gridlines) going at any depth.
  const DATE_LIMIT = 200000;
  const CYCLE_YEARS = 400;
  const CYCLE_MS = 146097 * DAY;
  const DATE_SAFE_MS = 8.6e15; // a little inside the browser's limit (8.64e15)
  // How many cycles to shift time t back by to bring it within the browser's range
  const cyclesFor = (t) => (Math.abs(t) > DATE_SAFE_MS ? Math.round(t / CYCLE_MS) : 0);
  const yearStartMs = (y) => {
    const k = Math.abs(y) > DATE_LIMIT ? Math.round((y - 1970) / CYCLE_YEARS) : 0;
    return makeDate(y - k * CYCLE_YEARS).getTime() + k * CYCLE_MS;
  };
  // The (astronomical) year that millisecond t falls in
  function yearOfMs(t) {
    const k = cyclesFor(t);
    return new Date(t - k * CYCLE_MS).getFullYear() + k * CYCLE_YEARS;
  }

  // t at the start of a date, and at the end of it (the end of its
  // year/month/day; with a time, the moment itself)
  function startT(date, time) {
    if (yearsAxis()) return parts(date).y;
    const p = parts(date, time);
    return p.m ? toDate(date, time).getTime() : yearStartMs(p.y);
  }
  function endT(date, time) {
    if (yearsAxis()) return parts(date).y + 1;
    if (time) return toDate(date, time).getTime();
    const p = parts(date);
    return p.m ? rangeEnd(date, '') : yearStartMs(p.y + 1);
  }

  // Where a moment's dot sits: the start of its date, or the middle if chosen
  // (number timelines store { num } instead of a date)
  function momentTime(ev) {
    if (numeric()) return ev.num;
    const start = startT(ev.date, ev.time);
    return !ev.time && ev.placement === 'middle' ? (start + endT(ev.date, '')) / 2 : start;
  }

  // ---------- Period edges and links ----------
  // A period's start or end ("edge") either has its own date, or links to an
  // edge of another event: ev.startRef / ev.endRef = { id, edge }, where edge
  // is 'start' or 'end' (a moment just has the one point). A linked edge
  // follows the other event wherever it moves. The period's own date fields
  // keep the linked value from when it was saved, as a fallback.

  // An edge's own value: { t, fields }, fields being the date or number as
  // entered. A period ending "1972" runs to the end of 1972.
  function ownEdge(ev, edge) {
    const num = numeric();
    if (!isPeriod(ev)) return { t: momentTime(ev), fields: num ? { num: ev.num } : { date: ev.date, time: ev.time } };
    if (edge === 'start') {
      return num
        ? { t: ev.num, fields: { num: ev.num } }
        : { t: startT(ev.date, ev.time), fields: { date: ev.date, time: ev.time } };
    }
    if (num) return { t: ev.endNum, fields: { num: ev.endNum } };
    return { t: endT(ev.endDate, ev.endTime), fields: { date: ev.endDate, time: ev.endTime } };
  }

  // An edge's value after following links. A broken link (deleted event, or a
  // loop, which the editor doesn't allow) falls back to the edge's own value.
  function resolveEdge(ev, edge, seen = new Set()) {
    const ref = isPeriod(ev) ? ev[`${edge}Ref`] : null;
    const key = `${ev.id}:${edge}`;
    if (ref && !seen.has(key)) {
      seen.add(key);
      const target = findEvent(ref.id);
      if (target && target.id !== ev.id) return resolveEdge(target, ref.edge, seen);
    }
    return ownEdge(ev, edge);
  }

  // Stores an edge's value in a period's own fields
  function setOwnEdge(ev, edge, fields) {
    const num = numeric();
    if (edge === 'start') {
      if (num) ev.num = fields.num;
      else { ev.date = fields.date; ev.time = fields.time; }
    } else if (num) {
      ev.endNum = fields.num;
    } else {
      ev.endDate = fields.date;
      ev.endTime = fields.time;
    }
  }

  // Where an event sits on the axis: t for its dot, and for periods the end of their band
  function eventSpan(ev) {
    if (!isPeriod(ev)) return { t: momentTime(ev), end: null };
    return { t: resolveEdge(ev, 'start').t, end: resolveEdge(ev, 'end').t };
  }

  const fmt = (opts) => new Intl.DateTimeFormat(undefined, opts);
  const fmtFull = fmt({ year: 'numeric', month: 'short', day: 'numeric' });
  // 24-hour clock, no AM/PM
  const fmtTime = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmtTimeSec = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const fmtDayMonth = fmt({ month: 'short', day: 'numeric' });
  const fmtMonth = fmt({ month: 'short' });
  const fmtMonthYear = fmt({ year: 'numeric', month: 'short' });
  const fmtMonthLong = fmt({ month: 'long' });

  // Up to 3 decimals, with thousands separators: "1,234.5", "-0.25"
  const formatNum = (v, decimals = 3) => v.toLocaleString(undefined, { maximumFractionDigits: decimals });

  // As precise as the user entered it: "1969", "Jul 1969", "Jul 20, 1969 · 20:17".
  // Calendar-year timelines leave out the year: "July", "Jul 20 · 20:17".
  // Years as people write them: "44 BC", "AD 476", "1969", "12,000"
  // (astronomical 0 is 1 BC). Low AD years get "AD" so they can't be
  // mistaken for BC ones next to them.
  function formatYear(y) {
    if (y <= 0) return `${(1 - y).toLocaleString()} BC`;
    if (y < 1000) return `AD ${y}`;
    return y >= 10000 ? y.toLocaleString() : String(y);
  }

  function formatWhen(date, time) {
    const p = parts(date, time);
    if (state.format !== 'calendar' && !p.m) return formatYear(p.y);
    const d = toDate(date, time);
    const timeText = p.hh === null ? '' : ` · ${(p.hasSeconds ? fmtTimeSec : fmtTime).format(d)}`;
    if (state.format === 'calendar') return (p.d ? fmtDayMonth.format(d) : fmtMonthLong.format(d)) + timeText;
    if (p.y >= 1000 && p.y < 10000) return p.d ? fmtFull.format(d) + timeText : fmtMonthYear.format(d);
    // The browser's date formats can't show BC, "AD" or 5-digit years, so these are put together here
    return p.d ? `${fmtDayMonth.format(d)}, ${formatYear(p.y)}${timeText}` : `${fmtMonth.format(d)} ${formatYear(p.y)}`;
  }

  const formatFields = (f) => {
    if (state.format === 'custom') return formatCustom(f.num);
    return numeric() ? formatNum(f.num) : formatWhen(f.date, f.time);
  };

  // A period shows the dates of whatever its edges link to
  function formatEventDate(ev) {
    if (!isPeriod(ev)) return formatFields(ownEdge(ev, 'start').fields);
    return `${formatFields(resolveEdge(ev, 'start').fields)} – ${formatFields(resolveEdge(ev, 'end').fields)}`;
  }

  // ---------- Axis ticks ----------
  const TICK_UNITS = [
    { kind: 'sec', n: 1 }, { kind: 'sec', n: 5 }, { kind: 'sec', n: 15 }, { kind: 'sec', n: 30 },
    { kind: 'min', n: 1 }, { kind: 'min', n: 5 }, { kind: 'min', n: 15 }, { kind: 'min', n: 30 },
    { kind: 'hour', n: 1 }, { kind: 'hour', n: 3 }, { kind: 'hour', n: 6 }, { kind: 'hour', n: 12 },
    { kind: 'day', n: 1 }, { kind: 'day', n: 7 },
    { kind: 'month', n: 1 }, { kind: 'month', n: 3 }, { kind: 'month', n: 6 },
    // Years, up to YEAR_LIMIT (beyond DATE_LIMIT, date timelines have years only)
    ...yearSteps(YEAR_LIMIT).map((n) => ({ kind: 'year', n })),
  ].map((u) => ({ ...u, approx: u.n * { sec: SEC, min: MIN, hour: HOUR, day: DAY, month: MONTH, year: YEAR }[u.kind] }));

  // Years timelines: plain years ("yr"), up to YEAR_LIMIT
  const YEAR_UNITS = yearSteps(YEAR_LIMIT).map((n) => ({ kind: 'yr', n, approx: n }));

  // Round numbers of years: 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, ... up to max
  function yearSteps(max) {
    const steps = [1, 2, 5, 10, 25, 50];
    for (let k = 2; 10 ** k <= max; k++) steps.push(10 ** k, 2.5 * 10 ** k, 5 * 10 ** k);
    return steps.filter((n) => n <= max);
  }

  // Number timelines: steps of 1, 2 and 5 times a power of ten, 0.001 and up
  const NUM_UNITS = [];
  for (let k = -3; k <= 15; k++) {
    for (const f of [1, 2, 5]) {
      const n = Number((f * 10 ** k).toPrecision(1));
      NUM_UNITS.push({ kind: 'num', n, approx: n });
    }
  }

  // ---------- Custom units ----------
  // A custom timeline's value is a plain number of its smallest unit (so
  // 5'11" is 71). `sizes[i]` is how many smallest units make one of unit i.
  // The axis ticks fall on round numbers of every unit: for feet and inches,
  // every 1, 2, 3, 4 or 6 inches, then every foot, 2 feet, 5 feet, ...
  // (steps of 1, 2 or 5 times a power of ten for the biggest unit, and
  // fractions of the smallest, down to 0.001).
  let customCache = { key: '', info: null };
  function customInfo() {
    const units = state.custom ? state.custom.units : FALLBACK_UNITS;
    const key = JSON.stringify(units);
    if (customCache.key !== key) {
      const sizes = new Array(units.length).fill(1);
      for (let i = units.length - 2; i >= 0; i--) sizes[i] = sizes[i + 1] * units[i + 1].per;
      customCache = { key, info: { units, sizes, steps: customSteps(units, sizes) } };
    }
    return customCache.info;
  }

  // Divisors that read as round steps: 1 2 3 4 5 6, then 8 10 12 15 20 25 30 40 50 ...
  const ROUND_MANTISSAS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8];
  const isRoundStep = (d) => d <= 6 || ROUND_MANTISSAS.includes(Number((d / 10 ** Math.floor(Math.log10(d))).toPrecision(3)));

  function customSteps(units, sizes) {
    const steps = new Set();
    for (let k = -3; k <= -1; k++) for (const f of [1, 2, 5]) steps.add(Number((f * 10 ** k).toPrecision(1)));
    units.forEach((u, i) => {
      if (i === 0) {
        for (let k = 0; k <= 15 && sizes[0] * 10 ** k <= 2 * NUM_LIMIT; k++) {
          for (const f of [1, 2, 5]) steps.add(sizes[0] * f * 10 ** k);
        }
      } else {
        // The round divisors of the ratio: 12 inches in a foot -> 1, 2, 3, 4, 6 inches
        for (let d = 1; d < u.per; d++) if (u.per % d === 0 && isRoundStep(d)) steps.add(sizes[i] * d);
      }
    });
    return [...steps].sort((a, b) => a - b).map((n) => ({ kind: 'num', n, approx: n }));
  }

  // Labels glue straight onto their number when they're symbols (5' 11"), and
  // take a space when they're words (5 ft 11 in)
  const isWordLabel = (label) => /^[\p{L}\p{N}]/u.test(label);
  const unitGlue = (label) => (isWordLabel(label) ? ' ' : '');

  // A value split into its units: { negative, counts }. All but the last count
  // are whole numbers; the last (smallest unit) can have up to 3 decimals.
  function customParts(v) {
    const { sizes } = customInfo();
    let whole = Math.floor(Math.abs(v));
    let frac = Math.round((Math.abs(v) - whole) * 1000);
    if (frac >= 1000) { whole += 1; frac -= 1000; }
    const counts = [];
    let rest = whole;
    sizes.forEach((size, i) => {
      if (i === sizes.length - 1) { counts.push(rest + frac / 1000); return; }
      const left = rest % size;
      counts.push((rest - left) / size);
      rest = left;
    });
    return { negative: v < 0 && (whole > 0 || frac > 0), counts };
  }

  // "5'11\"", "3 ft 2 in", "400M mi". Leading and trailing units that are zero
  // are left out (6 ft 0 in is "6 ft"). `parts` limits how many units show
  // (the biggest ones), and `compact` shortens a big count (12,345 -> 12.35K).
  function formatCustom(v, { parts = Infinity, compact = false } = {}) {
    const { units } = customInfo();
    const { negative, counts } = customParts(v);
    const first = counts.findIndex((c) => c > 0);
    if (first < 0) return `0${unitGlue(units[units.length - 1].label)}${units[units.length - 1].label}`;
    let last = counts.length - 1;
    while (last > first && counts[last] === 0) last--;
    last = Math.min(last, first + parts - 1);
    let text = negative ? '-' : '';
    for (let i = first; i <= last; i++) {
      if (i > first) text += unitGlue(units[i - 1].label);
      const big = compact && counts[first] >= 1000;
      text += (big ? formatNumCompact(counts[i]) : formatNum(counts[i])) + unitGlue(units[i].label) + units[i].label;
      if (big) break;
    }
    return text;
  }

  // Axis labels use the same shortening as unitless numbers when they're all
  // whole numbers of the biggest unit: 400,000,000 mi -> "400M mi"
  function customAbbreviation(step, v0, v1) {
    const biggest = customInfo().sizes[0];
    if (step % biggest !== 0) return null;
    return pickAbbreviation(step / biggest, Math.max(Math.abs(v0), Math.abs(v1)) / biggest);
  }

  function customTickLabel(t, abbreviation) {
    if (!abbreviation) return t === 0 ? '0' : formatCustom(t);
    const { units, sizes } = customInfo();
    return t === 0 ? '0' : inUnit(t / sizes[0], abbreviation) + unitGlue(units[0].label) + units[0].label;
  }

  // The label units each format can use (years only, no years, ...)
  function tickUnits() {
    switch (state.format) {
      case 'custom': return customInfo().steps;
      case 'number': return NUM_UNITS;
      case 'year': return YEAR_UNITS;
      case 'calendar': return TICK_UNITS.filter((u) => u.kind !== 'year');
      default: return TICK_UNITS;
    }
  }

  function pickTickUnit(pxPerMs) {
    const minPx = TICK_MIN_PX[mode()];
    const units = tickUnits();
    return units.find((u) => u.approx * pxPerMs >= minPx) || units[units.length - 1];
  }

  // Whether every `big` tick also falls on a `small` tick
  // (months within years, but not weeks within months; for numbers, 10s within 5s, but not 5s within 2s)
  function nests(small, big) {
    if (small.kind === 'num') return Math.abs(big.n / small.n - Math.round(big.n / small.n)) < 1e-9;
    if (small.kind === big.kind) return big.n % small.n === 0;
    return !(small.kind === 'day' && small.n === 7);
  }

  // Next larger unit for sparse gridlines, preferably one that lines up with the labels
  function pickCoarserUnit(major) {
    const larger = tickUnits().filter((u) => u.approx > major.approx);
    return larger.find((u) => nests(major, u)) || larger[0] || major;
  }

  // Finest unit for in-between gridlines that still leaves room between them
  function pickMinorUnit(major, pxPerMs) {
    const fits = tickUnits().filter((u) => u.approx < major.approx && u.approx * pxPerMs >= GRID_MINOR_PX);
    return fits.find((u) => nests(u, major)) || fits[0] || null;
  }

  // First tick at or before t, aligned to the unit (e.g. start of a month)
  function alignTick(t, u) {
    const d = new Date(t);
    switch (u.kind) {
      case 'sec': d.setMilliseconds(0); d.setSeconds(Math.floor(d.getSeconds() / u.n) * u.n); break;
      case 'min': d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / u.n) * u.n); break;
      case 'hour': d.setMinutes(0, 0, 0); d.setHours(Math.floor(d.getHours() / u.n) * u.n); break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        if (u.n === 7) d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
        break;
      case 'month': d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(Math.floor(d.getMonth() / u.n) * u.n); break;
    }
    return d;
  }

  function stepTick(d, u) {
    switch (u.kind) {
      case 'sec': d.setSeconds(d.getSeconds() + u.n); break;
      case 'min': d.setMinutes(d.getMinutes() + u.n); break;
      case 'hour': d.setHours(d.getHours() + u.n); break;
      case 'day': d.setDate(d.getDate() + u.n); break;
      case 'month': d.setMonth(d.getMonth() + u.n); break;
    }
  }

  // Calls fn(y) for every year from y0 to y1 (astronomical) that's a round
  // multiple of n as people count: 100 BC, 200 BC, ... and 100, 200, ...
  // There's no year 0, so the step across it is uneven (e.g. 100 BC to AD 100).
  function eachRoundYear(n, y0, y1, fn) {
    const years = [];
    if (y0 <= 0) {
      // BC year b is astronomical year 1 - b
      for (let b = Math.ceil(Math.max(1, 1 - y1) / n) * n, g = 0; b <= 1 - y0 && g < 5000; b += n, g++) years.push(1 - b);
    }
    if (y1 >= 1) {
      for (let a = Math.ceil(Math.max(1, y0) / n) * n, g = 0; a <= y1 && g < 5000; a += n, g++) years.push(a);
    }
    years.sort((a, b) => a - b).forEach(fn);
  }

  // Calls fn(t, date, yearShift) for each tick of the unit between t0 and t1
  // (date is null on number and Years timelines). Beyond the browser's date
  // range, `date` is the same moment shifted by whole 400-year cycles
  // (`yearShift` years earlier), which has the same month, day and weekday.
  function eachTick(u, t0, t1, fn) {
    if (u.kind === 'yr') {
      eachRoundYear(u.n, Math.ceil(t0), Math.floor(t1), (y) => fn(y, null));
      return;
    }
    if (u.kind === 'year') {
      eachRoundYear(u.n, yearOfMs(t0), yearOfMs(t1), (y) => {
        const t = yearStartMs(y);
        if (t >= t0 && t <= t1) fn(t, Math.abs(y) <= DATE_LIMIT ? makeDate(y) : null);
      });
      return;
    }
    if (u.kind === 'num') {
      const first = Math.ceil(t0 / u.n - 1e-9);
      const last = Math.floor(t1 / u.n + 1e-9);
      // Multiply from an integer index so steps like 0.1 don't drift
      for (let i = first; i <= last && i - first < 5000; i++) fn(Number((i * u.n).toFixed(3)), null);
      return;
    }
    const k = cyclesFor((t0 + t1) / 2) || cyclesFor(t0) || cyclesFor(t1);
    const shift = k * CYCLE_MS;
    const d = alignTick(t0 - shift, u);
    if (d.getTime() < t0 - shift) stepTick(d, u);
    for (let guard = 0; d.getTime() <= t1 - shift && guard < 5000; guard++, stepTick(d, u)) {
      fn(d.getTime() + shift, new Date(d), k * CYCLE_YEARS);
    }
  }

  // Labels on the axis are shortened for years (10,000,000,000 BC -> "10B BC")
  // and for unitless numbers (400,000,000 -> "400M"), with 2,500,000 -> "2.5M"
  // and 3,000 -> "3K". The unit is picked once for all the labels on screen,
  // from the step between them and how big they get, so they never mix
  // ("2500, 3K, 3500" never happens; it's "2.5K, 3K, 3.5K").
  // The biggest unit that suits is used: the labels reach at least one of it,
  // every label needs at most 2 decimals in it, and the step isn't so fine
  // that the plain numbers read better. Otherwise the plain numbers are shown.
  const ABBREVIATIONS = [
    { size: 1e12, letter: 'T', minStep: 1e10 },
    { size: 1e9, letter: 'B', minStep: 1e7 },
    { size: 1e6, letter: 'M', minStep: 1e4 },
    { size: 1e3, letter: 'K', minStep: 100 },
  ];
  const bcNumber = (y) => (y > 0 ? y : 1 - y); // 0 is 1 BC, -1 is 2 BC, ...
  // The unit for labels `step` apart that reach up to `biggest` in size, or null
  function pickAbbreviation(step, biggest) {
    return ABBREVIATIONS.find((u) => biggest >= u.size
      && step >= u.minStep && Number.isInteger(step / (u.size / 100))) || null;
  }
  const yearAbbreviation = (step, y0, y1) => pickAbbreviation(step, Math.max(bcNumber(y0), bcNumber(y1)));
  const numberAbbreviation = (step, v0, v1) => pickAbbreviation(step, Math.max(Math.abs(v0), Math.abs(v1)));
  // A value in that unit: 2,500,000 -> "2.5M"
  const inUnit = (v, unit) => (v === 0 ? '0'
    : (v / unit.size).toLocaleString(undefined, { maximumFractionDigits: 2 }) + unit.letter);
  function formatYearShort(y, unit) {
    if (!unit) return formatYear(y);
    const text = inUnit(bcNumber(y), unit);
    return y > 0 ? text : `${text} BC`;
  }
  // A single number, shortened by its own size (for the time-jump counter):
  // 400,000,000 -> "400M", 12,345 -> "12.35K"; under a thousand, as it is
  function formatNumCompact(v) {
    const unit = ABBREVIATIONS.find((u) => Math.abs(v) >= u.size);
    return unit ? inUnit(v, unit) : formatNum(Number(v.toFixed(3)));
  }

  function tickLabel(t, d, u, yearShift = 0, yearUnit = null) {
    if (u.kind === 'num' && state.format === 'custom') return [customTickLabel(t, yearUnit)];
    if (u.kind === 'num') return [yearUnit ? inUnit(t, yearUnit) : formatNum(t, Math.max(0, Math.ceil(-Math.log10(u.n) - 1e-9)))];
    if (u.kind === 'yr') return [formatYearShort(t, yearUnit)];
    const withYear = state.format !== 'calendar';
    switch (u.kind) {
      case 'year': return [formatYearShort(yearOfMs(t + DAY), yearUnit)]; // a day in, safely inside the year
      case 'month': return withYear ? [fmtMonth.format(d), formatYear(d.getFullYear() + yearShift)] : [fmtMonth.format(d)];
      case 'day': return withYear ? [fmtDayMonth.format(d), formatYear(d.getFullYear() + yearShift)] : [fmtDayMonth.format(d)];
      case 'sec': return [fmtTimeSec.format(d), fmtDayMonth.format(d)];
      default: return [fmtTime.format(d), fmtDayMonth.format(d)];
    }
  }

  // ---------- Rendering ----------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Places an element at `pos` along the axis
  function place(node, pos) {
    // (things this far off are hidden anyway; this just keeps the numbers sane)
    node.style[state.horizontal ? 'left' : 'top'] = `${clamp(pos, -1e8, 1e8)}px`;
  }

  // A square with more inner lines at each gridline level (off looks like "some", greyed)
  function gridIcon(level) {
    const lines = level === 0 ? 2 : level;
    let path = '';
    for (let k = 1; k <= lines; k++) {
      const p = (3.5 + (17 * k) / (lines + 1)).toFixed(1);
      path += `M3.5 ${p}h17M${p} 3.5v17`;
    }
    return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="${path}"/></svg>`;
  }

  function updateControls() {
    const h = state.horizontal;
    document.body.classList.toggle('horizontal', h);
    els.toggleDir.title = h ? 'Switch to vertical timeline' : 'Switch to horizontal timeline';
    els.toggleDir.setAttribute('aria-label', els.toggleDir.title);
    els.toggleOrder.title = state.reversed ? 'Show oldest first' : 'Show newest first';
    els.toggleOrder.setAttribute('aria-label', els.toggleOrder.title);
    els.toggleOrder.setAttribute('aria-pressed', String(state.reversed));
    document.querySelectorAll('[data-format]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.format === state.format));
    });
    els.formatDesc.textContent = FORMAT_INFO[state.format];
    applyNoteScale();
    els.customBuilder.hidden = state.format !== 'custom';
    if (state.format === 'custom' && !builderBuilt) buildBuilder();

    document.body.classList.toggle('no-dates', !state.showDates);
    const scaleWord = state.format === 'number' ? 'numbers' : state.format === 'custom' ? 'values' : state.format === 'year' ? 'years' : 'dates';
    els.toggleDates.title = `${state.showDates ? 'Hide' : 'Show'} ${scaleWord} along the timeline`;
    els.toggleDates.setAttribute('aria-label', els.toggleDates.title);
    els.toggleDates.setAttribute('aria-pressed', String(state.showDates));

    const level = state.gridLevel;
    const nextLevel = (level + 1) % GRID_LEVELS.length;
    els.toggleGrid.title = `Gridlines: ${GRID_LEVELS[level].toLowerCase()} (click for ${GRID_LEVELS[nextLevel].toLowerCase()})`;
    els.toggleGrid.setAttribute('aria-label', els.toggleGrid.title);
    els.toggleGrid.setAttribute('aria-pressed', String(level > 0));
    els.toggleGrid.innerHTML = gridIcon(level);
    els.jumpPrev.innerHTML = `<span aria-hidden="true">${h ? '&larr;' : '&uarr;'}</span> Previous`;
    els.jumpNext.innerHTML = `${h ? '' : '<span aria-hidden="true">&darr;</span> '}Next${h ? ' <span aria-hidden="true">&rarr;</span>' : ''}`;
  }

  // --- The size of the text on the cards ---
  // One setting for every card (state.noteScale, a multiple of the normal
  // size), changed by the A- / A+ buttons in the toolbar, kept with the
  // timeline, and saved in its file. The date, title and notes all scale by
  // it, so they keep their sizes relative to each other.
  function applyNoteScale() {
    document.documentElement.style.setProperty('--note-scale', String(state.noteScale));
    const at = NOTE_SCALES.indexOf(state.noteScale);
    els.textLarger.disabled = at >= NOTE_SCALES.length - 1;
    els.textSmaller.disabled = at <= 0;
  }

  // `direction` is +1 for bigger, -1 for smaller. Cards are as tall as their
  // text makes them, and the fit zoom and the zoom limits depend on that, so
  // the timeline is rebuilt (as when zooming), keeping the middle of the view
  // and where an open card has been scrolled to.
  function changeNoteSize(direction) {
    const at = NOTE_SCALES.indexOf(state.noteScale);
    const next = clamp(at + direction, 0, NOTE_SCALES.length - 1);
    if (next === at) return;
    const open = items.find((it) => it.id === expandedId);
    const scrolled = open ? open.card.scrollTop : 0;
    state.noteScale = NOTE_SCALES[next];
    save();
    applyNoteScale();
    if (!scale) return;
    render(viewAnchor());
    const again = items.find((it) => it.id === expandedId);
    if (again) again.card.scrollTop = scrolled;
  }

  function buildItem(ev) {
    const card = el('div', ev.end !== null ? 'card is-period' : 'card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    // Notes: text (its links are clickable) with the photos and videos where they
    // were put. "No notes" is only said when there's nothing at all.
    const attach = buildAttachments(ev);
    const parts = buildNote(ev);
    const note = parts.note;
    const hasMedia = parts.cells.length > 0;
    if (!parts.hasText && !hasMedia && !attach) { note.textContent = 'No notes'; note.classList.add('is-empty'); }
    const edit = el('button', 'edit-btn');
    edit.type = 'button';
    edit.setAttribute('aria-label', 'Edit event');
    edit.title = 'Edit';
    edit.innerHTML = PENCIL_SVG;
    edit.addEventListener('click', (e) => { e.stopPropagation(); openEditor(ev.id); });
    const date = el('span', 'card-date', formatEventDate(ev));
    if (attach) date.append(attach.clip);
    card.append(date, el('span', 'card-title', ev.title));
    // The poster: one photo that shows on the card even while it's closed
    const poster = buildPoster(ev);
    if (poster) {
      card.append(poster.box);
      // (a poster that is also in the notes gives way to its copy there once the card is open)
      if (noteMentions(ev.note, poster.m.id)) card.classList.add('poster-in-notes');
    }
    if (parts.hasText || hasMedia || !attach) card.append(note);
    if (attach && attach.box) card.append(attach.box);
    card.prepend(edit); // (first, so that it can stick to the corner while the card scrolls)
    card.addEventListener('click', (e) => {
      // Links, videos and photos are for using, not for expanding the card
      if (e.target.closest('.card-note a, .card-media, .card-attach')) return;
      // The poster opens the card, and enlarges once it's open
      if (poster && e.target.closest('.card-poster') && expandedId === ev.id) { openLightbox([poster.m], poster.m.id); return; }
      toggleExpanded(ev.id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.target === card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleExpanded(ev.id);
      }
    });

    // The clickable marker on the axis: a dot for moments, the band itself for
    // periods. Both behave the same (hover to preview, click to show/hide).
    const dot = el('button', ev.end !== null ? 'period-band' : 'dot');
    dot.type = 'button';
    dot.setAttribute('aria-label', `${ev.title}, ${formatEventDate(ev)}`);
    dot.addEventListener('click', () => onDotClick(ev.id));

    // Hovering the marker previews a hidden card. The preview stays while the
    // cursor moves on to the card itself (a short delay bridges the gap
    // between them) and ends once the cursor has left both.
    let peekTimer = 0;
    const startPeek = () => {
      clearTimeout(peekTimer);
      card.classList.add('peek');
    };
    const endPeek = () => {
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => card.classList.remove('peek'), 150);
    };
    dot.addEventListener('mouseenter', startPeek);
    dot.addEventListener('mouseleave', endPeek);
    card.addEventListener('mouseenter', () => { if (card.classList.contains('peek')) startPeek(); hoverCard(card); });
    card.addEventListener('mouseleave', () => { if (card.classList.contains('peek')) endPeek(); unhoverCard(card); });

    // Its own or its category's colour overrides the default purple (moments) / teal (periods)
    const color = eventColor(ev);
    if (color) {
      card.style.setProperty('--ev', color);
      dot.style.setProperty('--ev', color);
    }

    return { id: ev.id, t: ev.t, end: ev.end, created: ev.created ?? 0, startRef: ev.startRef, endRef: ev.endRef, pos: 0, card, dot, cells: parts.cells, mediaLoaded: false, poster, posterLoaded: false };
  }

  // The moment in the middle of the view, and how far into the view that is
  // (null if there's no timeline showing)
  function viewAnchor() {
    if (!scale || !scale.pxPerMs || els.timeline.hidden) return null;
    const v = viewRange();
    const middle = (v.start + v.end) / 2;
    return { t: timeAt(middle), offset: middle - v.start };
  }

  // Builds the whole timeline. Dot positions depend only on time, never on
  // the cards, so the spacing is always exact. Afterwards, the moment that
  // was in the middle of the view (or `anchorArg`, from viewAnchor()) is
  // scrolled back to the same place.
  function render(anchorArg) {
    if (document.activeElement !== els.title) els.title.value = state.title;
    document.title = state.title ? `${state.title} · Timeline Maker` : 'Timeline Maker';
    updateControls();
    stopViewAnimation();

    const events = state.events
      .map((e) => ({ ...e, ...eventSpan(e) }))
      .sort((a, b) => a.t - b.t || a.created - b.created);
    if (state.reversed) events.reverse();

    const n = events.length;
    // Home screen until a timeline is started; then the timeline (which may still be empty)
    const home = !state.started && n === 0;
    document.body.classList.toggle('home', home);
    els.home.hidden = !home;
    els.timelineEmpty.hidden = home || n > 0;
    els.timeline.hidden = n === 0;
    els.toolbar.hidden = home;
    // The vertical timeline's viewport fills the window below the header
    document.documentElement.style.setProperty('--header-h', `${els.header.offsetHeight}px`);
    catPanel.hidden = home;
    $('#cat-dock').hidden = home;
    catPanel.classList.toggle('collapsed', !!state.catsCollapsed);
    if (!home) renderCategories();
    els.toggleAll.hidden = n === 0;
    els.startBtn.hidden = n === 0;
    els.textSize.hidden = n === 0;
    els.count.textContent = n ? `${n} event${n === 1 ? '' : 's'}` : '';

    const ids = new Set(events.map((e) => e.id));
    pinned = pinned.filter((id) => ids.has(id));
    state.hidden = state.hidden.filter((id) => ids.has(id));
    if (!ids.has(expandedId)) expandedId = null;

    // Keep what's in the middle of the view there after rebuilding
    const anchor = anchorArg === undefined ? viewAnchor() : anchorArg;

    const track = els.track;
    track.textContent = '';
    track.removeAttribute('style');
    items = [];
    scale = null;
    tickLayer = null;
    if (!n) { updateScrollbar(); updateJumps(); return; }

    // Rebuilt cards must appear in their final state, not fade in or out
    track.classList.add('no-anim');
    track.style.setProperty('--axis-y', `${axisY()}px`);
    track.style.setProperty('--card-drop', `${CARD_DROP}px`);
    // (the card height limit applies while measuring how big cards get, below)
    track.style.setProperty('--card-max-h', `${cardMaxHeight()}px`);
    hoverNeed = 0;

    const h = state.horizontal;
    const m = mode();

    // Cards first: how big they get when expanded decides how far you can zoom in
    items = events.map(buildItem);
    for (const it of items) track.append(it.card, it.dot);
    const collapsedSizes = items.map((it) => (h ? it.card.offsetWidth : it.card.offsetHeight));
    items.forEach((it) => it.card.classList.add('expanded'));
    const expandedSizes = items.map((it) => (h ? it.card.offsetWidth : it.card.offsetHeight));
    items.forEach((it) => it.card.classList.remove('expanded'));

    // Base scale (zoom 1): the median gap gets BASE_GAP pixels, within overall length limits
    const times = events.map((e) => e.t);
    let tMin = Math.min(...times);
    // The axis runs to the last dot or the end of the last period, whichever is later
    let tMax = Math.max(...events.map((e) => e.end ?? e.t));
    if (state.format === 'calendar') {
      // Calendar-year timelines always show the whole year
      tMin = makeDate(CALENDAR_YEAR).getTime();
      tMax = makeDate(CALENDAR_YEAR + 1).getTime();
    }
    const span = tMax - tMin;
    let basePx = 0;
    if (new Set(times).size > 1) {
      const sorted = [...times].sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < n; i++) {
        const dt = sorted[i] - sorted[i - 1];
        if (dt > 0) gaps.push(dt);
      }
      gaps.sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      basePx = Math.min(MAX_LENGTH[m], Math.max(MIN_LENGTH[m], (span * BASE_GAP[m]) / median)) / span;
    } else if (span > 0) {
      // A single moment, or several at the same time, within one period
      basePx = MIN_LENGTH[m] / span;
    }

    // Fit-to-screen zoom: the whole axis spans the visible area, edge to edge
    // (less a small margin at each end), but not so far that a card sticks out
    // past the end: a moment's card reaches (its size less ANCHOR) beyond its
    // dot, so the events near the end need room for that
    fitZoom = null;
    if (basePx > 0) {
      const room = trackLen() - 2 * FIT_MARGIN[m]; // the length of axis plus the card that hangs off its end
      let pxPerTime = room / span;
      items.forEach((it, i) => {
        if (it.end !== null) return; // (a period's card can slide along its band)
        const along = state.reversed ? tMax - it.t : it.t - tMin; // the distance from the start of the axis
        const reach = room - (collapsedSizes[i] - ANCHOR[m]);
        if (along > 0 && reach > 0) pxPerTime = Math.min(pxPerTime, reach / along);
      });
      fitZoom = Math.max(0.01, pxPerTime / basePx);
    }

    // Zoom limits. In: far enough that every pair of neighbouring events (at
    // different times) has room for the first one's card fully expanded.
    // Out: far enough to fit the whole timeline on screen. Fit-to-screen is
    // always within them.
    if (basePx > 0) {
      let needPx = 0;
      for (let i = 0; i < n; i++) {
        let j = i + 1;
        while (j < n && items[j].t === items[i].t) j++;
        if (j < n) needPx = Math.max(needPx, (expandedSizes[i] + CARD_SPACING) / Math.abs(items[j].t - items[i].t));
      }
      zoomLimits = {
        min: Math.min(ZOOM_MIN, fitZoom),
        max: Math.max(ZOOM_MAX, fitZoom, (needPx / basePx) * 1.05),
      };
      state.zoom = clamp(state.zoom, zoomLimits.min, zoomLimits.max);
    } else {
      zoomLimits = { min: state.zoom, max: state.zoom };
    }
    els.zoomIn.disabled = state.zoom >= zoomLimits.max * 0.999;
    els.zoomOut.disabled = state.zoom <= zoomLimits.min * 1.001;
    els.zoomFit.disabled = fitZoom === null;

    // The view starts where the same moment is in the middle of it as before
    // (or at the timeline's start)
    // (the room after the end is for the last cards: an open card is as tall as its
    // notes, photos and videos make it, and one near the end has to be able to
    // scroll fully into view, clear of the margin that Previous/Next keeps)
    const tail = Math.max(TAIL[m], Math.max(...expandedSizes) + JUMP_MARGIN[m] + END_PAD);
    scale = { tMin, tMax, start: START_PAD[m] + ANCHOR[m], tail, basePx, pxPerMs: basePx * state.zoom, vx: 0 };
    if (scale.pxPerMs) {
      scale.vx = minVx();
      if (anchor) {
        const v = viewRange();
        scale.vx = clampVx(ax(anchor.t) - (v.start + anchor.offset) / scale.pxPerMs);
      }
    }

    // Background layers, behind everything: gridlines and date labels, the axis
    tickLayer = el('div', 'tick-layer');
    axisEl = el('div', 'axis');
    track.prepend(tickLayer, axisEl);

    positionItems();
    layout();
    drawTicks();
    updateScrollbar();
    void track.offsetHeight; // apply the final state before re-enabling transitions
    track.classList.remove('no-anim');
  }

  let axisEl = null;

  // Places the axis, dots and bands for the current scale and view. Events
  // far outside the view are left out (class off-window) until it nears them.
  function positionItems() {
    const h = state.horizontal;
    const m = mode();
    axisEnd = axisEndPos();
    const winEnd = trackLen();

    const axisStart = axisStartPos();
    place(axisEl, Math.max(axisStart, -OUTSIDE));
    axisEl.style[h ? 'width' : 'height'] = `${Math.max(0, Math.min(axisEnd, winEnd + OUTSIDE) - Math.max(axisStart, -OUTSIDE))}px`;

    for (const it of items) {
      it.pos = posAt(it.t);
      place(it.card, it.pos - ANCHOR[m]);
      if (it.end === null) place(it.dot, it.pos);
    }

    // Things that would overlap are moved across the axis into lanes (side by
    // side when vertical, on top of each other when horizontal), keeping their
    // exact position along it. Lane 0 is on the axis, then lanes alternate
    // to either side, starting on the `firstSide` (+1 toward the cards).
    const cross = h ? 'marginTop' : 'marginLeft';
    const laneOffset = (lane, firstSide) =>
      (lane === 0 ? 0 : (lane % 2 ? firstSide : -firstSide) * Math.ceil(lane / 2) * DOT_STACK);

    // Periods: a clickable band from start to end (it.dot is the band).
    // Overlapping periods get separate lanes, starting away from the cards.
    // A period linked to start when another ends (or vice versa) continues
    // in that one's lane, joined to it end to end.
    const bandLanes = []; // per lane: the last band placed in it, { it, hi }
    const linkedEndToStart = (a, b) =>
      (b.startRef && b.startRef.id === a.id && b.startRef.edge === 'end')
      || (a.endRef && a.endRef.id === b.id && a.endRef.edge === 'start');
    const joined = (a, b) => linkedEndToStart(a, b) || linkedEndToStart(b, a);
    const periods = items
      .filter((it) => it.end !== null)
      .map((it) => {
        const b = posAt(it.end);
        return { it, lo: Math.min(it.pos, b), hi: Math.max(it.pos, b) };
      })
      .sort((a, b) => a.lo - b.lo);
    for (const { it, lo, hi } of periods) {
      it.lo = lo; // the band's extent, which its card slides along
      it.hi = hi;
      it.dot.classList.remove('join-lo', 'join-hi');
      let lane = bandLanes.findIndex((last) => joined(last.it, it) && lo >= last.hi - 1);
      if (lane >= 0) {
        bandLanes[lane].it.dot.classList.add('join-hi');
        it.dot.classList.add('join-lo');
      } else {
        lane = bandLanes.findIndex((last) => lo >= last.hi + 4);
        if (lane < 0) lane = bandLanes.length;
      }
      bandLanes[lane] = { it, hi };
      const band = it.dot;
      // Drawn only as far as just past the view; at least as long as a dot,
      // so very short periods can still be clicked
      const drawLo = Math.max(lo, -OUTSIDE);
      const drawHi = Math.min(hi, winEnd + OUTSIDE);
      place(band, drawLo);
      band.style[h ? 'width' : 'height'] = `${Math.max(drawHi - drawLo, 10)}px`;
      band.style[cross] = `${laneOffset(lane, -1) - 5}px`; // -5 centres the 10px band
      it.reach = laneOffset(lane, -1) + 5; // how far it sticks out toward the cards
    }

    // Moments: dots that would overlap each other are spread across the axis
    // in order of time: earliest at the top (horizontal) or left (vertical),
    // whichever way round the axis is shown. Each takes the first lane with
    // room, in time order; then every bunch of overlapping dots is centred on
    // the axis, so a stack doesn't reach into the cards.
    const moments = items
      .filter((it) => it.end === null)
      .sort((a, b) => a.t - b.t || a.created - b.created);
    const dotLaneLast = [];
    for (const it of moments) {
      let lane = dotLaneLast.findIndex((p) => Math.abs(it.pos - p) >= DOT_STACK);
      if (lane < 0) lane = dotLaneLast.length;
      dotLaneLast[lane] = it.pos;
      it.lane = lane;
    }
    const byPos = [...moments].sort((a, b) => a.pos - b.pos);
    for (let i = 0; i < byPos.length;) {
      let j = i + 1;
      let deepest = byPos[i].lane;
      while (j < byPos.length && byPos[j].pos - byPos[j - 1].pos < DOT_STACK) deepest = Math.max(deepest, byPos[j++].lane);
      for (let k = i; k < j; k++) {
        const offset = (byPos[k].lane - deepest / 2) * DOT_STACK;
        byPos[k].dot.style[cross] = `${offset}px`;
        byPos[k].reach = offset + DOT_RADIUS; // how far it sticks out toward the cards
      }
      i = j;
    }

    // Leave out events far outside the view
    for (const it of items) {
      const lo = it.end === null ? it.pos : it.lo;
      const hi = it.end === null ? it.pos : it.hi;
      it.inWindow = hi >= -OUTSIDE && lo <= winEnd + OUTSIDE;
      it.card.classList.toggle('off-window', !it.inWindow);
      it.dot.classList.toggle('off-window', !it.inWindow);
    }

    // Keep the cards clear of the dots and period bands beside the axis. If a
    // crowd of them near the view sticks out far enough to reach the cards,
    // the whole column of cards moves out by the same amount, so the cards
    // stay lined up with each other. It moves back as the crowd leaves the view.
    const view = viewRange();
    let reach = 0;
    for (const it of items) {
      if (!it.inWindow) continue;
      const lo = it.end === null ? it.pos : it.lo;
      const hi = it.end === null ? it.pos : it.hi;
      if (hi >= view.start - CARD_LOOKAHEAD && lo <= view.end + CARD_LOOKAHEAD) reach = Math.max(reach, it.reach ?? 0);
    }
    const shift = Math.max(0, Math.ceil(reach + CARD_CLEARANCE - CARD_GAP[m]));
    if (shift !== scale.cardShift) {
      scale.cardShift = shift;
      els.track.style.setProperty('--card-shift', `${shift}px`);
    }
  }

  // ---------- Date labels and gridlines ----------
  // Only the stretch around the visible part of the timeline is drawn, and
  // redrawn whenever the view moves, so zooming in very far stays fast.
  let tickLayer = null;

  function drawTicks() {
    if (!scale || !tickLayer) return;
    const { start, end } = viewRange();
    const screen = Math.max(end - start, 200);

    tickLayer.textContent = '';
    if (!scale.pxPerMs) return;
    const from = Math.max(axisStartPos(), start - screen / 2);
    const to = Math.min(axisEnd, end + screen / 2);
    if (to <= from) return;
    let t0 = timeAt(from), t1 = timeAt(to);
    if (t0 > t1) [t0, t1] = [t1, t0];
    // Calendar timelines end at the very end of December 31: no "Jan" label there
    if (state.format === 'calendar') t1 = Math.min(t1, scale.tMax - 1);

    const frag = document.createDocumentFragment();
    const major = pickTickUnit(scale.pxPerMs);
    // Whole-year and unitless-number labels are shortened, in one unit for all of them
    const yearUnit = major.kind === 'yr' ? yearAbbreviation(major.n, t0, t1)
      : major.kind === 'year' ? yearAbbreviation(major.n, yearOfMs(t0), yearOfMs(t1))
      : major.kind === 'num' ? (state.format === 'custom' ? customAbbreviation(major.n, t0, t1) : numberAbbreviation(major.n, t0, t1)) : null;
    if (state.gridLevel > 0) {
      const line = (cls) => (t) => {
        const node = el('div', `grid-line ${cls}`);
        place(node, posAt(t));
        frag.appendChild(node);
      };
      if (state.gridLevel === 1) {
        eachTick(pickCoarserUnit(major), t0, t1, line('major'));
      } else {
        const minor = state.gridLevel === 3 ? pickMinorUnit(major, scale.pxPerMs) : null;
        if (minor) eachTick(minor, t0, t1, line('minor'));
        eachTick(major, t0, t1, line('major'));
      }
    }
    if (state.showDates) eachTick(major, t0, t1, (t, d, yearShift) => {
      let main, sub;
      const year = d && major.kind !== 'year' && state.format === 'datetime' ? d.getFullYear() + yearShift : null;
      if (year !== null && (year > DATE_LIMIT || year <= -DATE_LIMIT)) {
        // Events this far out only have a year, so the axis has no months, days
        // or times either: just a year label where a year begins (the
        // gridlines are the same as ever)
        if (!(d.getMonth() === 0 && d.getDate() === 1 && d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0)) return;
        main = formatYear(year);
      } else {
        [main, sub] = tickLabel(t, d, major, yearShift, yearUnit);
      }
      const tick = el('div', 'tick', main);
      if (sub) tick.appendChild(el('small', null, sub));
      place(tick, posAt(t));
      frag.appendChild(tick);
    });
    tickLayer.appendChild(frag);
  }

  // ---------- Card placement and visibility ----------
  // Card sizes along the axis, and across it (for the horizontal track's
  // height), measured in layout() and reused while scrolling
  let cardSizes = [];
  let cardHeights = [];

  // Horizontal mode: how tall a card may be. The page must never scroll
  // vertically, so a card gets at most the room between the axis and the bottom
  // of the window (less what the page keeps below the timeline for the
  // Previous/Next buttons and the Add button); a longer one scrolls inside itself.
  function horizontalCardMax() {
    const top = els.track.getBoundingClientRect().top + window.scrollY;
    const px = (cs, prop) => parseFloat(cs[prop]) || 0;
    const timelineStyle = getComputedStyle(els.timeline);
    const mainStyle = getComputedStyle(els.timeline.parentElement);
    const below = px(timelineStyle, 'marginBottom') + px(timelineStyle, 'paddingBottom') + px(mainStyle, 'paddingBottom');
    const room = window.innerHeight - top - below - 2;
    // (never less than a card with its title needs: in a window too short for that, the page scrolls instead)
    return Math.max(80, Math.floor(room - axisY() - CARD_DROP - (scale ? scale.cardShift || 0 : 0) - END_PAD));
  }
  let cardMaxH = Infinity; // the current limit on a card's height

  // How tall a card may be. Vertical mode: half of what would fit in the
  // timeline (its height less the margin Previous/Next keeps clear at each end,
  // so a card can always be brought fully into view), which keeps cards about
  // as big as horizontal mode's. Horizontal mode: see horizontalCardMax.
  const cardMaxHeight = () => (state.horizontal ? horizontalCardMax() : Math.max(120, Math.floor((trackLen() - 2 * JUMP_MARGIN.v) / 2)));

  // Horizontal mode: the track is as tall as its tallest card (or, while the
  // pointer is over a card, as tall as that card would be in full), up to the
  // card limit, so cards are never cut off at the bottom
  let crossNeed = 0; // the tallest card showing
  let hoverNeed = 0; // the card under the pointer, in full
  function updateTrackHeight() {
    if (!state.horizontal || !scale) return;
    // (at least room for a card with its title, unless the window is too short even for that)
    const cross = Math.max(crossNeed, hoverNeed, Math.min(120, cardMaxH));
    els.track.style.height = `${axisY() + CARD_DROP + (scale.cardShift || 0) + cross + END_PAD}px`;
  }

  // The pointer is over a card: it opens to show its notes, photos and videos
  // (so those are fetched now). In horizontal mode it may then be taller than
  // the track: make room for all of it, measured a moment later, once the
  // browser has applied the hover styles.
  function hoverCard(card) {
    const it = items.find((x) => x.card === card);
    if (it && (!card.classList.contains('is-hidden') || card.classList.contains('peek'))) { loadCardMedia(it); loadPoster(it); }
    if (!state.horizontal) return;
    requestAnimationFrame(() => {
      if (!card.matches(':hover') || (card.classList.contains('is-hidden') && !card.classList.contains('peek'))) return;
      hoverNeed = Math.min(cardMaxH, card.scrollHeight + 2); // (scrollHeight leaves out the borders)
      updateTrackHeight();
      updateJumps();
    });
  }
  function unhoverCard(card) {
    // (a video that was playing in the preview stops with it: a card that has
    // closed again would otherwise play on with nothing to see)
    if (!card.classList.contains('expanded')) card.querySelectorAll('video').forEach((v) => v.pause());
    if (!hoverNeed) return;
    hoverNeed = 0;
    updateTrackHeight();
    updateJumps();
  }

  // Measures the cards, then arranges them
  function layout() {
    if (!items.length) return;
    const h = state.horizontal;
    cardMaxH = cardMaxHeight();
    els.track.style.setProperty('--card-max-h', `${cardMaxH}px`);

    items.forEach((it) => {
      const isExpanded = it.id === expandedId;
      it.card.classList.toggle('expanded', isExpanded);
      it.card.setAttribute('aria-expanded', String(isExpanded));
      if (isExpanded) loadCardMedia(it); // (their files are only fetched once the card is opened, or hovered)
      else if (!it.card.matches(':hover')) it.cells.forEach((c) => { if (c.m.kind === 'video' && !c.node.paused) c.node.pause(); }); // (closed: no video plays on)
    });
    // Ignore any hover preview while measuring
    els.track.classList.add('measuring');
    cardSizes = items.map((it) => (h ? it.card.offsetWidth : it.card.offsetHeight));
    cardHeights = items.map((it) => it.card.offsetHeight);
    els.track.classList.remove('measuring');

    arrange(true);
  }

  // Decides where each card goes and which are visible.
  // - A moment's card sits at its dot. A period's card prefers to sit level
  //   with the middle of its band, but slides along the band to avoid other
  //   cards and to stay on screen while the band is.
  // - Revealed (pinned) cards come first, newest first. Then moments that
  //   have room to themselves (two moments too close to each other are both
  //   hidden by default), then periods, which fit around everything else.
  // - A card with no room is hidden. `final` is false while scrolling: pins
  //   are then left alone, so scrolling never changes what you've revealed.
  function arrange(final) {
    if (!items.length) return;
    const h = state.horizontal;
    const m = mode();
    const n = items.length;
    const sizes = cardSizes;
    const isMoment = (i) => items[i].end === null;
    // Events far outside the window (see positionItems) are left out entirely
    const active = (i) => items[i].inWindow !== false;

    const occupied = []; // [start, end] of each visible card
    const starts = new Array(n).fill(null);
    const shown = new Set();
    const free = (s, size) => occupied.every(([a, b]) => s >= b + CARD_SPACING || s + size + CARD_SPACING <= a);
    const take = (i, s) => {
      starts[i] = s;
      occupied.push([s, s + sizes[i]]);
      shown.add(i);
    };

    // Moments: fixed at their dot
    const momentStart = (i) => items[i].pos - ANCHOR[m];
    const placeMoment = (i) => {
      if (!free(momentStart(i), sizes[i])) return false;
      take(i, momentStart(i));
      return true;
    };
    const momentsOverlap = (i, j) => {
      const a = momentStart(i), b = momentStart(j);
      return a < b + sizes[j] + CARD_SPACING && b < a + sizes[i] + CARD_SPACING;
    };
    const crowded = (i) => items.some((_, j) => j !== i && isMoment(j) && active(j) && momentsOverlap(i, j));

    // Periods: like a sticky header. The card sits at the start of the band
    // (its top/left end), like a moment's card at its dot. Once the view has
    // scrolled past that, it sticks to the edge of the view, until the band's
    // other end carries it away. It can move along the band (from level with
    // one end to level with the other) to make room for other cards.
    const view = viewRange();
    const margin = h ? 12 : 56; // clear of the floating prior/next buttons
    function periodSpot(i) {
      const it = items[i];
      const size = sizes[i];
      const a = it.lo - ANCHOR[m];
      const b = Math.max(a, it.hi + ANCHOR[m] - size); // a band shorter than its card: just at the start
      const target = Math.min(Math.max(a, view.start + margin), b);
      const onScreenA = Math.max(a, view.start + margin);
      const onScreenB = Math.min(b, view.end - margin - size);
      return { a, b, target, onScreenA, onScreenB, size };
    }
    // The best position in [lo, hi] for a card of `size`: never overlapping a
    // visible card, overlapping as few of the `soft` intervals (cards we'd
    // rather not hide) as possible, then as close to `target` as possible.
    // null if there's no room at all.
    // `blocked` intervals must be avoided just like visible cards.
    function bestSpot(lo, hi, target, size, soft, blocked = []) {
      if (lo > hi) return null;
      const t = clamp(target, lo, hi);
      const candidates = [t];
      for (const [s, e] of [...occupied, ...soft, ...blocked]) candidates.push(e + CARD_SPACING, s - CARD_SPACING - size);
      const overlaps = (c) => ([s, e]) => c < e + CARD_SPACING && s < c + size + CARD_SPACING;
      const hits = (c) => soft.filter(overlaps(c)).length;
      let best = null;
      let bestHits = 0;
      for (const c of candidates) {
        if (c < lo || c > hi || !free(c, size) || blocked.some(overlaps(c))) continue;
        const k = hits(c);
        if (best === null || k < bestHits || (k === bestHits && Math.abs(c - t) < Math.abs(best - t))) {
          best = c;
          bestHits = k;
        }
      }
      return best;
    }
    const placePeriod = (i, soft = [], blocked = []) => {
      const p = periodSpot(i);
      const s = bestSpot(p.onScreenA, p.onScreenB, p.target, p.size, soft, blocked)
        ?? bestSpot(p.a, p.b, p.target, p.size, soft, blocked);
      if (s === null) return false;
      take(i, s);
      return true;
    };

    const userHidden = new Set(state.hidden);
    // Moment cards (other than `except`) that would show unless something
    // revealed covers them: revealed ones, and ones with room to themselves
    const momentsToSpare = (except) => items
      .map((_, j) => j)
      .filter((j) => j !== except && isMoment(j) && active(j) && !shown.has(j)
        && (pinned.includes(items[j].id) || (!userHidden.has(items[j].id) && !crowded(j))))
      .map((j) => [momentStart(j), momentStart(j) + sizes[j]]);

    // 1. Revealed cards, newest first, so the last thing clicked always shows.
    //    Each must fit around the newer ones; a revealed period picks the spot
    //    along its band that hides the fewest moment cards. In a final layout,
    //    a revealed card that no longer fits is un-revealed.
    const pinIndexes = [...pinned].reverse().map((id) => items.findIndex((it) => it.id === id)).filter((i) => i >= 0 && active(i));
    const droppedPins = new Set();
    for (const i of pinIndexes) {
      const ok = isMoment(i) ? placeMoment(i) : placePeriod(i, momentsToSpare(i));
      if (!ok) droppedPins.add(items[i].id);
    }
    if (final && droppedPins.size) {
      pinned = pinned.filter((id) => !droppedPins.has(id));
      // An expanded card that just got covered collapses; lay out again without it
      if (droppedPins.has(expandedId)) {
        expandedId = null;
        layout();
        return;
      }
    }

    // 2. Moments with room to themselves, then 3. periods in the gaps left.
    //    Moments outrank periods even when hidden for being too close to each
    //    other, so periods stay out of their space too (but not out of the
    //    space of moments you've hidden yourself).
    const open = (i) => active(i) && !shown.has(i) && !userHidden.has(items[i].id) && !pinned.includes(items[i].id);
    for (let i = 0; i < n; i++) if (isMoment(i) && open(i) && !crowded(i)) placeMoment(i);
    const crowdedMoments = items
      .map((_, j) => j)
      .filter((j) => isMoment(j) && active(j) && !shown.has(j) && !userHidden.has(items[j].id))
      .map((j) => [momentStart(j), momentStart(j) + sizes[j]]);
    for (let i = 0; i < n; i++) if (!isMoment(i) && open(i)) placePeriod(i, [], crowdedMoments);

    // Position every card. Hidden ones go where they'd preview from.
    let cross = 0; // horizontal: tallest visible card
    items.forEach((it, i) => {
      if (!active(i)) return;
      const visible = shown.has(i);
      let s = starts[i];
      if (s === null) {
        s = isMoment(i) ? momentStart(i) : periodSpot(i).target;
      }
      place(it.card, s);
      it.card.classList.toggle('is-hidden', !visible);
      it.card.setAttribute('aria-hidden', String(!visible));
      it.card.tabIndex = visible ? 0 : -1;
      if (visible) loadPoster(it);
      it.dot.classList.toggle('is-hollow', !visible);
      it.dot.title = visible ? 'Hide' : 'Show';
      if (visible && h) cross = Math.max(cross, cardHeights[i]);
    });

    // The track is the viewport: as long as the window (vertical) or the
    // timeline's width (horizontal); a horizontal one is as tall as its cards
    crossNeed = cross;
    updateTrackHeight();

    const anyVisible = shown.size > 0;
    els.toggleAll.textContent = anyVisible ? 'Hide all' : 'Show all';
    els.toggleAll.setAttribute('aria-pressed', String(!anyVisible));
    updateJumps();
  }

  // Reveal a card: it wins over any cards it would overlap
  function pin(id) {
    pinned = pinned.filter((p) => p !== id);
    pinned.push(id);
    if (state.hidden.includes(id)) {
      state.hidden = state.hidden.filter((h) => h !== id);
      save();
    }
  }

  function hide(id) {
    pinned = pinned.filter((p) => p !== id);
    if (expandedId === id) expandedId = null;
    if (!state.hidden.includes(id)) state.hidden.push(id);
    save();
  }

  function toggleExpanded(id) {
    if (expandedId === id) {
      expandedId = null;
    } else {
      expandedId = id;
      navCurrent = id; // Prior / Next now step from this event (see findJumpTargets)
      pin(id);
    }
    layout();
  }

  function onDotClick(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.card.classList.remove('peek');
    // The clicked event becomes the one Prior / Next step from, even though
    // it isn't expanded; a card expanded elsewhere closes, as it does when
    // the new one is shown over it
    navCurrent = id;
    if (expandedId !== null && expandedId !== id) expandedId = null;
    if (it.card.classList.contains('is-hidden')) pin(id);
    else hide(id);
    layout();
  }

  function toggleAll() {
    const anyVisible = items.some((it) => !it.card.classList.contains('is-hidden'));
    state.hidden = anyVisible ? items.map((it) => it.id) : [];
    pinned = [];
    expandedId = null;
    save();
    layout();
  }

  // Clicking empty space collapses the expanded card
  document.addEventListener('click', (e) => {
    if (!expandedId || els.editor.open) return;
    if (e.target.closest('.card, .dot, .jump, .header, .fab, dialog')) return;
    expandedId = null;
    layout();
  });

  // ---------- The view ----------
  // The timeline is a fixed-size viewport (the track) onto the whole
  // timeline, and scale.vx says where the view is: the axis time at its edge
  // (see "Positions" above). The wheel, keyboard, dragging and the scrollbar
  // move it; jumps fly it there.

  // The viewport's length along the axis
  const trackLen = () => (state.horizontal ? els.track.clientWidth : els.track.clientHeight);
  // The axis time at the start and end of the axis
  const axisStartX = () => ax(state.reversed ? scale.tMax : scale.tMin);
  const axisEndX = () => ax(state.reversed ? scale.tMin : scale.tMax);
  // How far the view can go either way, at zoom `px` (px per ms): at one
  // extreme the axis starts `start` px in from the edge, at the other it ends
  // scale.tail px (room for the last card) before the far edge
  const minVx = (px = scale.pxPerMs) => axisStartX() - scale.start / px;
  const maxVx = (px = scale.pxPerMs) => Math.max(minVx(px), axisEndX() + (scale.tail - trackLen()) / px);
  const clampVx = (vx, px = scale.pxPerMs) => clamp(vx, minVx(px), maxVx(px));
  // How far the view can travel in all, in px (what the scrollbar shows)
  const maxOffset = (px = scale.pxPerMs) => (maxVx(px) - minVx(px)) * px;
  // Where the view is, from 0 (start) to 1 (end)
  const viewFraction = () => {
    const range = maxVx() - minVx();
    return range > 0 ? clamp((scale.vx - minVx()) / range, 0, 1) : 0;
  };

  // The visible stretch of the track, in track coordinates along the axis
  // (all of it, unless part of a vertical timeline is scrolled off the page)
  function viewRange() {
    const r = els.track.getBoundingClientRect();
    if (state.horizontal) {
      const box = els.timeline.getBoundingClientRect();
      return { start: Math.max(0, box.left - r.left), end: Math.min(r.width, box.right - r.left) };
    }
    return { start: Math.max(0, els.header.offsetHeight - r.top), end: Math.min(r.height, window.innerHeight - r.top) };
  }

  // Redraws everything that depends on where the view is
  function updateView() {
    if (!scale) return;
    positionItems();
    arrange(false);
    drawTicks();
    updateScrollbar();
  }

  // Moves the view to axis time vx (kept within the timeline)
  function setView(vx) {
    if (!scale.pxPerMs) return;
    scale.vx = clampVx(vx);
    updateView();
  }

  // Moves the view by `px` pixels along the axis
  function panBy(px) {
    if (scale.pxPerMs) setView(scale.vx + px / scale.pxPerMs);
  }

  // --- Moving the view smoothly ---
  let viewFrame = 0;
  let glideTarget = null; // where a wheel or keyboard glide is heading
  let flying = false;     // a flight zooms out and back in on the way
  // The flight under way, if any: { key, finish }. `key` says what asked for
  // it ('next', 'prev', or 'event:<id>'); `finish()` lands it right away.
  let activeFlight = null;

  // Asking again for the flight that's under way (clicking Next twice, or the
  // same event in a category twice) skips the animation: the view lands
  // where that flight was heading, straight away. True if it did.
  function skipFlight(key) {
    if (!flying || !activeFlight || activeFlight.key !== key) return false;
    activeFlight.finish();
    return true;
  }

  // Stops any glide or flight. A flight stopped part-way (e.g. by grabbing
  // the timeline) stays at the zoom it had reached, which becomes the zoom,
  // unless another flight takes over (`keepZoom`), which goes on from there.
  function stopViewAnimation(keepZoom = false) {
    cancelAnimationFrame(viewFrame);
    viewFrame = 0;
    glideTarget = null;
    activeFlight = null;
    if (keepZoom) return;
    if (flying && scale) {
      flying = false;
      hideFlightCues();
      state.zoom = scale.pxPerMs / scale.basePx;
      save();
      els.zoomIn.disabled = state.zoom >= zoomLimits.max * 0.999;
      els.zoomOut.disabled = state.zoom <= zoomLimits.min * 1.001;
    }
  }

  // Wheel and keyboard scrolling glide smoothly to where they're heading;
  // further presses extend the glide
  function glideBy(delta) {
    if (!scale || !scale.pxPerMs) return;
    if (glideTarget === null) {
      stopViewAnimation();
      glideTarget = scale.vx; // (an axis time, like the view itself)
    }
    glideTarget = clampVx(glideTarget + delta / scale.pxPerMs);
    if (viewFrame) return;
    const step = () => {
      const diff = glideTarget - scale.vx;
      if (Math.abs(diff) * scale.pxPerMs < 0.5) {
        setView(glideTarget);
        viewFrame = 0;
        glideTarget = null;
        return;
      }
      setView(scale.vx + diff * 0.3);
      viewFrame = requestAnimationFrame(step);
    };
    viewFrame = requestAnimationFrame(step);
  }

  // Van Wijk & Nuij's smooth zoom-and-pan, along one axis: from centre u0
  // showing width w0 to centre u1 showing w1 (in time units). Long moves
  // zoom out on the way, so you see how far you travel. Returns the path's
  // length S (bigger for bigger moves) and at(p) => [centre, width] for p
  // from 0 to 1.
  function flightPath(u0, w0, u1, w1) {
    const rho = Math.SQRT2;
    const d = Math.abs(u1 - u0);
    if (d <= 1e-9 * w0) {
      const S = Math.log(w1 / w0) / rho;
      return { S: Math.abs(S), at: (p) => [u0 + p * (u1 - u0), w0 * Math.exp(rho * p * S)] };
    }
    // asinh(b) is -log(sqrt(b² + 1) - b), without the rounding errors of
    // that form when b is huge (very long moves at deep zoom)
    const r0 = -Math.asinh((w1 * w1 - w0 * w0 + 4 * d * d) / (4 * w0 * d));
    const r1 = -Math.asinh((w1 * w1 - w0 * w0 - 4 * d * d) / (4 * w1 * d));
    const S = (r1 - r0) / rho;
    const coshR0 = Math.cosh(r0);
    const sinhR0 = Math.sinh(r0);
    return {
      S,
      at: (p) => {
        const r = rho * p * S + r0;
        const k = (w0 / (2 * d)) * (coshR0 * Math.tanh(r) - sinhR0); // fraction of the way across
        return [u0 + k * (u1 - u0), (w0 * coshR0) / Math.cosh(r)];
      },
    };
  }

  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

  // Flight timing
  const FLIGHT_MS_PER_S = 550;              // per unit of a leg's path length...
  const FLIGHT_LEG_MS = { min: 650, max: 2200 }; // ...within these limits
  const FLIGHT_HOLD_MS = 0;                 // a pause at the peak, with both ends in view (none now)
  const PEAK_ROOM = 1.5;                    // the peak shows this much more than the distance travelled

  // Moves the view so that time t ends up at track position `at`, at the
  // timeline's zoom. If both ends of the move fit on screen together, it's
  // one smooth scroll. Otherwise it zooms out (gliding to the midpoint)
  // until both ends are in view with room to spare, holds there for a
  // moment, then glides in to the destination; each leg takes longer the
  // further it goes. Works from anywhere, even part-way through another flight.
  // `span` is the time jump to show in the counter (between two events, for
  // Prior/Next); without it, only flights that zoom out show one, measured
  // from where the view was. `key` names what asked for the flight, so asking
  // for the same thing again can skip it (see skipFlight).
  function flyTo(t, at, onDone, span, key) {
    if (!scale || !scale.pxPerMs) return;
    stopViewAnimation(true);
    const pxEnd = scale.basePx * state.zoom;
    const vxEnd = clampVx(ax(t) - at / pxEnd, pxEnd); // where the view will be once it has landed
    const v = viewRange();
    const len = Math.max(1, v.end - v.start);
    const mid = (v.start + v.end) / 2;
    // In time units: the middle of the view and how much time it shows, now and at the end
    const u0 = timeAt(mid);
    const w0 = len / scale.pxPerMs;
    const u1 = ax(vxEnd + mid / pxEnd);
    const w1 = len / pxEnd;
    const peak = PEAK_ROOM * Math.abs(u1 - u0);

    const legTime = (path) => clamp(FLIGHT_MS_PER_S * path.S, FLIGHT_LEG_MS.min, FLIGHT_LEG_MS.max);
    const leg = (path) => ({ path, ms: legTime(path) });
    const legs = peak <= Math.max(w0, w1)
      ? [leg(flightPath(u0, w0, u1, w1))]
      : [
        leg(flightPath(u0, w0, (u0 + u1) / 2, peak)),
        { hold: true, ms: FLIGHT_HOLD_MS },
        leg(flightPath((u0 + u1) / 2, peak, u1, w1)),
      ];

    // Flights that zoom out also show how much time they cross (see flightCues),
    // counting up as the view travels; short moves just show the jump
    const zoomsOut = legs.length > 1;
    const restWidth = Math.min(w0, w1);
    const viewMove = Math.abs(u1 - u0);
    const total = span ?? viewMove;
    hideFlightCues();
    if (!zoomsOut && span != null) showJumpReadout(total);

    // Lands the flight: used when it arrives, and to skip the rest of it
    const complete = () => {
      cancelAnimationFrame(viewFrame);
      viewFrame = 0;
      flying = false;
      activeFlight = null;
      scale.pxPerMs = pxEnd;
      setView(vxEnd);
      if (zoomsOut || span != null) settleFlightCues(total);
      if (onDone) onDone();
    };

    let index = 0;
    let legStart = performance.now();
    flying = true;
    activeFlight = { key, finish: complete };
    const step = (now) => {
      // Move on through any legs that are done
      while (index < legs.length && now - legStart >= legs[index].ms) {
        legStart += legs[index].ms;
        index++;
      }
      if (index >= legs.length) {
        complete();
        return;
      }
      const current = legs[index];
      if (!current.hold) {
        const [centre, shown] = current.path.at(easeInOut((now - legStart) / current.ms));
        scale.pxPerMs = len / shown;
        scale.vx = ax(centre) - mid / scale.pxPerMs;
        updateView();
        if (zoomsOut) {
          // How far along the move the view's centre is, as a share of the jump
          const along = viewMove > 0 ? Math.min(1, Math.abs(centre - u0) / viewMove) : 1;
          showFlightCues(shown / restWidth, total * along, total);
        }
      }
      viewFrame = requestAnimationFrame(step);
    };
    viewFrame = requestAnimationFrame(step);
  }

  // --- How much time a long flight crosses ---
  // While a flight is zoomed out: gridlines swell with how far out it is
  // (a set amount per 10× zoomed out, so a billion-year jump outgrows a
  // million-year one), and a readout in the middle counts up the time
  // travelled, which stays for a moment after arriving. At rest gridlines
  // are always 1px.
  const GRID_SWELL_PER_10X = 0.7; // px
  const GRID_SWELL_MAX = 8;       // px
  const READOUT_LINGER_MS = 1200;
  const readout = el('div', 'flight-readout');
  readout.setAttribute('aria-hidden', 'true'); // a running count would flood screen readers
  let readoutTimer = 0;

  // Where the readout goes, clear of the events: below a horizontal
  // timeline, between the Prior and Next buttons; on a vertical one, in the
  // column to its right, between them
  function placeReadout() {
    const where = state.horizontal ? 'below' : 'rail';
    readout.className = `flight-readout ${where}${readout.classList.contains('shown') ? ' shown' : ''}`;
    if (readout.parentNode !== document.body) document.body.appendChild(readout);
  }

  // Shows the time between two events right away, for a jump that doesn't
  // have to move the view (both are already on screen)
  function showJumpReadout(span) {
    clearTimeout(readoutTimer);
    placeReadout();
    setReadout(formatSpan(span));
    readout.classList.add('shown');
    readoutTimer = setTimeout(() => readout.classList.remove('shown'), READOUT_LINGER_MS);
  }

  // The number on one line and its unit on the next ("4,5" / "billion years");
  // shown on one line where there's room
  function setReadout(text) {
    const i = text.indexOf(' ');
    readout.replaceChildren(
      el('span', 'amount', i > 0 ? text.slice(0, i) : text),
      el('span', 'unit', i > 0 ? text.slice(i + 1) : ''),
    );
  }

  function showFlightCues(zoomedOut, travelled, total) {
    const width = Math.min(GRID_SWELL_MAX, 1 + GRID_SWELL_PER_10X * Math.log10(Math.max(1, zoomedOut)));
    els.track.style.setProperty('--grid-w', `${width}px`);
    clearTimeout(readoutTimer);
    placeReadout();
    setReadout(formatSpan(travelled, total));
    readout.classList.add('shown');
  }

  function settleFlightCues(travelled) {
    els.track.style.removeProperty('--grid-w');
    setReadout(formatSpan(travelled));
    clearTimeout(readoutTimer);
    readoutTimer = setTimeout(() => readout.classList.remove('shown'), READOUT_LINGER_MS);
  }

  function hideFlightCues() {
    els.track.style.removeProperty('--grid-w');
    clearTimeout(readoutTimer);
    readout.classList.remove('shown');
  }

  // A span of time in words: "4.5 billion years", "1,250 years", "3 days"
  // (on number timelines, just the number). Units are chosen to suit
  // `total`, so a count up to billions of years is in years from the start.
  function formatSpan(dt, total = dt) {
    if (state.format === 'number') return formatNumCompact(dt);
    // (no-break spaces keep a custom span on one line: the readout splits at the first space)
    if (state.format === 'custom') return formatCustom(dt, { parts: 2, compact: true }).replace(/ /g, ' ');
    if (dt === 0 && total === 0) return 'same time'; // (a count-up that has just begun reads "0 years")
    const count = (n, unit) => `${n.toLocaleString()} ${unit}${n === 1 ? '' : 's'}`;
    const short = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    const inYears = (span) => (yearsAxis() ? span : span / YEAR);
    const years = inYears(dt);
    if (years >= 1e9) return `${short(years / 1e9)} billion years`;
    if (years >= 1e6) return `${short(years / 1e6)} million years`;
    if (years >= 2 || inYears(total) >= 2) return count(Math.round(years), 'year');
    const ms = yearsAxis() ? dt * YEAR : dt;
    if (ms >= 2 * DAY) return count(Math.round(ms / DAY), 'day');
    if (ms >= 2 * HOUR) return count(Math.round(ms / HOUR), 'hour');
    if (ms >= 2 * MIN) return count(Math.round(ms / MIN), 'minute');
    return count(Math.round(ms / SEC), 'second');
  }

  // Flies to the view at axis time vx (at the timeline's zoom)
  function flyToView(vx) {
    flyTo(ax(vx), 0);
  }

  // --- Moving the view yourself ---
  // The wheel scrolls the timeline (Ctrl + wheel zooms, see Zoom). At either
  // end, the page gets the wheel instead (e.g. back up to the categories).
  els.timeline.addEventListener('wheel', (e) => {
    if (!scale || e.ctrlKey || e.metaKey) return;
    // Over a card that scrolls inside itself (a long card in horizontal mode) the
    // wheel scrolls the card and leaves the timeline where it is
    if (Math.abs(e.deltaY) >= Math.abs(e.deltaX) && e.target instanceof Element) {
      const card = e.target.closest('.card');
      if (card && card.scrollHeight > card.clientHeight + 1) return;
    }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? trackLen() : 1;
    const raw = state.horizontal && Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const delta = raw * unit;
    if (!delta) return;
    const heading = glideTarget ?? scale.vx;
    if ((delta < 0 && heading <= minVx()) || (delta > 0 && heading >= maxVx())) return;
    e.preventDefault();
    stopStepping();
    // Trackpads send many small steps: follow those directly. Glide mouse-wheel notches.
    if (e.deltaMode === 0 && Math.abs(delta) < 40 && glideTarget === null) {
      stopViewAnimation();
      panBy(delta);
    } else {
      glideBy(delta);
    }
  }, { passive: false });

  // Dragging the timeline (mouse, pen or finger) moves it; a flick keeps it going
  let drag = null;
  let suppressClick = false;
  els.timeline.addEventListener('pointerdown', (e) => {
    if (!scale || e.button !== 0 || e.target.closest('input, select, textarea, video')) return; // (a video's own controls drag too)
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: scale.vx, moved: false, samples: [] };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const along = state.horizontal ? e.clientX - drag.x : e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(along) < 6) return; // a click, so far
      drag.moved = true;
      stopViewAnimation();
      stopStepping();
      document.body.classList.add('dragging');
    }
    setView(drag.vx - along / scale.pxPerMs);
    drag.samples.push({ time: performance.now(), along });
    if (drag.samples.length > 5) drag.samples.shift();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      document.body.classList.remove('dragging');
      // The click that ends a drag isn't a click on whatever's under the pointer
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const s = drag.samples;
      const last = s[s.length - 1];
      if (e.type === 'pointerup' && s.length > 1 && performance.now() - last.time < 80) {
        const speed = (last.along - s[0].along) / Math.max(1, last.time - s[0].time); // px per ms
        if (Math.abs(speed) > 0.3) glideBy(-speed * 250);
      }
    }
    drag = null;
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  els.timeline.addEventListener('click', (e) => {
    if (!suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
    suppressClick = false;
  }, true);

  // Keyboard: Left / Right step to the prior / next event; Up / Down, Page
  // Up/Down and Space scroll; Home and End fly to the start and end
  window.addEventListener('keydown', (e) => {
    if (!scale || els.timeline.hidden || document.querySelector('dialog[open]')) return;
    const target = e.target instanceof Element ? e.target : document.body;
    if (target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && target.closest('button')) return; // Space presses the button (e.g. Next event)
    // Left / Right: the Prior / Next event buttons (a held key doesn't repeat)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (!e.repeat) stepTo(e.key === 'ArrowLeft' ? 'prev' : 'next');
      return;
    }
    const len = trackLen();
    let move = null;
    if (e.key === 'ArrowUp') move = -60;
    else if (e.key === 'ArrowDown') move = 60;
    else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) move = -0.9 * len;
    else if (e.key === 'PageDown' || e.key === ' ') move = 0.9 * len;
    else if (e.key === 'Home' || e.key === 'End') move = e.key === 'Home' ? -Infinity : Infinity;
    if (move === null) return;
    e.preventDefault();
    stopStepping();
    if (Number.isFinite(move)) glideBy(move);
    else {
      // the whole way: fly
      const px = scale.basePx * state.zoom;
      flyToView(move < 0 ? minVx(px) : maxVx(px));
    }
  });

  // --- The scrollbar ---
  // Custom, so it covers the whole timeline however long it is: the thumb
  // shows where the view is. Drag the thumb to move; click the bar to fly there.
  function updateScrollbar() {
    const h = state.horizontal;
    const bar = h ? els.hscroll : els.vscroll;
    (h ? els.vscroll : els.hscroll).hidden = true;
    const travel = scale && scale.pxPerMs ? maxOffset() : 0; // how far the view can go, in px
    const show = !!scale && !els.timeline.hidden && travel > 1;
    bar.hidden = !show;
    els.header.classList.toggle('has-hscroll', h && show);
    if (!show) return;
    const barLen = h ? bar.clientWidth : bar.clientHeight;
    const thumbLen = Math.min(barLen, Math.max(28, (barLen * trackLen()) / (travel + trackLen())));
    const along = viewFraction() * (barLen - thumbLen);
    const thumb = bar.firstElementChild;
    thumb.style.width = h ? `${thumbLen}px` : '';
    thumb.style.height = h ? '' : `${thumbLen}px`;
    thumb.style.transform = h ? `translateX(${along}px)` : `translateY(${along}px)`;
  }

  for (const bar of [els.hscroll, els.vscroll]) {
    const thumb = bar.firstElementChild;
    thumb.addEventListener('pointerdown', (e) => {
      if (!scale) return;
      e.preventDefault();
      e.stopPropagation();
      const h = state.horizontal;
      const from = h ? e.clientX : e.clientY;
      const startFraction = viewFraction();
      const free = (h ? bar.clientWidth - thumb.offsetWidth : bar.clientHeight - thumb.offsetHeight) || 1;
      stopViewAnimation();
      stopStepping();
      try { thumb.setPointerCapture(e.pointerId); } catch (err) { /* keeps working while over the thumb */ }
      thumb.classList.add('active');
      const move = (ev) => {
        const fraction = clamp(startFraction + ((h ? ev.clientX : ev.clientY) - from) / free, 0, 1);
        setView(minVx() + fraction * (maxVx() - minVx()));
      };
      const up = () => {
        thumb.removeEventListener('pointermove', move);
        thumb.classList.remove('active');
      };
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', up, { once: true });
      thumb.addEventListener('pointercancel', up, { once: true });
    });
    bar.addEventListener('pointerdown', (e) => {
      if (!scale || e.target !== bar) return;
      const h = state.horizontal;
      const r = bar.getBoundingClientRect();
      const thumbLen = h ? thumb.offsetWidth : thumb.offsetHeight;
      const at = (h ? e.clientX - r.left : e.clientY - r.top) - thumbLen / 2;
      stopStepping();
      const px = scale.basePx * state.zoom;
      const fraction = clamp(at / Math.max(1, (h ? r.width : r.height) - thumbLen), 0, 1);
      flyToView(minVx(px) + fraction * (maxVx(px) - minVx(px)));
    });
  }

  // A vertical timeline can be partly scrolled off the page (on narrow
  // screens, below the categories), which changes what's visible too
  let pageFrame = 0;
  window.addEventListener('scroll', () => {
    if (!scale || state.horizontal) return;
    cancelAnimationFrame(pageFrame);
    pageFrame = requestAnimationFrame(() => {
      arrange(false);
      drawTicks();
    });
  }, { passive: true });

  // ---------- Prior / next: stepping through events like slides ----------
  // Where an event "is" for navigation, and where its card sits when it's in
  // view: a moment at its dot; a period at the end of its band you reach
  // first (its start, or its end when showing newest first).
  const navPos = (it) => (it.end === null ? it.pos : it.lo);
  // The time at that spot
  const navTime = (it) => (it.end === null || !state.reversed ? it.t : it.end);

  // After a prior/next jump, the next jump steps from that event to its
  // neighbour, even one already on screen. Once you move the view yourself
  // (wheel, dragging, keys, scrollbar), it's the nearest event off screen in
  // that direction instead.
  let navCurrent = null; // id of the event the last jump went to
  function stopStepping() {
    if (navCurrent === null) return;
    navCurrent = null;
    updateJumps();
  }

  // The event Prior / Next step from: the one that's expanded (selected), if
  // any, whether or not its neighbours are on screen; else the one the last
  // jump went to. With neither, they go to the nearest events off screen.
  const steppingFrom = () => expandedId ?? navCurrent;

  function findJumpTargets() {
    if (!items.length || els.timeline.hidden) return { prev: null, next: null };
    const order = [...items].sort((a, b) => navPos(a) - navPos(b));
    const i = order.findIndex((it) => it.id === steppingFrom());
    if (i >= 0) return { prev: order[i - 1] || null, next: order[i + 1] || null };
    const { start, end } = viewRange();
    let prev = null, next = null;
    for (const it of order) {
      if (navPos(it) < start + 4) prev = it;
      else if (navPos(it) > end - 4 && !next) next = it;
    }
    return { prev, next };
  }

  function updateJumps() {
    const { prev, next } = findJumpTargets();
    els.jumpPrev.hidden = !prev;
    els.jumpNext.hidden = !next;
    if (prev) els.jumpPrev.title = prev.card.querySelector('.card-title').textContent;
    if (next) els.jumpNext.title = next.card.querySelector('.card-title').textContent;
    const root = document.documentElement.style;
    root.setProperty('--header-h', `${els.header.offsetHeight}px`);
    if (state.horizontal) {
      // Sit below the timeline, clear of the dates and cards. The timeline
      // grows and shrinks with the expanded card, so the buttons don't follow
      // it: they stay where the timeline's bottom would be with a card at the
      // greatest height one may have, so they never move while stepping along
      const bottom = els.timeline.getBoundingClientRect().bottom;
      const tallest = scale && isFinite(cardMaxH)
        ? axisY() + CARD_DROP + (scale.cardShift || 0) + cardMaxH + END_PAD - els.track.offsetHeight
        : 0;
      const top = bottom + Math.max(0, tallest) + 10;
      root.setProperty('--jump-top', `${top}px`);
      // The tags box opens over the timeline and, with a long list or an open
      // tag, can reach down to where Previous sits at the left: then Previous
      // steps aside, to the right of the box
      const box = catPanel.hidden ? null : catPanel.getBoundingClientRect();
      if (box && box.height > 0 && box.bottom > top - 6) root.setProperty('--jump-prev-left', `${Math.ceil(box.right) + 12}px`);
      else root.removeProperty('--jump-prev-left');
    } else {
      document.documentElement.style.removeProperty('--jump-prev-left');
    }
  }

  // Reveals the event's card and moves the view just far enough that it's
  // fully on screen (clear of the floating prior/next buttons), where it sits
  // when its dot or band start is in view (a period's card may be stuck
  // elsewhere along its band right now). Far-away events are flown to.
  // `span`, when given, is the time jump to show in the counter, even if the
  // view doesn't have to move at all. `key` names what asked for the jump
  // ('next', 'prev', 'event:<id>'): asking for it again while its flight is
  // under way skips the animation (see skipFlight).
  function jumpTo(it, span, key) {
    if (!it) return;
    navCurrent = it.id;
    pin(it.id);
    layout();
    const h = state.horizontal;
    const m = mode();
    const { start, end } = viewRange();
    // A card far off screen isn't drawn, so isn't measured: assume a typical size
    const size = (h ? it.card.offsetWidth : it.card.offsetHeight) || (h ? 220 : 70);
    const margin = JUMP_MARGIN[m];
    // Where its dot (or band start) should end up: just inside the view on
    // the side it comes from, or where it is if the card is already in view
    const pos = navPos(it);
    let at = pos;
    if (pos - ANCHOR[m] < start + margin) at = start + margin + ANCHOR[m];
    else if (pos - ANCHOR[m] + size > end - margin) at = Math.max(start + margin, end - margin - size) + ANCHOR[m];
    const flash = () => {
      it.card.classList.remove('flash');
      void it.card.offsetWidth; // restart the animation
      it.card.classList.add('flash');
    };
    // Already there (and not part-way through a flight): nothing to move
    if (at === pos && !flying) {
      flash();
      if (span != null) showJumpReadout(span);
      return;
    }
    flyTo(navTime(it), at, () => {
      layout(); // settle which cards show, now it's arrived
      flash();
    }, span, key);
  }

  // Prior / Next: step to an event and show the time jump. That's the time
  // since the event you stepped from, or, if you've been scrolling yourself,
  // since the middle of the view. Pressing the same button again while its
  // flight is under way lands it at once instead.
  function stepTo(direction) {
    if (skipFlight(direction)) return;
    const it = findJumpTargets()[direction];
    if (!it) return;
    const from = items.find((x) => x.id === steppingFrom());
    const v = viewRange();
    const reference = from ? navTime(from) : timeAt((v.start + v.end) / 2);
    // If an event is expanded, the selection moves along with you: the one you
    // arrive at is the one that's expanded
    if (expandedId !== null) expandedId = it.id;
    jumpTo(it, Math.abs(navTime(it) - reference), direction);
  }

  els.jumpPrev.addEventListener('click', () => stepTo('prev'));
  els.jumpNext.addEventListener('click', () => stepTo('next'));

  // ---------- Zoom ----------
  // Zooms by `factor`, keeping whatever is in the middle of the view in the middle
  function zoomBy(factor) {
    if (!scale || !scale.pxPerMs) return;
    const anchor = viewAnchor();
    state.zoom *= factor;
    save();
    render(anchor);
  }

  const updateZoomButtons = () => {
    els.zoomIn.disabled = state.zoom >= zoomLimits.max * 0.999;
    els.zoomOut.disabled = state.zoom <= zoomLimits.min * 1.001;
  };

  // Whether the view already is where flying to time t at track position `at`
  // (at the timeline's current zoom setting) would leave it
  function viewIsAt(t, at) {
    const px = scale.basePx * state.zoom;
    return Math.abs(scale.pxPerMs / px - 1) < 1e-6 && Math.abs(scale.vx - clampVx(ax(t) - at / px, px)) * px < 0.5;
  }

  // Zooms so the whole timeline spans the screen, from its start. The view
  // flies there like Previous/Next do; pressing the button again while it's
  // under way lands it at once.
  function fitToScreen() {
    if (fitZoom === null || !scale || !scale.pxPerMs || skipFlight('fit')) return;
    const at = FIT_MARGIN[mode()]; // the axis starts this far in
    const start = state.reversed ? scale.tMax : scale.tMin; // (the time at the axis's start)
    const zoomBefore = state.zoom;
    state.zoom = fitZoom; // (the flight ends at this zoom)
    if (viewIsAt(start, at)) { state.zoom = zoomBefore; return; }
    save();
    flyTo(start, at, () => {
      layout(); // settle which cards show, now it's arrived
      updateZoomButtons();
      save();
    }, undefined, 'fit');
  }

  els.zoomFit.addEventListener('click', fitToScreen);

  // "Start": zoom in as far as the timeline goes, at its beginning, with the
  // first event along the axis (the leftmost or topmost: the oldest, or the
  // newest when showing newest first) open and in view. Previous/Next carry on
  // from there. It flies there, and a second press lands it at once.
  els.startBtn.addEventListener('click', () => {
    if (!items.length || skipFlight('start')) return;
    const first = [...items].sort((a, b) => navPos(a) - navPos(b))[0];
    expandedId = first.id;
    navCurrent = first.id; // (Previous/Next step on from here)
    pin(first.id);
    layout();
    const flash = () => {
      first.card.classList.remove('flash');
      void first.card.offsetWidth; // restart the animation
      first.card.classList.add('flash');
    };
    if (!scale || !scale.pxPerMs) { flash(); return; } // (everything at one moment: nowhere to fly)
    const at = scale.start; // where the first event sits with the view at the very beginning
    const zoomBefore = state.zoom;
    state.zoom = zoomLimits.max; // (the flight ends at this zoom)
    if (viewIsAt(navTime(first), at)) { state.zoom = zoomBefore; flash(); return; }
    save();
    flyTo(navTime(first), at, () => {
      layout();
      flash();
      updateZoomButtons();
      save();
    }, undefined, 'start');
  });
  els.zoomIn.addEventListener('click', () => zoomBy(1.5));
  els.zoomOut.addEventListener('click', () => zoomBy(1 / 1.5));

  // Ctrl + scroll wheel (or a trackpad pinch) zooms, one update per frame
  let pendingZoom = 1;
  let zoomFrame = 0;
  window.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey) || els.timeline.hidden || els.editor.open) return;
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    pendingZoom *= Math.exp(-px * 0.002);
    if (!zoomFrame) {
      zoomFrame = requestAnimationFrame(() => {
        zoomFrame = 0;
        const f = pendingZoom;
        pendingZoom = 1;
        zoomBy(f);
      });
    }
  }, { passive: false });

  // ---------- Photos, videos and links ----------
  // An event's notes can have attachments: ev.media = [{ id, kind: 'image' |
  // 'video', name }] and ev.links = [{ url, text? }]. Links are tiny, so they
  // live in the saved timeline. Photos and videos are far too big for that
  // (localStorage holds about 5 MB), so the files go in the browser's
  // IndexedDB, keyed by id, and the event only remembers their ids. Photos are
  // kept exactly as they were added, at full size; next to each big one is a
  // small preview (stored as "<id>:t"), which is what cards and the form show,
  // since drawing twenty 12-megapixel photos at once would take over a gigabyte
  // of memory. Only the enlarged view loads the original. A file nothing refers
  // to any more is deleted (collectMedia).
  const MEDIA_DB = 'timeline-maker-media';
  const MAX_MEDIA = 20;
  const MAX_LINKS = 10;
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  const MAX_PHOTO_BYTES = 60 * 1024 * 1024;
  const MAX_PHOTO_PIXELS = 150e6; // (bigger than that can't be decoded safely)
  const THUMB_PX = 720;           // longest side of a preview
  const CLIP_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 11.5-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg>';

  // --- The file store ---
  let mediaDbPromise = null;
  function openMediaDb() {
    if (!mediaDbPromise) {
      mediaDbPromise = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(MEDIA_DB, 1);
          req.onupgradeneeded = () => req.result.createObjectStore('files');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (err) { reject(err); }
      });
      mediaDbPromise.catch(() => { mediaDbPromise = null; }); // (so a later try can open it again)
    }
    return mediaDbPromise;
  }

  function mediaRequest(mode, run) {
    return openMediaDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const req = run(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('The browser stopped saving the file.'));
    }));
  }
  const mediaPut = (id, blob) => mediaRequest('readwrite', (s) => s.put(blob, id));
  const mediaGet = (id) => mediaRequest('readonly', (s) => s.get(id));
  const mediaKeys = () => mediaRequest('readonly', (s) => s.getAllKeys());
  const mediaDelete = (id) => mediaRequest('readwrite', (s) => s.delete(id));

  // blob: addresses to show the files with, made once per file; and the files
  // added in the open editor, which are only stored when the event is saved
  const mediaUrls = new Map();   // the files themselves
  const thumbUrls = new Map();   // photo previews
  const unsavedBlobs = new Map();
  const unsavedThumbs = new Map();
  const thumbKey = (id) => `${id}:t`;

  async function mediaUrl(id) {
    if (mediaUrls.has(id)) return mediaUrls.get(id);
    let blob = unsavedBlobs.get(id);
    if (!blob) {
      try { blob = await mediaGet(id); } catch (err) { return null; }
    }
    if (!blob) return null;
    if (!mediaUrls.has(id)) mediaUrls.set(id, URL.createObjectURL(blob));
    return mediaUrls.get(id);
  }

  function forgetUrl(id) {
    for (const cache of [mediaUrls, thumbUrls]) {
      if (cache.has(id)) URL.revokeObjectURL(cache.get(id));
      cache.delete(id);
    }
  }

  // --- Photo previews ---
  function loadImageElement(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    return new Promise((resolve, reject) => {
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
      img.src = url;
    });
  }

  // A small JPEG of a loaded photo, or null when the photo is small enough to
  // be shown as it is (and for GIFs, which would lose their animation)
  async function thumbFromImage(img, blob) {
    if (/^image\/(gif|svg)/.test(blob.type)) return null;
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    if (long <= THUMB_PX * 1.25 && blob.size < 400e3) return null;
    const k = Math.min(1, THUMB_PX / long);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // see-through parts of a PNG would turn black in a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const thumb = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return thumb && thumb.size < blob.size ? thumb : null;
  }

  // Previews are made one at a time, so opening a card with many big photos
  // doesn't decode them all at once
  let thumbQueue = Promise.resolve();
  function buildStoredThumb(id) {
    const run = thumbQueue.then(async () => {
      try {
        const original = await mediaGet(id);
        if (!original) return null;
        const { img, url } = await loadImageElement(original);
        try {
          const thumb = await thumbFromImage(img, original);
          if (thumb) { try { await mediaPut(thumbKey(id), thumb); } catch (err) { /* it is just made again next time */ } }
          return thumb;
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        return null;
      }
    });
    thumbQueue = run.catch(() => {});
    return run;
  }

  // The address of what to show for a photo in a card or the form: its
  // preview (made now if it doesn't have one yet, e.g. after opening a file),
  // or the photo itself if it's small
  async function thumbUrl(id) {
    if (thumbUrls.has(id)) return thumbUrls.get(id);
    let blob = unsavedThumbs.get(id);
    if (!blob && !unsavedBlobs.has(id)) {
      try { blob = await mediaGet(thumbKey(id)); } catch (err) { blob = null; }
      if (!blob) blob = await buildStoredThumb(id);
    }
    const url = blob ? URL.createObjectURL(blob) : await mediaUrl(id);
    if (url && !thumbUrls.has(id)) thumbUrls.set(id, url);
    return thumbUrls.get(id) || url;
  }

  // Deletes stored files no event uses (after deleting events, cancelling an
  // edit, ...). Not while the editor is open, and by default not for an empty
  // timeline (in case the saved timeline simply failed to load); `force` is for
  // when it was emptied on purpose.
  async function collectMedia(force = false) {
    if (els.editor.open || (!force && !state.events.length)) return;
    try {
      for (const key of await mediaKeys()) {
        if (els.editor.open) return;
        const id = String(key).replace(/:t$/, ''); // (a preview goes with its photo)
        if (state.events.some((ev) => (ev.media || []).some((m) => m.id === id))) continue;
        await mediaDelete(key);
        forgetUrl(id);
      }
    } catch (err) { /* no storage, nothing to tidy */ }
  }

  // --- Web addresses ---
  // "example.com/a" -> "https://example.com/a"; null unless it's a web address
  function normalizeUrl(text) {
    let t = text.trim();
    if (!t || t.length > 2000 || /\s/.test(t)) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t}`;
    let u;
    try { u = new URL(t); } catch (err) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null; // no javascript: and the like
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  }

  // What a link without text of its own says: "example.com/page"
  function prettyUrl(url) {
    const u = new URL(url);
    const text = u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + u.search;
    return text.length > 50 ? `${text.slice(0, 49)}…` : text;
  }

  function webLink(url, text) {
    const a = el('a', null, text);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  // Links in the notes are written in the text itself: a web address is a link
  // as it stands, and [words](address) shows the words instead. (Brackets and
  // parentheses inside an address are written %28 %29, so ")" ends the link.)
  const NOTE_LINK = /\[([^\]\n]{1,200})\]\(([^\s()]{1,2000})\)/g;
  const BARE_URL = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;

  // A bare address as it should be linked: closing punctuation belongs to the
  // sentence, not to it (but a ")" stays when it closes a "(" inside the
  // address: wiki/Moon_(disambiguation))
  function trimBareUrl(raw) {
    const count = (s, c) => s.split(c).length - 1;
    while (/[.,;:!?'")\]}]$/.test(raw) && !(raw.endsWith(')') && count(raw, ')') <= count(raw, '('))) raw = raw.slice(0, -1);
    return raw;
  }

  // Text with its links made clickable (built from nodes, never HTML)
  function linkify(text) {
    const frag = document.createDocumentFragment();
    const re = new RegExp(`${NOTE_LINK.source}|${BARE_URL.source}`, 'gi');
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      const markup = m[1] !== undefined;
      const shown = markup ? m[1] : trimBareUrl(m[0]);
      const url = normalizeUrl(markup ? m[2] : shown);
      if (!url) continue;
      const length = markup ? m[0].length : shown.length;
      const a = webLink(url, shown);
      if (markup) a.title = url;
      frag.append(text.slice(last, m.index), a);
      last = m.index + length;
      re.lastIndex = last;
    }
    frag.append(text.slice(last));
    return frag;
  }

  // --- The notes: text with groups of photos and videos between ---
  // A note is one string. A photo or video group is a line of its own,
  // [[media:id,id]], and the event's media list holds the files. Parsed:
  //   [{ type: 'text', text } | { type: 'group', ids }, ...]
  // Media the text doesn't mention (events from before photos could be placed)
  // come last, as a group; a line naming files that aren't there is dropped.
  const NOTE_MEDIA_LINE = /^\[\[media:([a-z0-9,]+)\]\]$/;
  const mediaToken = (ids) => `[[media:${ids.join(',')}]]`;

  function parseNote(note, media) {
    const known = new Set(media.map((m) => m.id));
    const used = new Set();
    const blocks = [];
    let lines = [];
    const addGroup = (ids) => {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'group') last.ids.push(...ids); else blocks.push({ type: 'group', ids });
    };
    for (const line of String(note || '').split('\n')) {
      const m = NOTE_MEDIA_LINE.exec(line);
      if (!m) { lines.push(line); continue; }
      const ids = m[1].split(',').filter((id) => known.has(id) && !used.has(id));
      if (!ids.length) continue;
      ids.forEach((id) => used.add(id));
      if (lines.length) { blocks.push({ type: 'text', text: lines.join('\n') }); lines = []; }
      addGroup(ids);
    }
    if (lines.length) blocks.push({ type: 'text', text: lines.join('\n') });
    const rest = media.filter((m) => !used.has(m.id)).map((m) => m.id);
    if (rest.length) addGroup(rest);
    return blocks;
  }

  // --- The poster ---
  // An event can have one poster: a photo (ev.poster is its id; the file is in
  // ev.media like any other) that shows on the card while it's closed. It isn't
  // part of the notes, so it's left out of them.
  // ...unless the notes place that photo themselves (a photo from the notes can
  // be made the poster too: then it shows in both)
  const noteMentions = (note, id) => String(note || '').split('\n').some((line) => {
    const m = NOTE_MEDIA_LINE.exec(line);
    return m && m[1].split(',').includes(id);
  });
  const mediaForNotes = (note, media, posterId) => (posterId && !noteMentions(note, posterId) ? media.filter((m) => m.id !== posterId) : media);
  const notesMedia = (ev) => mediaForNotes(ev.note, ev.media || [], ev.poster);

  function buildPoster(ev) {
    const m = ev.poster && (ev.media || []).find((x) => x.id === ev.poster && x.kind === 'image');
    if (!m) return null;
    const box = el('div', 'card-poster');
    const node = document.createElement('img');
    node.alt = `Poster: ${m.name}`;
    node.draggable = false;
    box.append(node);
    return { box, node, m };
  }

  // Fetches the poster when its card first shows (the box is already the right
  // size, so nothing moves when it arrives)
  function loadPoster(it) {
    if (!it.poster || it.posterLoaded) return;
    it.posterLoaded = true;
    thumbUrl(it.poster.m.id).then((url) => {
      if (url) it.poster.node.src = url; else it.poster.box.classList.add('is-missing');
    });
  }

  // --- On the card ---
  // One group of photos and videos. The boxes for the files are made now, at a
  // fixed size, so the card is the right height straight away; the files
  // themselves are fetched when the card is first opened.
  function buildMediaGroup(items, media, cells, posterId) {
    const grid = el('div', items.length === 1 ? 'card-media solo' : 'card-media');
    // (the poster's copy in the notes is left out of the hover preview, which already shows the poster)
    if (items.every((m) => m.id === posterId)) grid.classList.add('poster-only');
    for (const m of items) {
      if (m.kind === 'video') {
        const cell = el('div', 'media-cell is-video');
        const node = document.createElement('video');
        node.controls = true;
        node.playsInline = true;
        node.preload = 'none';
        node.setAttribute('aria-label', m.name);
        cell.append(node);
        grid.append(cell);
        cells.push({ m, cell, node });
      } else {
        const cell = el('button', 'media-cell');
        cell.type = 'button';
        cell.title = m.name;
        cell.setAttribute('aria-label', `Enlarge photo: ${m.name}`);
        const node = document.createElement('img');
        node.alt = m.name;
        cell.append(node);
        cell.addEventListener('click', () => openLightbox(media, m.id));
        if (m.id === posterId) cell.classList.add('is-poster');
        grid.append(cell);
        cells.push({ m, cell, node });
      }
    }
    return grid;
  }

  // The notes of a card: text and groups of photos and videos, in order
  function buildNote(ev) {
    const media = notesMedia(ev);
    const byId = new Map(media.map((m) => [m.id, m]));
    const note = el('div', 'card-note');
    const cells = [];
    let hasText = false;
    for (const block of parseNote(ev.note, media)) {
      if (block.type === 'text') {
        const t = block.text.replace(/^\n+|\n+$/g, '');
        if (!t.trim()) continue;
        hasText = true;
        const p = el('span', 'note-text');
        p.append(linkify(t));
        note.append(p);
      } else {
        note.append(buildMediaGroup(block.ids.map((id) => byId.get(id)), media, cells, ev.poster));
      }
    }
    note.classList.toggle('media-only', !hasText && cells.length > 0);
    note.classList.toggle('poster-only', !hasText && cells.length > 0 && cells.every((c) => c.m.id === ev.poster));
    return { note, cells, hasText };
  }

  // The paperclip count, and links from before links lived in the text (a
  // list under the notes; editing the event moves them into the notes)
  function buildAttachments(ev) {
    const media = notesMedia(ev);
    const links = ev.links || [];
    if (!media.length && !links.length) return null;
    let box = null;
    if (links.length) {
      box = el('div', 'card-attach');
      const list = el('ul', 'card-links');
      for (const link of links) {
        const item = el('li');
        const a = webLink(link.url, link.text || prettyUrl(link.url));
        a.title = link.url;
        item.append(a);
        list.append(item);
      }
      box.append(list);
    }
    const clip = el('span', 'card-clip');
    clip.innerHTML = CLIP_SVG;
    clip.append(String(media.length + links.length));
    clip.title = [media.length && `${media.length} photo${media.length === 1 ? '' : 's'} or video${media.length === 1 ? '' : 's'}`, links.length && `${links.length} link${links.length === 1 ? '' : 's'}`].filter(Boolean).join(', ');
    return { box, clip };
  }

  // Fetches an opened card's files into its boxes (once)
  function loadCardMedia(it) {
    if (it.mediaLoaded || !it.cells.length) return;
    it.mediaLoaded = true;
    for (const { m, cell, node } of it.cells) {
      (m.kind === 'video' ? mediaUrl : thumbUrl)(m.id).then((url) => {
        if (!url) { cell.classList.add('is-missing'); return; }
        if (m.kind === 'video') {
          node.addEventListener('error', () => cell.classList.add('is-broken'), { once: true });
          node.preload = 'metadata';
        }
        node.src = url;
      });
    }
  }

  // --- A photo enlarged ---
  const lightbox = $('#lightbox');
  const lbImg = $('#lb-img');
  let lbPhotos = [];
  let lbIndex = 0;

  function openLightbox(media, id) {
    lbPhotos = media.filter((m) => m.kind === 'image');
    lbIndex = Math.max(0, lbPhotos.findIndex((m) => m.id === id));
    showLightboxPhoto();
    lightbox.showModal();
  }

  function showLightboxPhoto() {
    const m = lbPhotos[lbIndex];
    lbImg.removeAttribute('src');
    lbImg.alt = m.name;
    $('#lb-prev').hidden = $('#lb-next').hidden = lbPhotos.length < 2;
    $('#lb-count').textContent = lbPhotos.length > 1 ? `${lbIndex + 1} / ${lbPhotos.length}` : '';
    mediaUrl(m.id).then((url) => { if (url && lbPhotos[lbIndex] === m) lbImg.src = url; });
  }

  const stepLightbox = (by) => {
    lbIndex = (lbIndex + by + lbPhotos.length) % lbPhotos.length;
    showLightboxPhoto();
  };
  $('#lb-close').addEventListener('click', () => lightbox.close());
  $('#lb-prev').addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(-1); });
  $('#lb-next').addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(1); });
  // Clicking anywhere but the photo and the arrows closes it
  lightbox.addEventListener('click', (e) => { if (e.target !== lbImg && !e.target.closest('.lb-btn')) lightbox.close(); });
  lightbox.addEventListener('keydown', (e) => {
    if (lbPhotos.length < 2 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    stepLightbox(e.key === 'ArrowLeft' ? -1 : 1);
  });

  // --- In the event form: the notes ---
  // The notes are blocks, in order: text (a textarea) and groups of photos and
  // videos. They always alternate and start and end with text, so there is
  // always somewhere to type between two groups. They're saved as one string
  // (see parseNote). editorMedia holds every photo and video on the event, as
  // { id, kind, name } (plus `loading` while a photo is being prepared), and the
  // groups point at those. New files wait in memory (unsavedBlobs) and are only
  // stored on Save, so cancelling leaves nothing behind.
  const NOTE_BLOCK_MAX = 3000; // characters in one text box...
  const NOTE_MAX = 6000;       // ...and in the whole note
  const noteBox = $('#f-blocks');
  const attachMsg = $('#f-attach-msg');
  const mediaInput = $('#f-media-input');
  const addMediaBtn = $('#f-add-media');
  let editorMedia = [];
  let editorPoster = null; // the poster, one of editorMedia (but not in the notes)
  let noteBlocks = []; // [{ type: 'text', text, el } | { type: 'group', items: [item], el }]
  let noteCaret = null; // the last cursor in the notes, { block, pos }: where "Photo or video" puts its photos
  let addTarget = null; // the group whose "+" was pressed
  let storageOk = true;
  let savingEvent = false;
  const editorTasks = new Set();

  openMediaDb().catch(() => { storageOk = false; updateAttachButtons(); });

  function updateAttachButtons() {
    const full = editorMedia.length >= MAX_MEDIA;
    const why = !storageOk ? 'This browser can\'t store photos and videos here' : full ? `An event can have up to ${MAX_MEDIA} photos and videos` : '';
    addMediaBtn.disabled = full || !storageOk;
    addMediaBtn.title = why || 'Add a photo or video after the paragraph the cursor is in';
    noteBox.querySelectorAll('.group-add button').forEach((b) => {
      b.disabled = full || !storageOk;
      b.title = why || 'Add to this group';
    });
  }

  function showAttachMessage(text) {
    attachMsg.textContent = text;
    attachMsg.hidden = !text;
  }

  // A photo is kept exactly as it is; this checks that the browser can read it
  // and makes its small preview. -> { blob, thumb } (thumb is null when the
  // photo is small enough to show as it is)
  async function prepareImage(file) {
    if (/^image\/svg/.test(file.type)) return { blob: file, thumb: null };
    let loaded;
    try {
      loaded = await loadImageElement(file);
    } catch (err) {
      return problem(/hei[cf]/i.test(file.type + file.name)
        ? 'is a HEIC photo, which most browsers can\'t show. Export it as a JPEG first.'
        : 'couldn\'t be read as a photo.');
    }
    try {
      if (loaded.img.naturalWidth * loaded.img.naturalHeight > MAX_PHOTO_PIXELS) problem(`is over ${MAX_PHOTO_PIXELS / 1e6} megapixels, which is too big to show safely.`);
      return { blob: file, thumb: await thumbFromImage(loaded.img, file) };
    } finally {
      URL.revokeObjectURL(loaded.url);
    }
  }

  // --- Blocks ---
  const newTextBlock = (text = '') => ({ type: 'text', text });
  const itemById = (id) => editorMedia.find((m) => m.id === id);

  // Puts blocks in the shape the form needs: text first and last, text between
  // groups, no two neighbours of the same kind, no empty groups
  function normalizeBlocks(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.type === 'group' && !b.items.length) continue;
      const last = out[out.length - 1];
      if (last && last.type === b.type) {
        if (b.type === 'text') last.text = last.text && b.text ? `${last.text}\n${b.text}` : last.text + b.text;
        else last.items.push(...b.items);
      } else {
        out.push(b);
      }
    }
    if (!out.length || out[0].type !== 'text') out.unshift(newTextBlock());
    if (out[out.length - 1].type !== 'text') out.push(newTextBlock());
    return out;
  }

  const blocksFromNote = (note) => normalizeBlocks(parseNote(note, mediaForNotes(note, editorMedia, editorPoster && editorPoster.id)).map((b) => (
    b.type === 'text' ? newTextBlock(b.text) : { type: 'group', items: b.ids.map(itemById) })));
  const noteString = () => noteBlocks.map((b) => (b.type === 'text' ? b.text : mediaToken(b.items.map((m) => m.id)))).join('\n');

  const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
  const autosizeNotes = () => noteBox.querySelectorAll('textarea').forEach(autosize);

  // Redraws the blocks. Typing doesn't come through here (the text boxes keep
  // themselves up to date); adding, moving and removing do.
  function renderNoteEditor(focus) {
    noteBox.textContent = '';
    const only = noteBlocks.length === 1;
    for (const block of noteBlocks) {
      if (block.type === 'text') {
        const ta = el('textarea', 'note-text-input');
        ta.value = block.text;
        ta.maxLength = NOTE_BLOCK_MAX;
        ta.rows = 1;
        ta.classList.toggle('is-only', only);
        ta.placeholder = only ? '' : 'Add text here…';
        ta.setAttribute('aria-label', 'Notes');
        ta.addEventListener('input', () => {
          block.text = ta.value;
          autosize(ta);
          clearError();
          refreshMoveButtons();
          noteCursor(block, ta);
        });
        for (const type of ['keyup', 'mouseup', 'focus', 'select']) ta.addEventListener(type, () => noteCursor(block, ta));
        ta.addEventListener('blur', hideToolSoon);
        block.el = ta;
        noteBox.append(ta);
      } else {
        block.el = el('div', 'note-group');
        noteBox.append(block.el);
        fillNoteGroup(block);
      }
    }
    autosizeNotes();
    refreshMoveButtons();
    updateAttachButtons();
    if (focus && focus.block && focus.block.type === 'text' && focus.block.el) {
      const pos = Math.min(focus.pos, focus.block.text.length);
      focus.block.el.focus();
      focus.block.el.setSelectionRange(pos, pos);
    }
  }

  // `inNotes`: it's a photo in the notes (which can be made the poster, with the
  // star); otherwise it's the poster's own preview in the poster section
  function thumbElement(m, inNotes = true) {
    const li = el('li', `media-thumb${m.kind === 'video' ? ' is-video' : ''}${m.loading ? ' is-loading' : ''}`);
    li.title = m.name;
    if (!m.loading) {
      const node = document.createElement(m.kind === 'video' ? 'video' : 'img');
      if (m.kind === 'video') { node.muted = true; node.preload = 'metadata'; node.playsInline = true; } else node.alt = m.name;
      li.append(node);
      (m.kind === 'video' ? mediaUrl : thumbUrl)(m.id).then((url) => {
        if (!url) li.classList.add('is-missing');
        else node.src = m.kind === 'video' ? `${url}#t=0.1` : url; // (#t shows a frame, not a black box)
      });
    }
    const remove = el('button', 'media-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', inNotes ? `Remove ${m.name}` : 'Remove the poster');
    remove.title = inNotes ? 'Remove' : 'Remove the poster';
    remove.addEventListener('click', () => (inNotes ? dropItem(m) : unsetPoster()));
    li.append(remove);
    if (inNotes && m.kind === 'image' && !m.loading) {
      const star = el('button', 'media-star', '★');
      star.type = 'button';
      star.setAttribute('aria-pressed', String(m === editorPoster));
      star.title = m === editorPoster ? 'This is the poster. Click to stop using it as the poster' : 'Use as the poster, shown on the card';
      star.setAttribute('aria-label', star.title);
      star.addEventListener('click', () => togglePoster(m));
      li.append(star);
    }
    return li;
  }

  // --- The poster, from the notes ---
  const refreshGroups = () => noteBlocks.forEach((b) => { if (b.type === 'group' && b.el) fillNoteGroup(b); });

  // Takes the poster away. A photo that is also in the notes stays there; a
  // poster that's only the poster goes altogether.
  function unsetPoster() {
    const m = editorPoster;
    if (!m) return;
    if (noteBlocks.some((b) => b.type === 'group' && b.items.includes(m))) {
      editorPoster = null;
      renderPosterField();
      refreshGroups();
    } else {
      dropItem(m);
    }
  }

  // The star on a photo in the notes: the poster is this photo, or (pressed
  // again) not any more. Another poster is let go of.
  function togglePoster(m) {
    if (editorPoster === m) { unsetPoster(); return; }
    if (editorPoster) unsetPoster();
    editorPoster = m;
    renderPosterField();
    refreshGroups();
  }

  // One group: its photos and videos, a "+" tile to add more, and arrows
  function fillNoteGroup(block) {
    block.el.textContent = '';
    const list = el('ul', 'group-items');
    block.items.forEach((m) => list.append(thumbElement(m)));
    const add = el('li', 'group-add');
    const addBtn = el('button', null, '+');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => { addTarget = block; mediaInput.click(); });
    add.append(addBtn);
    list.append(add);
    const move = el('div', 'group-move');
    for (const [label, dir, title] of [['↑', -1, 'Move up one paragraph'], ['↓', 1, 'Move down one paragraph']]) {
      const b = el('button', null, label);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', () => moveGroup(block, dir));
      move.append(b);
    }
    block.el.append(list, move);
    updateAttachButtons();
    refreshMoveButtons();
  }

  // Removes a photo or video from the form (its file goes when the event is saved)
  function dropItem(m) {
    editorMedia = editorMedia.filter((x) => x !== m);
    if (unsavedBlobs.delete(m.id)) { unsavedThumbs.delete(m.id); forgetUrl(m.id); }
    if (m === editorPoster) {
      editorPoster = null;
      renderPosterField();
    }
    const group = noteBlocks.find((b) => b.type === 'group' && b.items.includes(m));
    if (!group) return;
    group.items = group.items.filter((x) => x !== m);
    showAttachMessage('');
    if (group.items.length) {
      fillNoteGroup(group);
    } else {
      noteBlocks = normalizeBlocks(noteBlocks); // (the text on either side joins up)
      renderNoteEditor(noteCaret);
    }
  }

  // ↑ and ↓ move a group past one paragraph: the group is a line of the note,
  // so it swaps places with the line above or below (passing blank lines)
  function moveGroup(block, dir) {
    const lines = noteString().split('\n');
    const token = mediaToken(block.items.map((m) => m.id));
    let at = lines.indexOf(token);
    if (at < 0) return;
    let moved = false;
    while (at + dir >= 0 && at + dir < lines.length) {
      const over = lines[at + dir];
      [lines[at], lines[at + dir]] = [lines[at + dir], lines[at]];
      at += dir;
      moved = true;
      if (over.trim() !== '') break; // passed a paragraph (or another group)
    }
    if (!moved) return;
    const first = block.items[0];
    noteBlocks = blocksFromNote(lines.join('\n'));
    noteCaret = null;
    renderNoteEditor();
    const again = noteBlocks.find((b) => b.type === 'group' && b.items.includes(first));
    if (again) again.el.querySelector(dir < 0 ? '.group-move button:first-child' : '.group-move button:last-child').focus();
  }

  // A group can move up if there's anything but blank lines above it, and
  // likewise down; the arrows are greyed out when it can't
  function refreshMoveButtons() {
    const lines = noteString().split('\n');
    for (const b of noteBlocks) {
      if (b.type !== 'group' || !b.el) continue;
      const at = lines.indexOf(mediaToken(b.items.map((m) => m.id)));
      const [up, down] = b.el.querySelectorAll('.group-move button');
      if (!up) continue;
      up.disabled = at < 0 || lines.slice(0, at).every((l) => l.trim() === '');
      down.disabled = at < 0 || lines.slice(at + 1).every((l) => l.trim() === '');
    }
  }

  // --- Adding photos and videos ---
  // New photos go after the paragraph the cursor is in (before it if the cursor
  // is at its very start), or at the end if the cursor hasn't been in the notes
  function insertionPoint() {
    const c = noteCaret && noteBlocks.includes(noteCaret.block) ? noteCaret : null;
    const block = c ? c.block : noteBlocks[noteBlocks.length - 1];
    return { block, pos: c ? c.pos : block.text.length };
  }

  function insertGroupAt(point, items) {
    const t = point.block.text;
    const p = Math.min(point.pos, t.length);
    const lineStart = t.lastIndexOf('\n', p - 1) + 1;
    let lineEnd = t.indexOf('\n', p);
    if (lineEnd < 0) lineEnd = t.length;
    let before;
    let after;
    if (p === lineStart) {
      before = lineStart > 0 ? t.slice(0, lineStart - 1) : '';
      after = t.slice(lineStart);
    } else {
      before = t.slice(0, lineEnd);
      after = lineEnd < t.length ? t.slice(lineEnd + 1) : '';
    }
    const group = { type: 'group', items };
    const i = noteBlocks.indexOf(point.block);
    point.block.text = before;
    noteBlocks.splice(i + 1, 0, group, newTextBlock(after));
    return group;
  }

  // Adds picked files, one at a time, to a group (target.group) or into the
  // notes as a new group (target.point)
  async function addFiles(files, target) {
    const problems = [];
    let group = target.group || null;
    for (const file of files) {
      if (editorMedia.length >= MAX_MEDIA) { problems.push(`An event can have up to ${MAX_MEDIA} photos and videos.`); break; }
      const isVideo = file.type.startsWith('video/') || (!file.type.startsWith('image/') && /\.(mp4|m4v|mov|webm|ogv|mkv)$/i.test(file.name));
      if (!isVideo && !file.type.startsWith('image/')) { problems.push(`${file.name} isn't a photo or video.`); continue; }
      const limit = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
      if (file.size > limit) { problems.push(`${file.name} is over ${limit / 1024 / 1024} MB.`); continue; }
      const item = { id: newId(), kind: isVideo ? 'video' : 'image', name: file.name, loading: true };
      editorMedia.push(item);
      if (group && noteBlocks.includes(group)) {
        group.items.push(item);
        fillNoteGroup(group);
      } else {
        group = insertGroupAt(target.point || insertionPoint(), [item]);
        noteBlocks = normalizeBlocks(noteBlocks);
        renderNoteEditor();
      }
      const task = (async () => {
        try {
          const prepared = isVideo ? { blob: file, thumb: null } : await prepareImage(file);
          unsavedBlobs.set(item.id, prepared.blob);
          if (prepared.thumb) unsavedThumbs.set(item.id, prepared.thumb);
          item.loading = false;
          const g = noteBlocks.find((b) => b.type === 'group' && b.items.includes(item));
          if (g) fillNoteGroup(g);
        } catch (err) {
          dropItem(item);
          problems.push(err instanceof FileProblem ? `${file.name} ${err.message}` : `${file.name} couldn't be read.`);
        }
      })();
      editorTasks.add(task);
      await task;
      editorTasks.delete(task);
    }
    showAttachMessage(problems.join(' '));
  }

  // The "i" beside a field's label opens a small popup with its hint, right
  // under the label. Clicking anywhere else (or pressing the "i" again) closes it.
  const infoButtons = [...document.querySelectorAll('.info-btn')];
  const closeHints = (except) => infoButtons.forEach((b) => {
    if (b === except) return;
    document.getElementById(b.getAttribute('aria-controls')).hidden = true;
    b.setAttribute('aria-expanded', 'false');
  });
  infoButtons.forEach((b) => {
    const hint = document.getElementById(b.getAttribute('aria-controls'));
    b.addEventListener('click', () => {
      closeHints(b);
      hint.hidden = !hint.hidden;
      b.setAttribute('aria-expanded', String(!hint.hidden));
    });
  });
  els.editor.addEventListener('click', (e) => { if (!e.target.closest('.info-btn, .hint-pop')) closeHints(); });
  els.editor.addEventListener('close', () => closeHints());

  // --- The poster, in the form ---
  const posterList = $('#f-poster');
  const posterBtn = $('#f-poster-btn');
  const posterInput = $('#f-poster-input');

  // Shows the chosen photo (with its × to take it away), or nothing
  function renderPosterField() {
    posterList.textContent = '';
    posterList.hidden = !editorPoster;
    if (editorPoster) posterList.append(thumbElement(editorPoster, false));
    $('#f-poster-label').textContent = editorPoster ? 'Change photo' : 'Choose photo';
    posterBtn.disabled = !storageOk;
    posterBtn.title = storageOk ? 'Choose a photo to show on the card' : 'This browser can\'t store photos here';
  }

  async function choosePoster(file) {
    if (!file.type.startsWith('image/')) { showAttachMessage(`${file.name} isn't a photo.`); return; }
    if (file.size > MAX_PHOTO_BYTES) { showAttachMessage(`${file.name} is over ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`); return; }
    // (a poster being replaced goes first, so it frees its place among the event's files)
    if (editorPoster) unsetPoster();
    if (editorMedia.length >= MAX_MEDIA) { showAttachMessage(`An event can have up to ${MAX_MEDIA} photos and videos.`); return; }
    showAttachMessage('');
    const item = { id: newId(), kind: 'image', name: file.name, loading: true };
    editorMedia.push(item);
    editorPoster = item;
    renderPosterField();
    const task = (async () => {
      try {
        const prepared = await prepareImage(file);
        if (editorPoster !== item) return; // (taken away or replaced while it was being prepared)
        unsavedBlobs.set(item.id, prepared.blob);
        if (prepared.thumb) unsavedThumbs.set(item.id, prepared.thumb);
        item.loading = false;
        renderPosterField();
      } catch (err) {
        if (editorPoster === item) dropItem(item);
        showAttachMessage(err instanceof FileProblem ? `${file.name} ${err.message}` : `${file.name} couldn't be read.`);
      }
    })();
    editorTasks.add(task);
    await task;
    editorTasks.delete(task);
  }

  posterBtn.addEventListener('click', () => posterInput.click());
  posterInput.addEventListener('change', () => {
    const file = posterInput.files[0];
    posterInput.value = '';
    if (file) choosePoster(file);
  });

  // --- Links in the text ---
  // A web address typed in the notes is a link. The panel under the notes shows
  // when the cursor is in text that can be one: selected words (make them a
  // link), a bare address (show words instead), or an existing [words](address)
  // (change it, or take the link away and keep the words).
  const linkTool = $('#f-link-tool');
  const ltText = $('#lt-text');
  const ltUrl = $('#lt-url');
  const ltApply = $('#lt-apply');
  const ltRemove = $('#lt-remove');
  const ltMsg = $('#lt-msg');
  let toolCtx = null;
  let toolHideTimer = 0;
  let toolPointer = false;

  function linkContext(text, a, b) {
    const markups = [...text.matchAll(NOTE_LINK)].map((m) => ({ start: m.index, end: m.index + m[0].length, words: m[1], url: m[2] }));
    const inside = markups.find((m) => a >= m.start && b <= m.end);
    if (inside) return { mode: 'markup', start: inside.start, end: inside.end, words: inside.words, url: inside.url.replace(/%28/g, '(').replace(/%29/g, ')') };
    const overlaps = (s, e) => markups.some((m) => s < m.end && e > m.start);
    for (const m of text.matchAll(BARE_URL)) {
      const raw = trimBareUrl(m[0]);
      const s = m.index;
      const e = s + raw.length;
      if (a >= s && b <= e && !overlaps(s, e) && normalizeUrl(raw)) return { mode: 'bare', start: s, end: e, url: raw };
    }
    if (b > a) {
      let s = a;
      let e = b;
      while (s < e && /\s/.test(text[s])) s++;
      while (e > s && /\s/.test(text[e - 1])) e--;
      if (e > s && !text.slice(s, e).includes('\n') && !overlaps(s, e)) return { mode: 'select', start: s, end: e, words: text.slice(s, e) };
    }
    return null;
  }

  function hideLinkTool() {
    clearTimeout(toolHideTimer);
    toolCtx = null;
    linkTool.hidden = true;
  }

  function hideToolSoon() {
    clearTimeout(toolHideTimer);
    toolHideTimer = setTimeout(() => {
      if (!toolPointer && !linkTool.contains(document.activeElement)) hideLinkTool();
    }, 220);
  }

  function showLinkTool(block, ta, ctx) {
    clearTimeout(toolHideTimer);
    const same = toolCtx && !linkTool.hidden && toolCtx.block === block && toolCtx.mode === ctx.mode && toolCtx.start === ctx.start && toolCtx.end === ctx.end;
    toolCtx = { ...ctx, block, ta };
    if (!same) {
      ltText.value = ctx.words || '';
      ltUrl.value = ctx.mode === 'select' ? '' : ctx.url;
      ltApply.textContent = { select: 'Make link', bare: 'Show words instead', markup: 'Update link' }[ctx.mode];
      ltRemove.hidden = ctx.mode !== 'markup';
      ltText.placeholder = ctx.mode === 'bare' ? 'Words to show instead of the address' : 'Words to show';
      ltMsg.textContent = '';
    }
    linkTool.hidden = false;
  }

  // The cursor moved in a text box: remember it, and show or hide the link panel
  function noteCursor(block, ta) {
    noteCaret = { block, pos: ta.selectionStart };
    const ctx = linkContext(ta.value, ta.selectionStart, ta.selectionEnd);
    if (ctx) showLinkTool(block, ta, ctx); else hideLinkTool();
  }

  function replaceLinkText(replacement) {
    const ctx = toolCtx;
    if (!ctx) return;
    const t = ctx.block.text;
    const next = t.slice(0, ctx.start) + replacement + t.slice(ctx.end);
    if (next.length > NOTE_BLOCK_MAX) { ltMsg.textContent = 'The notes are too long for that.'; return; }
    ctx.block.text = next;
    ctx.ta.value = next;
    autosize(ctx.ta);
    const pos = ctx.start + replacement.length;
    hideLinkTool();
    ctx.ta.focus();
    ctx.ta.setSelectionRange(pos, pos);
    noteCaret = { block: ctx.block, pos };
  }

  function applyLink() {
    if (!toolCtx) return;
    const words = ltText.value.replace(/[[\]\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const url = normalizeUrl(ltUrl.value);
    if (!words) { ltMsg.textContent = 'Add the words to show.'; ltText.focus(); return; }
    if (!url) { ltMsg.textContent = 'That doesn\'t look like a web address.'; ltUrl.focus(); return; }
    replaceLinkText(`[${words}](${url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`);
  }

  ltApply.addEventListener('click', applyLink);
  ltRemove.addEventListener('click', () => { if (toolCtx) replaceLinkText(toolCtx.words); });
  for (const input of [ltText, ltUrl]) {
    input.addEventListener('input', () => { ltMsg.textContent = ''; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }); // (not "save the event")
  }
  // Pressing in the panel takes focus from the text box; that mustn't close the panel
  linkTool.addEventListener('mousedown', () => { toolPointer = true; clearTimeout(toolHideTimer); });
  linkTool.addEventListener('touchstart', () => { toolPointer = true; clearTimeout(toolHideTimer); }, { passive: true });
  document.addEventListener('mouseup', () => { setTimeout(() => { toolPointer = false; }, 0); });
  document.addEventListener('touchend', () => { setTimeout(() => { toolPointer = false; }, 0); });

  // Fills the form's notes for the event being opened (empty for a new one)
  function loadEditorAttachments(ev) {
    editorMedia = ((ev && ev.media) || []).map(({ id, kind, name }) => ({ id, kind, name }));
    editorPoster = (ev && ev.poster && editorMedia.find((m) => m.id === ev.poster && m.kind === 'image')) || null;
    renderPosterField();
    let note = (ev && ev.note) || '';
    // links from before they lived in the text move into it, one per line, at the end
    const old = ((ev && ev.links) || []).map((l) => (l.text ? `[${l.text}](${l.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})` : l.url));
    if (old.length) note += (note.trim() ? '\n' : '') + old.join('\n');
    noteBlocks = blocksFromNote(note);
    noteCaret = null;
    addTarget = null;
    hideLinkTool();
    showAttachMessage('');
    renderNoteEditor();
  }

  // Writes the files added in this edit to the store (they stay in memory,
  // and the editor open, if that fails)
  async function storeNewMedia() {
    const fresh = editorMedia.filter((m) => unsavedBlobs.has(m.id));
    try {
      for (const m of fresh) {
        await mediaPut(m.id, unsavedBlobs.get(m.id));
        if (unsavedThumbs.has(m.id)) await mediaPut(thumbKey(m.id), unsavedThumbs.get(m.id));
      }
    } catch (err) {
      showAttachMessage('Couldn\'t save the photos and videos: the browser\'s storage may be full.');
      return false;
    }
    fresh.forEach((m) => { unsavedBlobs.delete(m.id); unsavedThumbs.delete(m.id); });
    return true;
  }

  addMediaBtn.addEventListener('click', () => { addTarget = null; mediaInput.click(); });
  mediaInput.addEventListener('change', () => {
    const files = [...mediaInput.files];
    mediaInput.value = ''; // (so picking the same file again still counts)
    if (!files.length) return;
    // (the place is worked out now: the cursor may move while photos are prepared)
    const target = addTarget && noteBlocks.includes(addTarget) ? { group: addTarget } : { point: insertionPoint() };
    addTarget = null;
    addFiles(files, target);
  });
  // However the editor closes, files that were added but not saved are dropped,
  // and files nothing uses any more are deleted
  els.editor.addEventListener('close', () => {
    for (const id of unsavedBlobs.keys()) forgetUrl(id);
    unsavedBlobs.clear();
    unsavedThumbs.clear();
    editorMedia = [];
    editorPoster = null;
    noteBlocks = [];
    noteCaret = null;
    hideLinkTool();
    collectMedia();
  });

  // ---------- Editor ----------
  // Each date/time group ("start", plus "end" for periods) has six date/time
  // inputs, plus a number input used instead on number timelines. Which ones
  // show depends on the timeline's format (see the [data-format] CSS rules).
  const PARTS = ['day', 'month', 'year', 'hour', 'minute', 'second'];
  const groups = {};
  document.querySelectorAll('.when').forEach((box) => {
    const inputs = {};
    PARTS.forEach((part) => { inputs[part] = box.querySelector(`[data-part="${part}"]`); });
    inputs.num = box.querySelector('[data-part="num"]');
    inputs.num.addEventListener('input', () => { formatNumberInput(inputs.num); clearError(); });
    inputs.num.addEventListener('keydown', (e) => stepOverComma(e, inputs.num));
    // AD / BC, next to the year
    inputs.era = box.querySelector('.era-toggle');
    inputs.era.addEventListener('click', () => setEra(inputs.era, inputs.era.dataset.era === 'BC' ? 'AD' : 'BC'));
    inputs.custom = []; // the boxes for a custom timeline's units, built when the editor opens
    groups[box.dataset.group] = {
      box,
      customBox: box.querySelector('.custom-input'),
      inputs,
      list: PARTS.map((part) => inputs[part]),
      select: box.querySelector('.link-select'),
      linkedTo: box.querySelector('.linked-to'),
      fields: box.querySelector('.field-row'),
    };
  });
  const kindButtons = [...document.querySelectorAll('[data-kind]')];
  let editorKind = 'moment';
  let editorPlacement = 'start';
  // The period's links being edited: { start, end }, each { id, edge } or null
  let editorRefs = { start: null, end: null };
  const isShown = (input) => input.offsetParent !== null;

  // The BC button: lit up when the year is BC, greyed out when it's AD
  function setEra(button, era) {
    button.dataset.era = era;
    button.setAttribute('aria-pressed', String(era === 'BC'));
    button.title = era === 'BC' ? 'BC (before Christ): on. Click for AD' : 'Click if the year is BC (before Christ)';
    button.setAttribute('aria-label', button.title);
    clearError();
  }

  // Year digits as typed, with a comma before every third digit from the end
  // once there are 5 or more: 10000 -> "10,000" (1969 stays "1969")
  const formatYearDigits = (digits) => (digits.length >= 5 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : digits);

  // Reformats a year box as you type: digits only (at most 11), with commas,
  // keeping the caret after the same digit it was after
  function formatYearInput(input) {
    const digitsBefore = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
    const text = formatYearDigits(input.value.replace(/\D/g, '').slice(0, String(YEAR_LIMIT).length));
    if (text === input.value) return;
    input.value = text;
    let pos = 0;
    for (let seen = 0; pos < text.length && seen < digitsBefore; pos++) if (/\d/.test(text[pos])) seen++;
    input.setSelectionRange(pos, pos);
  }

  // Deleting next to a comma would just put it back, so step over it first
  function stepOverComma(e, input) {
    if ((e.key !== 'Backspace' && e.key !== 'Delete') || input.selectionStart !== input.selectionEnd) return;
    const at = input.selectionStart;
    if (e.key === 'Backspace' && input.value[at - 1] === ',') input.setSelectionRange(at - 1, at - 1);
    if (e.key === 'Delete' && input.value[at] === ',') input.setSelectionRange(at + 1, at + 1);
  }

  // The value box (unitless timelines): an optional minus, digits and a decimal
  // point (up to 3 decimals), with commas in the whole part from 5 digits on:
  // 1000000.5 -> "1,000,000.5". (Commas are only ever the thousands separator.)
  // The boxes for custom units use the same thing with parts left out: only
  // the biggest unit takes a minus, only the smallest takes decimals, and
  // the ones between have no commas.
  function formatNumberText(text, { minus = true, decimals: allowDecimals = true, commas = true } = {}) {
    const negative = minus && /^\s*[-−]/.test(text);
    const body = text.replace(/[^\d.]/g, '');
    const dot = allowDecimals ? body.indexOf('.') : -1;
    const digits = (dot < 0 ? body.replace(/\./g, '') : body.slice(0, dot)).slice(0, 16);
    const whole = commas ? formatYearDigits(digits) : digits;
    const decimals = dot < 0 ? null : body.slice(dot + 1).replace(/\./g, '').slice(0, 3);
    return (negative ? '-' : '') + whole + (decimals === null ? '' : `.${decimals}`);
  }

  // Reformats the value box as you type, keeping the caret after the same character
  function formatNumberInput(input, options) {
    const meaningful = /[\d.\-−]/;
    const before = [...input.value.slice(0, input.selectionStart ?? input.value.length)].filter((c) => meaningful.test(c)).length;
    const text = formatNumberText(input.value, options);
    if (text === input.value) return;
    input.value = text;
    let pos = 0;
    for (let seen = 0; pos < text.length && seen < before; pos++) if (meaningful.test(text[pos])) seen++;
    input.setSelectionRange(pos, pos);
  }

  // The year box grows with the number typed, for years like 250,000
  const sizeYear = (input) => { input.style.width = `${Math.max(4, input.value.length) + 0.6}ch`; };

  function fillGroup(group, date, time, num) {
    const { inputs } = groups[group];
    const p = date ? parts(date, time) : null;
    const pad = (n) => String(n).padStart(2, '0');
    inputs.day.value = p && p.d ? pad(p.d) : '';
    inputs.month.value = p && p.m ? pad(p.m) : '';
    // Astronomical years: 0 is 1 BC, -1 is 2 BC, ...
    inputs.year.value = p ? formatYearDigits(String(p.y > 0 ? p.y : 1 - p.y)) : '';
    setEra(inputs.era, p && p.y <= 0 ? 'BC' : 'AD');
    sizeYear(inputs.year);
    inputs.hour.value = p && p.hh !== null ? pad(p.hh) : '';
    inputs.minute.value = p && p.hh !== null ? pad(p.mm) : '';
    inputs.second.value = p && p.hasSeconds ? pad(p.ss) : '';
    inputs.num.value = num == null ? '' : formatNumberText(String(num));
    if (state.format === 'custom') fillCustom(group, num);
  }

  // The first input to type into in a group, for this timeline's format
  const firstInput = (group) => {
    const f = groups[group].inputs;
    if (state.format === 'custom') return f.custom[0];
    return { number: f.num, year: f.year }[state.format] || f.day;
  };

  // --- Custom units: one box per unit, e.g. [5]' [11]" ---
  // Builds the boxes for both groups from the timeline's units
  function buildCustomInputs() {
    const { units } = customInfo();
    const last = units.length - 1;
    for (const [name, group] of Object.entries(groups)) {
      const prefix = name === 'end' ? 'End ' : '';
      group.customBox.textContent = '';
      group.inputs.custom = units.map((u, i) => {
        const input = el('input', 'seg seg-custom');
        input.type = 'text';
        input.inputMode = i === last ? 'decimal' : 'numeric';
        input.placeholder = '0';
        input.autocomplete = 'off';
        input.setAttribute('aria-label', `${prefix}value in ${u.label}`);
        const options = customInputOptions(i, units.length);
        const focusSeg = (j, dir = 1) => {
          const next = group.inputs.custom[j];
          if (next && j >= 0) { next.focus(); next.select(); } else if (dir < 0) input.focus();
        };
        input.addEventListener('input', () => {
          formatNumberInput(input, options);
          clearError();
          sizeCustom(input);
          // A box that can't take another digit passes on to the next one
          if (i > 0 && i < last) {
            const room = String(u.per - 1).length;
            const digits = input.value;
            if (digits.length >= room || (digits.length === 1 && Number(digits) * 10 > u.per - 1)) focusSeg(i + 1);
          }
        });
        input.addEventListener('keydown', (e) => {
          if (i === 0) stepOverComma(e, input);
          // Typing the unit's mark (or a space, ...) moves on to the next box, like "/" between dates
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !/[\d.\-−,]/.test(e.key)) {
            e.preventDefault();
            if (input.value && i < last) focusSeg(i + 1);
          } else if (e.key === 'Backspace' && !input.value && i > 0) {
            e.preventDefault();
            focusSeg(i - 1, -1);
          }
        });
        group.customBox.append(input, el('i', 'unit-tag', u.label));
        return input;
      });
    }
  }

  // What each box takes: the biggest unit a minus and commas (and decimals if it's
  // the only unit), the smallest decimals, those between whole numbers
  const customInputOptions = (i, count) => ({ minus: i === 0, decimals: i === count - 1, commas: i === 0 });

  const sizeCustom = (input) => { input.style.width = `calc(${Math.max(1, input.value.length)}ch + 10px)`; };

  function fillCustom(group, num) {
    const { inputs } = groups[group];
    const filled = num != null;
    const { negative, counts } = filled ? customParts(num) : { negative: false, counts: [] };
    inputs.custom.forEach((input, i) => {
      const count = filled ? String(Number(counts[i].toFixed(3))) : '';
      input.value = i === 0 && filled ? formatNumberText(`${negative ? '-' : ''}${count}`, customInputOptions(0, counts.length)) : count;
      sizeCustom(input);
    });
  }

  // `preset` fills in a new event, e.g. { categoryId } from the category panel
  function openEditor(id, preset = {}) {
    editingId = id || null;
    const ev = id ? state.events.find((e) => e.id === id) : null;
    const period = !!ev && isPeriod(ev);
    els.heading.textContent = ev ? 'Edit event' : 'Add event';
    els.fTitle.value = ev ? ev.title : '';
    loadEditorAttachments(ev);
    els.fDelete.hidden = !ev;
    els.fDuplicate.hidden = !ev;

    editorKind = period ? 'period' : 'moment';
    editorPlacement = ev && ev.placement === 'middle' ? 'middle' : 'start';
    // Years have up to 11 digits (on date timelines, without a date beyond 200,000),
    // plus the commas shown between them
    for (const g of Object.values(groups)) g.inputs.year.maxLength = String(YEAR_LIMIT).length + 4;
    if (state.format === 'custom') buildCustomInputs();
    fillGroup('start', ev ? ev.date : '', ev ? ev.time : '', ev ? ev.num : null);
    fillGroup('end', period ? ev.endDate : '', period ? ev.endTime : '', period ? ev.endNum : null);
    setEditorColor(ev && ev.color ? ev.color : '');
    const categoryId = ev ? ev.categoryId : preset.categoryId;
    editorCategory = categoryId && findCategory(categoryId) ? categoryId : '';
    buildCategoryOptions();
    newCatRow.hidden = true;
    editorRefs = {
      start: period && ev.startRef ? { ...ev.startRef } : null,
      end: period && ev.endRef ? { ...ev.endRef } : null,
    };
    buildLinkOptions('start');
    buildLinkOptions('end');
    clearError();
    els.form.dataset.format = state.format;
    updateEditor();

    els.editor.showModal();
    autosizeNotes(); // (the text boxes can only be measured once the dialog is showing)
    if (!ev) els.fTitle.focus();
  }

  // Shows the fields for the chosen type, and keeps the dot-position choice
  // in step with the date: it names the year/month/day, and is greyed out
  // once a time is set (the moment is then exact).
  function updateEditor() {
    const period = editorKind === 'period';
    kindButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === editorKind)));
    groups.end.box.hidden = !period;
    groups.start.box.querySelector('.when-head').hidden = !period;
    // The "Default" button gives back what the event gets without its own
    // colour: its category's colour, or its type's default
    const cat = findCategory(editorCategory);
    const def = editorChooser.defaultButton;
    def.title = cat ? `Back to the tag's colour (${cat.name})` : 'Back to the default (purple for moments, teal for periods)';
    def.setAttribute('aria-label', def.title);
    refreshColorDot();
    // A linked edge shows what it's linked to instead of its date inputs
    for (const edge of ['start', 'end']) {
      const g = groups[edge];
      const ref = period ? editorRefs[edge] : null;
      g.fields.hidden = !!ref;
      g.linkedTo.hidden = !ref;
      if (ref) g.linkedTo.textContent = describeLink(edge, ref);
      const button = g.select.closest('.link-pick');
      button.classList.toggle('is-linked', !!ref);
      button.querySelector('.link-btn-text').textContent = ref ? 'Linked' : 'Link';
    }
    // Numbers are exact, so only dates get the dot-position choice
    els.placement.hidden = period || numeric();
    document.querySelectorAll('.date-label').forEach((label) => {
      label.textContent = state.format === 'year' ? 'Year' : 'Date';
    });

    const s = groups.start.inputs;
    const hasTime = [s.hour, s.minute, s.second].some((input) => input.value !== '');
    const unit = s.day.value ? 'day' : s.month.value || state.format === 'calendar' ? 'month' : 'year';
    const middle = editorPlacement === 'middle';
    els.placement.innerHTML = placementIcon(!hasTime && middle);
    els.placement.disabled = hasTime;
    els.placement.setAttribute('aria-pressed', String(!hasTime && middle));
    els.placement.title = hasTime
      ? 'Dot position: not needed, the time sets the exact moment'
      : `Dot at the ${middle ? 'middle' : 'start'} of the ${unit} (click for ${middle ? 'start' : 'middle'})`;
    els.placement.setAttribute('aria-label', els.placement.title);

    // Only periods get a hint: how a partial end date is read isn't obvious
    const hint = {
      datetime: 'A period ending in "1972" runs to the end of 1972.',
      year: 'A period ending in 1972 runs to the end of 1972.',
      calendar: 'A period ending in just a month runs to the end of that month.',
    }[state.format];
    els.fHint.hidden = !period || !hint;
    els.fHint.textContent = period && hint ? hint : '';
  }

  kindButtons.forEach((b) => b.addEventListener('click', () => {
    editorKind = b.dataset.kind;
    clearError();
    updateEditor();
  }));
  els.placement.addEventListener('click', () => {
    editorPlacement = editorPlacement === 'middle' ? 'start' : 'middle';
    updateEditor();
  });

  // A span with end caps and the dot at its start or middle
  function placementIcon(middle) {
    const cx = middle ? 12 : 5;
    return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12h18M3 8v8M21 8v8"/><circle cx="${cx}" cy="12" r="3" fill="currentColor"/></svg>`;
  }

  // --- Colour ---
  // '' means the default (purple for moments, teal for periods)
  const PRESET_COLORS = [
    ['Red', '#dc2626'], ['Orange', '#ea580c'], ['Green', '#16a34a'],
    ['Blue', '#2563eb'], ['Gold', '#ca8a04'], ['Pink', '#db2777'],
  ];
  // "#ABC" or "abc123" -> "#aabbcc"; null if it isn't a hex colour
  function normalizeHex(text) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
    if (!m) return null;
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return `#${hex.toLowerCase()}`;
  }

  // A row of colour swatches: optionally "Default" (''), the presets, a
  // custom colour (the system picker) and a hex code box. Calls
  // onChange(color) when the user picks one; set(color) shows a colour
  // without calling it.
  // `rowBreak` starts the custom colour and hex code on a row of their own.
  // `withReset` ends that row with a "Default" button (back to no colour of its own).
  function colorChooser({ withDefault = false, withReset = false, presets = PRESET_COLORS, rowBreak = false, onChange }) {
    const box = el('div', 'swatches');
    const entries = withDefault ? [['Default', ''], ...presets] : presets;
    const buttons = entries.map(([name, color]) => {
      const b = el('button', color ? 'swatch' : 'swatch swatch-default');
      b.type = 'button';
      b.dataset.color = color;
      b.title = name;
      b.setAttribute('aria-label', name);
      if (color) b.style.background = color;
      b.addEventListener('click', () => pick(color));
      box.appendChild(b);
      return b;
    });

    // The native picker sits invisibly over the rainbow swatch
    const custom = el('label', 'swatch swatch-custom');
    custom.title = 'Custom colour';
    const picker = el('input');
    picker.type = 'color';
    picker.setAttribute('aria-label', 'Custom colour');
    custom.appendChild(picker);

    const hex = el('input', 'hex-input');
    hex.type = 'text';
    hex.maxLength = 7;
    hex.placeholder = '#hex';
    hex.autocomplete = 'off';
    hex.spellcheck = false;
    hex.setAttribute('aria-label', 'Hex colour code');
    // The colours come first, then the wheel and the hex code
    if (rowBreak) box.append(el('span', 'swatch-break'));
    box.append(custom, hex);
    let resetButton = null;
    if (withReset) {
      resetButton = el('button', 'link-btn swatch-reset', 'Default');
      resetButton.type = 'button';
      resetButton.addEventListener('click', () => pick(''));
      box.append(resetButton);
    }

    let current = '';
    function set(color) {
      current = color;
      const isPreset = color === '' || buttons.some((b) => b.dataset.color === color);
      if (resetButton) resetButton.disabled = color === '';
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === color)));
      custom.classList.toggle('is-selected', !isPreset);
      custom.style.background = isPreset ? '' : color;
      if (color) picker.value = color;
      if (document.activeElement !== hex) hex.value = color;
      hex.classList.remove('invalid');
    }
    function pick(color) {
      set(color);
      onChange(color);
    }

    picker.addEventListener('input', () => pick(picker.value));
    hex.addEventListener('input', () => {
      const value = normalizeHex(hex.value);
      hex.classList.toggle('invalid', !!hex.value.trim() && !value);
      if (value) pick(value);
    });
    hex.addEventListener('blur', () => { hex.value = current; hex.classList.remove('invalid'); });

    return { el: box, set, defaultButton: withDefault ? buttons[0] : resetButton };
  }

  // The event form's colour: '' means the default (its category's colour,
  // or purple for moments and teal for periods)
  // The form shows only the current colour, as a dot; pressing it opens a menu
  // with a dozen colours, the system's colour picker and the hex code
  const EDITOR_COLORS = [
    ['Red', '#dc2626'], ['Orange', '#ea580c'], ['Gold', '#ca8a04'], ['Lime', '#65a30d'],
    ['Green', '#16a34a'], ['Teal', '#0d9488'], ['Cyan', '#0891b2'], ['Blue', '#2563eb'],
    ['Indigo', '#4f46e5'], ['Purple', '#9333ea'], ['Pink', '#db2777'],
  ];
  // The tags' menu has no "Default" swatch, so it has one more colour
  const TAG_COLORS = [...EDITOR_COLORS, ['Brown', '#92400e']];
  let editorColor = '';
  const colorBtn = $('#f-color-btn');
  const colorPop = $('#f-color-pop');
  const editorChooser = colorChooser({
    withReset: true,
    presets: TAG_COLORS,
    onChange: (color) => { editorColor = color; refreshColorDot(); },
  });
  colorPop.appendChild(editorChooser.el);

  // The dot shows the colour the event will have: its own, else its tag's, else its type's
  function refreshColorDot() {
    const cat = findCategory(editorCategory);
    const fallback = cat ? cat.color : editorKind === 'period' ? 'var(--period)' : 'var(--accent)';
    colorBtn.style.background = editorColor || fallback;
    colorBtn.title = editorColor ? 'Colour: change' : cat ? `Colour: the tag's (${cat.name}). Change` : 'Colour: the default. Change';
    colorBtn.setAttribute('aria-label', colorBtn.title);
  }
  function setEditorColor(color) {
    editorColor = color;
    editorChooser.set(color);
    refreshColorDot();
    closeColorMenu();
  }
  function closeColorMenu() {
    colorPop.hidden = true;
    colorBtn.setAttribute('aria-expanded', 'false');
  }
  colorBtn.addEventListener('click', () => {
    colorPop.hidden = !colorPop.hidden;
    colorBtn.setAttribute('aria-expanded', String(!colorPop.hidden));
  });
  // A swatch picks and closes the menu; the custom picker and hex box stay open while you adjust
  colorPop.addEventListener('click', (e) => { if (e.target.closest('.swatch:not(.swatch-custom), .swatch-reset')) closeColorMenu(); });
  els.editor.addEventListener('click', (e) => { if (!e.target.closest('#f-color-btn, #f-color-pop')) closeColorMenu(); });
  els.editor.addEventListener('close', closeColorMenu);
  // Escape closes the menu first, not the whole form
  els.editor.addEventListener('cancel', (e) => { if (!colorPop.hidden) { e.preventDefault(); closeColorMenu(); } });

  // --- Categories ---
  let editorCategory = ''; // the category chosen in the event form ('' = none)
  const catSelect = $('#f-category');
  const newCatRow = $('#f-newcat');
  const newCatName = $('#f-newcat-name');
  const NEW_CATEGORY = '(new)';

  // New categories get the next preset colour in turn
  function addCategory(name) {
    const cat = { id: newId(), name, color: PRESET_COLORS[state.categories.length % PRESET_COLORS.length][1] };
    state.categories.push(cat);
    save();
    return cat;
  }

  // Events in a deleted category stay, without a category
  function deleteCategory(id) {
    state.categories = state.categories.filter((c) => c.id !== id);
    state.events.forEach((ev) => { if (ev.categoryId === id) delete ev.categoryId; });
    save();
  }

  function buildCategoryOptions() {
    catSelect.textContent = '';
    const option = (value, label) => {
      const o = el('option', null, label);
      o.value = value;
      catSelect.appendChild(o);
    };
    option('', 'No tag');
    state.categories.forEach((c) => option(c.id, c.name));
    option(NEW_CATEGORY, '+ New tag…');
    catSelect.value = editorCategory;
  }

  catSelect.addEventListener('change', () => {
    if (catSelect.value === NEW_CATEGORY) {
      // Name it in the row below; keep the current choice until it's added
      catSelect.value = editorCategory;
      newCatRow.hidden = false;
      newCatName.value = '';
      newCatName.focus();
      return;
    }
    editorCategory = catSelect.value;
    newCatRow.hidden = true;
    updateEditor();
  });

  function addCategoryFromEditor() {
    const name = newCatName.value.trim();
    if (!name) return;
    editorCategory = addCategory(name).id;
    buildCategoryOptions();
    newCatRow.hidden = true;
    updateEditor();
  }
  $('#f-newcat-add').addEventListener('click', addCategoryFromEditor);
  newCatName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCategoryFromEditor(); }
  });

  // --- Category panel ---
  // Always visible next to (or above) the timeline: one row per category.
  // Clicking a row opens it: rename, recolour, see its events (click one to
  // jump to it, × to take it out), add new or existing events, or delete it.
  const catPanel = $('#cat-panel');
  const catList = $('#cat-list');
  let openCategoryId = null;
  let colorOpenId = null; // the category whose colour options are showing
  let pickerForId = null; // the category whose "Add existing" checklist is open...
  let pickerSelected = new Set(); // ...and the events ticked in it
  function closePicker() {
    pickerForId = null;
    pickerSelected = new Set();
  }

  // The open category has a section of its own: its row and everything under
  // it (name, colours, events, buttons, the checklist). Clicking anywhere
  // outside that section closes it, even elsewhere in the tags box (its title,
  // the empty space, another tag's row). Exceptions: the controls that do their
  // own thing (another tag's button opens that tag, "+" adds a tag, the
  // collapse/expand buttons) and dialogs (e.g. the event form opened from
  // "+ New event").
  document.addEventListener('click', (e) => {
    if (openCategoryId === null) return;
    // The event's path, not e.target: a click inside the panel can rebuild it,
    // detaching the clicked element before this runs
    const path = e.composedPath();
    const matches = (selector) => path.some((n) => n instanceof Element && n.matches(selector));
    if (path.some((n) => n.tagName === 'DIALOG')) return;
    if (matches('.cat-item.open')) return; // (inside the open section)
    if (matches('.cat-toggle, .cat-dot, #cat-add, #cat-collapse, #cat-expand')) return;
    // (renderCategories holds off while a name is being typed)
    if (catPanel.contains(document.activeElement)) document.activeElement.blur();
    openCategoryId = null;
    colorOpenId = null;
    renderCategories();
  });

  function eventsIn(catId) {
    return state.events
      .filter((ev) => ev.categoryId === catId)
      .map((ev) => ({ ev, t: eventSpan(ev).t }))
      .sort((a, b) => a.t - b.t)
      .map(({ ev }) => ev);
  }

  // The events that aren't in a category yet (or are in another one), in time order
  function eventsOutside(catId) {
    return state.events
      .filter((ev) => ev.categoryId !== catId)
      .map((ev) => ({ ev, t: eventSpan(ev).t }))
      .sort((a, b) => a.t - b.t)
      .map(({ ev }) => ev);
  }

  function renderCategories() {
    // Don't rebuild while the user is typing a name or picking a colour in it
    if (catPanel.contains(document.activeElement) && document.activeElement.matches('input')) return;
    // The checklist belongs to the open category: closing it (or opening another) drops it
    if (pickerForId !== openCategoryId) closePicker();
    catList.textContent = '';
    for (const cat of state.categories) catList.appendChild(categoryItem(cat));
    if (scale) updateJumps(); // (the box may now reach down to Previous in horizontal mode, or no longer)
  }

  function categoryItem(cat) {
    const open = cat.id === openCategoryId;
    const members = eventsIn(cat.id);
    const item = el('li', open ? 'cat-item open' : 'cat-item');

    // The row: a colour dot (shows the colour options), then the name and
    // count (opens/closes the category)
    const row = el('div', 'cat-row');
    const colorOpen = open && colorOpenId === cat.id;
    const dot = el('button', 'cat-dot');
    dot.type = 'button';
    dot.style.background = cat.color;
    dot.title = colorOpen ? 'Hide colours' : 'Change colour';
    dot.setAttribute('aria-label', `${dot.title} of ${cat.name}`);
    dot.setAttribute('aria-pressed', String(colorOpen));
    dot.addEventListener('click', () => {
      openCategoryId = cat.id;
      colorOpenId = colorOpen ? null : cat.id;
      renderCategories();
    });
    const toggle = el('button', 'cat-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.append(el('span', 'cat-name', cat.name), el('span', 'cat-count', String(members.length)));
    toggle.addEventListener('click', () => {
      openCategoryId = open ? null : cat.id;
      colorOpenId = null;
      renderCategories();
    });
    row.append(dot, toggle);
    item.appendChild(row);
    if (!open) return item;

    const body = el('div', 'cat-body');

    const name = el('input', 'cat-name-input');
    name.value = cat.name;
    name.maxLength = 40;
    name.setAttribute('aria-label', 'Tag name');
    name.addEventListener('input', () => {
      if (!name.value.trim()) return; // keep the old name until there's a new one
      cat.name = name.value.trim();
      row.querySelector('.cat-name').textContent = cat.name;
      save();
    });
    name.addEventListener('blur', () => { name.value = cat.name; });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

    // Recolouring updates the timeline straight away (the panel isn't rebuilt,
    // so the colour picker stays open). It reaches the tag's events too, even
    // ones given a colour of their own: that colour is dropped, so they follow
    // the tag again
    // The same colour menu as the event form's: twelve colours (the form's
    // "Default" is replaced by one more), then the custom picker and the hex
    // code. Picking a swatch closes it (the custom picker and hex box stay
    // open while you adjust).
    const chooser = colorChooser({
      presets: TAG_COLORS,
      rowBreak: true,
      onChange: (color) => {
        cat.color = color;
        for (const ev of state.events) if (ev.categoryId === cat.id) delete ev.color;
        dot.style.background = color;
        save();
        render();
      },
    });
    chooser.set(cat.color);
    chooser.el.addEventListener('click', (e) => {
      if (!e.target.closest('.swatch:not(.swatch-custom)')) return;
      colorOpenId = null;
      renderCategories();
    });

    // Its events
    const list = el('ul', 'cat-events');
    for (const ev of members) {
      const li = el('li');
      const go = el('button', 'cat-event');
      go.type = 'button';
      go.append(el('span', null, ev.title), el('small', null, formatEventDate(ev)));
      go.title = 'Show on the timeline';
      go.addEventListener('click', () => {
        // Clicking the same event again while the flight to it is under way lands it at once
        const key = `event:${ev.id}`;
        if (!skipFlight(key)) jumpTo(items.find((it) => it.id === ev.id), undefined, key);
      });
      const remove = el('button', 'cat-remove');
      remove.type = 'button';
      remove.innerHTML = '&times;';
      remove.title = `Take “${ev.title}” out of this tag`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => {
        delete ev.categoryId;
        save();
        render();
      });
      li.append(go, remove);
      list.appendChild(li);
    }
    if (!members.length) list.appendChild(el('li', 'cat-none', 'No events yet'));

    // Add a new event (opens the form with this category chosen) or an existing one
    const actions = el('div', 'cat-actions');
    const addNew = el('button', 'link-btn cat-new', '+ New event');
    addNew.type = 'button';
    addNew.addEventListener('click', () => openEditor(null, { categoryId: cat.id }));
    actions.appendChild(addNew);
    const others = eventsOutside(cat.id);
    const pickerOpen = others.length > 0 && pickerForId === cat.id;
    if (others.length) {
      const trigger = el('button', 'link-btn cat-new', '+ Add existing');
      trigger.type = 'button';
      trigger.setAttribute('aria-expanded', String(pickerOpen));
      trigger.addEventListener('click', () => {
        if (pickerOpen) closePicker();
        else { pickerForId = cat.id; pickerSelected = new Set(); }
        renderCategories();
      });
      actions.appendChild(trigger);
    }

    const del = el('button', 'cat-delete', 'Delete tag');
    del.type = 'button';
    del.title = 'Its events stay, without a tag';
    del.addEventListener('click', () => {
      deleteCategory(cat.id);
      openCategoryId = null;
      render();
    });

    // Colour options only while the dot has been clicked; the checklist only
    // while "+ Add existing" is open
    body.append(
      ...(colorOpen ? [chooser.el] : []),
      name,
      list,
      actions,
      ...(pickerOpen ? [existingPicker(cat, others)] : []),
      del,
    );
    item.appendChild(body);
    return item;
  }

  // "+ Add existing": a checklist of the events that aren't in this category.
  // Tick as many as you like, then Add puts them all in at once. An event can
  // only be in one category, so ones already in another are moved here.
  function existingPicker(cat, candidates) {
    for (const id of [...pickerSelected]) {
      if (!candidates.some((ev) => ev.id === id)) pickerSelected.delete(id); // gone, or already in
    }
    const box = el('div', 'cat-picker');
    const list = el('ul', 'cat-picker-list');
    list.setAttribute('aria-label', `Events to add to ${cat.name}`);
    const addBtn = el('button', 'cat-picker-add');
    addBtn.type = 'button';
    const sync = () => {
      const n = pickerSelected.size;
      addBtn.textContent = n ? `Add (${n})` : 'Add';
      addBtn.disabled = n === 0;
    };

    for (const ev of candidates) {
      const label = el('label', 'cat-pick');
      const check = el('input');
      check.type = 'checkbox';
      check.checked = pickerSelected.has(ev.id);
      check.addEventListener('change', () => {
        if (check.checked) pickerSelected.add(ev.id);
        else pickerSelected.delete(ev.id);
        sync();
      });
      const from = findCategory(ev.categoryId);
      const when = formatEventDate(ev);
      const text = el('span', 'cat-pick-text');
      text.append(el('span', 'cat-pick-title', ev.title), el('small', null, from ? `${when} · in ${from.name}` : when));
      label.append(check, text);
      const li = el('li');
      li.appendChild(label);
      list.appendChild(li);
    }

    const cancel = el('button', 'cat-picker-cancel', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      closePicker();
      renderCategories();
    });
    addBtn.addEventListener('click', () => {
      for (const id of pickerSelected) {
        const ev = findEvent(id);
        if (ev) ev.categoryId = cat.id;
      }
      closePicker();
      save();
      render();
    });
    const foot = el('div', 'cat-picker-foot');
    foot.append(cancel, addBtn);
    box.append(list, foot);
    sync();
    return box;
  }

  // Collapse the box down to just the categories symbol, and back. The
  // choice is remembered; collapsing also closes any open category.
  function setCategoriesCollapsed(collapsed) {
    state.catsCollapsed = collapsed;
    save();
    if (collapsed) {
      openCategoryId = null;
      colorOpenId = null;
      renderCategories();
    }
    catPanel.classList.toggle('collapsed', collapsed);
    if (scale) updateJumps();
    $('#cat-collapse').setAttribute('aria-expanded', String(!collapsed));
    $('#cat-expand').setAttribute('aria-expanded', String(!collapsed));
    (collapsed ? $('#cat-expand') : $('#cat-collapse')).focus();
  }
  $('#cat-collapse').addEventListener('click', () => setCategoriesCollapsed(true));
  $('#cat-expand').addEventListener('click', () => setCategoriesCollapsed(false));

  // The "+" button: a new category, opened with its name ready to type
  $('#cat-add').addEventListener('click', () => {
    const cat = addCategory(`Tag ${state.categories.length + 1}`);
    openCategoryId = cat.id;
    renderCategories();
    const name = catList.querySelector('.cat-item.open .cat-name-input');
    name.focus();
    name.select();
  });

  // --- Links between periods and other events ---
  const selfId = () => editingId || '(new)';
  const refValue = (ref) => (ref ? `${ref.id}|${ref.edge}` : '');
  const parseRef = (value) => {
    if (!value) return null;
    const [id, edge] = value.split('|');
    return { id, edge };
  };

  // Whether linking this period's `edge` to `ref` would create a loop: it
  // would if following links from `ref` leads back to that same edge
  // (e.g. A starts when B ends, and B ends when A starts). Uses the links
  // being edited for this period, and the saved links of every other event.
  function wouldLoop(edge, ref) {
    const self = selfId();
    if (ref.id === self) return true;
    let node = ref;
    for (let steps = 0; steps < 1000; steps++) {
      let next;
      if (node.id === self) {
        if (node.edge === edge) return true;
        next = editorRefs[node.edge];
      } else {
        const ev = findEvent(node.id);
        next = ev && isPeriod(ev) ? ev[`${node.edge}Ref`] : null;
      }
      if (!next) return false;
      node = next;
    }
    return true;
  }

  // "Starts when “Project Gemini” ends (Nov 15, 1966)"
  function describeLink(edge, ref) {
    const target = findEvent(ref.id);
    if (!target) return '';
    const what = isPeriod(target) ? ` ${ref.edge === 'start' ? 'starts' : 'ends'}` : ' happens';
    const when = formatFields(resolveEdge(target, ref.edge).fields);
    return `${edge === 'start' ? 'Starts' : 'Ends'} when “${target.title}”${what} (${when})`;
  }

  // Fills a link dropdown: "Enter a date", then every other event in time
  // order (both edges of each period). Choices that would loop are disabled.
  function buildLinkOptions(edge) {
    const select = groups[edge].select;
    select.textContent = '';
    const own = el('option', null, numeric() ? 'No link (enter a value)' : 'No link (enter a date)');
    own.value = '';
    select.appendChild(own);

    const others = state.events
      .filter((ev) => ev.id !== selfId())
      .map((ev) => ({ ev, t: eventSpan(ev).t }))
      .sort((a, b) => a.t - b.t);
    const add = (group, label, ref) => {
      const option = el('option', null, label);
      option.value = refValue(ref);
      option.disabled = wouldLoop(edge, ref);
      if (option.disabled) option.textContent = `⊘ ${label} — would loop`;
      group.appendChild(option);
    };
    const moments = el('optgroup');
    moments.label = 'Link to a moment';
    const periods = el('optgroup');
    periods.label = 'Link to a period';
    for (const { ev } of others) {
      if (isPeriod(ev)) {
        for (const e of ['start', 'end']) {
          add(periods, `${ev.title}: ${e} (${formatFields(resolveEdge(ev, e).fields)})`, { id: ev.id, edge: e });
        }
      } else {
        add(moments, `${ev.title} (${formatEventDate(ev)})`, { id: ev.id, edge: 'start' });
      }
    }
    if (moments.children.length) select.appendChild(moments);
    if (periods.children.length) select.appendChild(periods);
    select.value = refValue(editorRefs[edge]);
  }

  for (const edge of ['start', 'end']) {
    groups[edge].select.addEventListener('change', () => {
      editorRefs[edge] = parseRef(groups[edge].select.value);
      clearError();
      // A new link can make choices on the other edge loop (or stop looping)
      buildLinkOptions(edge === 'start' ? 'end' : 'start');
      updateEditor();
    });
  }

  // --- Segmented date/time inputs ---
  // A first digit above this can't start a two-digit value, so move on right away
  const MAX_FIRST_DIGIT = { day: 3, month: 1, hour: 2, minute: 5, second: 5 };
  // Typed values above these are capped (e.g. "25" hours becomes "23")
  const MAX_VALUE = { day: 31, month: 12, hour: 23, minute: 59, second: 59 };

  Object.values(groups).forEach(({ list }) => {
    // Focus input i, or the nearest shown one in direction `dir` (some parts
    // are hidden in some formats, e.g. the year on calendar timelines)
    const focusSeg = (i, dir = 1) => {
      for (let j = i; j >= 0 && j < list.length; j += dir) {
        if (!isShown(list[j])) continue;
        list[j].focus();
        list[j].select();
        return;
      }
    };
    list.forEach((input, i) => {
      const part = input.dataset.part;
      input.addEventListener('input', () => {
        if (part === 'year') {
          // Years can be any length, so typing one never moves on by itself;
          // from 5 digits on they get commas: 10000 -> 10,000
          formatYearInput(input);
          clearError();
          updateEditor();
          sizeYear(input);
          return;
        }
        let digits = input.value.replace(/\D/g, '');
        const max = MAX_VALUE[part];
        if (max && Number(digits) > max) digits = String(max);
        if (digits !== input.value) input.value = digits;
        clearError();
        updateEditor();
        const full = digits.length >= input.maxLength;
        const early = digits.length === 1 && Number(digits) > (MAX_FIRST_DIGIT[part] ?? 9);
        if (full || early) focusSeg(i + 1);
      });
      input.addEventListener('keydown', (e) => {
        if (part === 'year') stepOverComma(e, input);
        if (['/', ':', '.', '-', ' '].includes(e.key)) {
          e.preventDefault();
          if (input.value) focusSeg(i + 1);
        } else if (e.key === 'Backspace' && !input.value && i > 0) {
          e.preventDefault();
          focusSeg(i - 1, -1);
        }
      });
    });
  });

  // Clicking the box around the fields (e.g. a separator) focuses the first empty one
  document.querySelectorAll('.seg-input').forEach((box) => {
    box.addEventListener('mousedown', (e) => {
      if (e.target.closest('input, button')) return; // e.g. the AD/BC toggle
      e.preventDefault();
      const inputs = [...box.querySelectorAll('input')].filter(isShown);
      (inputs.find((input) => !input.value) || inputs[inputs.length - 1]).focus();
    });
  });

  function showError(input, message) {
    els.fError.textContent = message;
    els.fError.hidden = false;
    (input.closest('.seg-input, .link-pick') || input).classList.add('invalid');
    input.focus();
  }

  function clearError() {
    els.fError.hidden = true;
    els.form.querySelectorAll('.invalid').forEach((n) => n.classList.remove('invalid'));
  }

  // Reads a group's value: the number box, or the boxes of a custom timeline's units
  const readValue = (group, prefix = '') => (state.format === 'custom' ? readCustom(group, prefix) : readNumber(group, prefix));

  // Reads the unit boxes of a custom timeline into one number (of the smallest
  // unit). Empty boxes count as 0; every unit after the biggest stays below
  // its ratio (inches 0 to 11). null if invalid.
  function readCustom(group, prefix = '') {
    const { units, sizes } = customInfo();
    const boxes = groups[group].inputs.custom;
    const last = units.length - 1;
    const fail = (input, message) => { showError(input, prefix + message); return null; };
    const texts = boxes.map((b) => b.value.trim().replace(/,/g, '').replace('−', '-'));
    if (texts.every((t) => t === '' || t === '-')) return fail(boxes[0], 'Enter a value.');
    const negative = texts[0].startsWith('-');
    texts[0] = texts[0].replace(/^-/, '');
    let total = 0;
    for (let i = 0; i <= last; i++) {
      const label = units[i].label;
      if (texts[i] === '') continue;
      const ok = i === last ? /^(\d+(\.\d{0,3})?|\.\d{1,3})$/.test(texts[i]) : /^\d+$/.test(texts[i]);
      if (!ok) return fail(boxes[i], i === last ? `Use a number with up to 3 decimals for ${label}.` : `Use a whole number for ${label}.`);
      const count = Number(texts[i]);
      if (i > 0 && count >= units[i].per) return fail(boxes[i], `Use 0 to ${(units[i].per - 1).toLocaleString()} for ${label}${i === last ? ' (decimals are fine)' : ''}.`);
      total += count * sizes[i];
    }
    if (total > NUM_LIMIT) {
      const smallest = units[last];
      return fail(boxes[0], `Values go up to ${formatNum(NUM_LIMIT)}${unitGlue(smallest.label)}${smallest.label} in the smallest unit.`);
    }
    return total === 0 ? 0 : negative ? -total : total;
  }

  // Reads a number input: up to 3 decimals, within ±NUM_LIMIT. null if invalid.
  function readNumber(group, prefix = '') {
    const input = groups[group].inputs.num;
    const fail = (message) => { showError(input, prefix + message); return null; };
    const raw = input.value.trim().replace(/,/g, '').replace('−', '-'); // (commas are thousands separators)
    if (!raw) return fail('Enter a number.');
    if (!/^[-+]?(\d+(\.\d{0,3})?|\.\d{1,3})$/.test(raw)) return fail('Use a number with up to 3 decimals, like 12.5 or -300.');
    const value = Number(raw);
    if (Math.abs(value) > NUM_LIMIT) return fail('Numbers go from −1,000,000,000,000,000 to 1,000,000,000,000,000.');
    return value === 0 ? 0 : value; // no -0
  }

  // Reads a date/time group into { date, time }, or shows what's wrong.
  // Only the parts this timeline's format uses are read: years only, or no
  // year (calendar timelines store CALENDAR_YEAR). `prefix` labels messages
  // for the end of a period.
  function readDateTime(group, prefix = '') {
    const f = groups[group].inputs;
    const used = {
      year: ['year'],
      calendar: ['day', 'month', 'hour', 'minute', 'second'],
    }[state.format] || PARTS;
    const [d, m, y0, hh, mi, ss] = PARTS.map((part) => (used.includes(part) && f[part].value !== '' ? Number(f[part].value.replace(/,/g, '')) : null));
    const calendar = state.format === 'calendar';
    const fail = (input, message) => { showError(input, prefix + message); return null; };

    if (calendar && m === null) return fail(f.month, 'Enter at least a month.');
    if (!calendar) {
      if (y0 === null) return fail(f.year, 'Enter at least a year.');
      if (y0 < 1) return fail(f.year, 'There\'s no year 0: the year before AD 1 is 1 BC.');
      if (y0 > YEAR_LIMIT) return fail(f.year, `Years go up to ${YEAR_LIMIT.toLocaleString()}.`);
      // Browsers can't handle calendar dates further out, so these take a year only
      if (!yearsAxis() && y0 > DATE_LIMIT && (m !== null || d !== null || hh !== null || mi !== null || ss !== null)) {
        return fail(m !== null || d !== null ? f.month : f.hour,
          'Beyond the year 200,000 (AD or BC), events can only have a year, not a month, day or time.');
      }
    }
    // Stored astronomically: 1 BC is year 0, 2 BC is -1, ...
    const y = calendar ? CALENDAR_YEAR : f.era.dataset.era === 'BC' ? 1 - y0 : y0;
    if (m !== null && (m < 1 || m > 12)) return fail(f.month, 'The month must be between 1 and 12.');
    if (d !== null && m === null) return fail(f.month, 'Add a month to go with the day.');
    if (d !== null) {
      const daysInMonth = makeDate(y, m + 1, 0).getDate();
      if (d < 1 || d > daysInMonth) return fail(f.day, `That month only has ${daysInMonth} days.`);
    }
    const anyTime = hh !== null || mi !== null || ss !== null;
    if (anyTime && d === null) {
      return fail(f.day, calendar ? 'A time needs a day and month.' : 'A time needs a full date (day, month and year).');
    }
    if (anyTime && hh === null) return fail(f.hour, 'Add the hour.');
    if (hh !== null && hh > 23) return fail(f.hour, 'Hours go from 0 to 23.');
    if (mi !== null && mi > 59) return fail(f.minute, 'Minutes go from 0 to 59.');
    if (ss !== null && ss > 59) return fail(f.second, 'Seconds go from 0 to 59.');

    const pad = (n, len = 2) => String(n).padStart(len, '0');
    let date = y >= 0 ? pad(y, 4) : String(y);
    if (m !== null) date += `-${pad(m)}`;
    if (d !== null) date += `-${pad(d)}`;
    let time = '';
    if (hh !== null) {
      time = `${pad(hh)}:${pad(mi || 0)}`; // empty minutes count as 00
      if (ss !== null) time += `:${pad(ss)}`;
    }
    return { date, time };
  }

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (savingEvent) return;
    const title = els.fTitle.value.trim();
    if (!title) return;
    const data = { title, kind: editorKind };
    if (!(editorKind === 'period' ? readPeriod(data) : readMoment(data))) return;
    if (editorColor) data.color = editorColor;    if (editorCategory) data.categoryId = editorCategory;
    if (noteString().length > NOTE_MAX + 200) {
      showError(noteBox.querySelector('textarea'), `The notes are too long (up to ${NOTE_MAX.toLocaleString()} characters).`);
      return;
    }

    // Photos still being prepared finish first; then new files are stored.
    // (An event without new files saves right away, with no waiting.)
    if (editorTasks.size || editorMedia.some((m) => unsavedBlobs.has(m.id))) {
      savingEvent = true;
      try {
        await Promise.all(editorTasks);
        if (!(await storeNewMedia())) return;
      } finally {
        savingEvent = false;
      }
    }
    // The notes as one string, the photos and videos in the order they appear in it
    data.note = noteString().trim();
    const placed = noteBlocks.filter((b) => b.type === 'group').flatMap((b) => b.items);
    if (editorPoster) {
      if (!placed.includes(editorPoster)) placed.push(editorPoster);
      data.poster = editorPoster.id;
    }
    if (placed.length) data.media = placed.map(({ id, kind, name }) => ({ id, kind, name }));

    let id = editingId;
    if (id) {
      // Replace rather than merge, so switching type drops the old type's fields
      const i = state.events.findIndex((ev) => ev.id === id);
      state.events[i] = { id, created: state.events[i].created, ...data };
    } else {
      id = newId();
      state.events.push({ id, created: Date.now(), ...data });
    }
    state.started = true; // adding an event from the home screen starts the timeline
    save();
    els.editor.close();
    pin(id);
    render();
    if (!editingId) jumpTo(items.find((it) => it.id === id));
  });

  // The readers below fill `data` from the form, returning false (with an
  // error shown) if something's invalid.
  function readMoment(data) {
    if (numeric()) {
      data.num = readValue('start');
      return data.num !== null;
    }
    const start = readDateTime('start');
    if (!start) return false;
    data.date = start.date;
    data.time = start.time;
    // With a time the moment is exact, so the dot position doesn't apply
    data.placement = start.time ? 'start' : editorPlacement;
    return true;
  }

  // Each edge is either linked (its current linked value is stored too, as a
  // fallback) or entered as a date/number
  function readPeriod(data) {
    for (const edge of ['start', 'end']) {
      const ref = editorRefs[edge];
      const prefix = edge === 'end' ? 'End: ' : '';
      let fields;
      if (ref) {
        data[`${edge}Ref`] = ref;
        fields = resolveEdge(findEvent(ref.id), ref.edge).fields;
      } else if (numeric()) {
        const num = readValue(edge, prefix);
        if (num === null) return false;
        fields = { num };
      } else {
        fields = readDateTime(edge, prefix);
        if (!fields) return false;
      }
      setOwnEdge(data, edge, fields);
    }
    const span = eventSpan(data);
    if (span.end <= span.t) {
      showError(editorRefs.end ? groups.end.select : firstInput('end'), 'The period must end after it starts.');
      return false;
    }
    return true;
  }

  // Before deleting an event, periods linked to it keep its current value
  // as their own date instead
  function unlinkFrom(id) {
    for (const ev of state.events) {
      if (!isPeriod(ev)) continue;
      for (const edge of ['start', 'end']) {
        const ref = ev[`${edge}Ref`];
        if (!ref || ref.id !== id) continue;
        setOwnEdge(ev, edge, resolveEdge(ev, edge).fields);
        delete ev[`${edge}Ref`];
      }
    }
  }

  els.fDelete.addEventListener('click', () => {
    unlinkFrom(editingId);
    state.events = state.events.filter((ev) => ev.id !== editingId);
    save();
    els.editor.close();
    render();
    collectMedia(true); // (even if that was the last event)
  });

  // Turns the form into a new, unsaved event with the same details (including
  // any unsaved edits), ready to adjust, e.g. its date. Saving adds it as a
  // new event; the original is left unchanged.
  els.fDuplicate.addEventListener('click', () => {
    editingId = null;
    els.heading.textContent = 'Duplicate event';
    els.fTitle.value = `${els.fTitle.value.trim()} (copy)`;
    els.fDelete.hidden = true;
    els.fDuplicate.hidden = true;
    clearError();
    firstInput('start').focus();
    firstInput('start').select();
  });

  $('#f-cancel').addEventListener('click', () => els.editor.close());

  // Close when tapping the backdrop
  els.editor.addEventListener('click', (e) => {
    if (e.target === els.editor) els.editor.close();
  });

  // ---------- Header controls ----------
  els.title.addEventListener('input', () => {
    state.title = els.title.value;
    document.title = state.title ? `${state.title} · Timeline Maker` : 'Timeline Maker';
    save();
  });
  els.title.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.title.blur(); });

  // Switching layout keeps the same moment in the middle of the view
  els.toggleDir.addEventListener('click', () => {
    const anchor = viewAnchor(); // measured in the old layout
    state.horizontal = !state.horizontal;
    save();
    if (state.horizontal) window.scrollTo(0, 0); // the horizontal timeline sits at the top
    render(anchor);
  });

  els.toggleOrder.addEventListener('click', () => {
    state.reversed = !state.reversed;
    save();
    render();
  });

  // Rebuilds the timeline: hiding the dates frees their space, which changes
  // card sizes (vertical) or where the axis sits (horizontal)
  els.toggleDates.addEventListener('click', () => {
    state.showDates = !state.showDates;
    save();
    render();
  });

  els.toggleGrid.addEventListener('click', () => {
    state.gridLevel = (state.gridLevel + 1) % GRID_LEVELS.length;
    save();
    updateControls();
    drawTicks();
  });

  // Discards the timeline and returns to the home screen: its events, title
  // and zoom go; view preferences (layout, order, gridlines, dates) stay
  $('#clear').addEventListener('click', async () => {
    if (fileBusy) return;
    const n = state.events.length;
    const choice = await askFile(
      'Go back to the home screen?',
      `This timeline${state.title ? ` (“${state.title}”)` : ''}${n ? `, with ${n} event${n === 1 ? '' : 's'},` : ''} will be discarded. If you want to keep it, save it to a file first.`,
      [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Discard', value: 'discard', kind: 'danger' },
        { label: 'Save, then go back', value: 'save', kind: 'primary' },
      ],
    );
    if (choice !== 'discard' && choice !== 'save') return;
    if (choice === 'save' && !(await saveToFile())) return; // (cancelled or failed: stay)
    state.events = [];
    state.categories = [];
    state.hidden = [];
    state.title = '';
    state.started = false;
    state.zoom = 1;
    pinned = [];
    expandedId = null;
    save();
    els.title.value = '';
    render();
    collectMedia(true); // (their photos and videos go too)
  });

  els.toggleAll.addEventListener('click', toggleAll);
  els.textLarger.addEventListener('click', () => changeNoteSize(1));
  els.textSmaller.addEventListener('click', () => changeNoteSize(-1));

  $('#add').addEventListener('click', () => { if (customReady()) openEditor(); });
  // "Create timeline": name it first, then open the empty timeline
  $('#create').addEventListener('click', () => {
    if (!customReady()) return;
    els.cTitle.value = '';
    els.createDialog.showModal();
    els.cTitle.focus();
  });
  $('#create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = els.cTitle.value.trim();
    if (!title) return;
    state.title = title;
    state.started = true;
    save();
    els.createDialog.close();
    els.title.value = title;
    render();
  });
  $('#c-cancel').addEventListener('click', () => els.createDialog.close());
  els.createDialog.addEventListener('click', (e) => {
    if (e.target === els.createDialog) els.createDialog.close();
  });

  // ---------- Custom units: the builder on the home screen ----------
  // One row per unit, biggest first: its label (what's shown after a number:
  // ' or ft) and, after the first, how many of it make 1 of the unit above.
  // Nothing is pre-filled: feet and inches are only suggested, as grey
  // placeholder text. The rows are the source of truth while the home screen
  // is up; whenever they're all valid they're saved as the timeline's units.
  let builderBuilt = false;
  let builderErrors = false; // show problems in red (after trying to go on with bad units)

  function buildBuilder() {
    builderBuilt = true;
    els.unitList.textContent = '';
    const units = state.custom ? state.custom.units : [{ label: '', per: null }, { label: '', per: null }];
    units.forEach((u) => els.unitList.appendChild(unitRow(u)));
    refreshBuilder(false);
  }

  function unitRow(u) {
    const row = el('li', 'unit-row');
    const head = el('div', 'unit-head');
    const remove = el('button', 'unit-remove');
    remove.type = 'button';
    remove.innerHTML = '&times;';
    head.append(el('span', 'unit-title'), remove);
    const fields = el('div', 'unit-fields');
    const field = el('label', 'unit-field');
    const label = el('input', 'u-label');
    label.type = 'text';
    label.maxLength = MAX_LABEL;
    label.autocomplete = 'off';
    label.value = u.label;
    field.append(el('span', null, 'Label'), label);
    const per = el('label', 'unit-per');
    const perInput = el('input', 'u-per');
    perInput.type = 'text';
    perInput.inputMode = 'numeric';
    perInput.maxLength = 8;
    perInput.autocomplete = 'off';
    perInput.setAttribute('aria-label', 'How many of this unit make 1 of the unit above');
    perInput.value = u.per ? String(u.per) : '';
    per.append(perInput, el('span', 'unit-per-text'));
    fields.append(field, per);
    row.append(head, fields);
    return row;
  }

  // Reads the rows: { units } if they're all valid, otherwise { error, input }
  function readBuilder() {
    const rows = [...els.unitList.children];
    const units = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const labelInput = row.querySelector('.u-label');
      const label = labelInput.value.trim();
      if (!label) return { error: `Give unit ${i + 1} a label: what's shown after a number, like ' or ft.`, input: labelInput };
      if (units.some((u) => u.label === label)) return { error: `Two units can't share the label ${label}.`, input: labelInput };
      let per = null;
      if (i > 0) {
        const perInput = row.querySelector('.u-per');
        const raw = perInput.value.trim().replace(/,/g, '');
        if (!/^\d+$/.test(raw) || Number(raw) < 2) {
          return { error: `Say how many ${label} make 1 ${units[i - 1].label}: a whole number, 2 or more.`, input: perInput };
        }
        per = Number(raw);
      }
      units.push({ label, per });
    }
    if (units.reduce((size, u, i) => (i ? size * u.per : 1), 1) > MAX_UNIT_SIZE) {
      return { error: 'These units multiply out too big: the biggest unit can hold at most a trillion of the smallest.', input: rows[rows.length - 1].querySelector('.u-per') };
    }
    return { units };
  }

  // "1' = 12\", 1 yd = 3 ft" (commas, not dots: a dot reads as multiplying)
  function describeUnits(units) {
    if (units.length === 1) return `Values read like 12.5${unitGlue(units[0].label)}${units[0].label}.`;
    return units.slice(1)
      .map((u, i) => `1${unitGlue(units[i].label)}${units[i].label} = ${u.per}${unitGlue(u.label)}${u.label}`)
      .join(', ');
  }

  // Grey suggestions in the empty boxes: a fortnight is 14 days, then something smaller
  const LABEL_HINTS = ['fortnight', 'days', 'hours'];
  function refreshBuilder(commit = true) {
    const rows = [...els.unitList.children];
    const labelOf = (row) => row.querySelector('.u-label').value.trim();
    rows.forEach((row, i) => {
      const where = i === 0 ? ' · biggest' : i === rows.length - 1 ? ' · smallest' : '';
      row.querySelector('.unit-title').textContent = `Unit ${i + 1}${where}`;
      row.querySelector('.unit-remove').hidden = rows.length === 1;
      row.querySelector('.unit-remove').setAttribute('aria-label', `Remove unit ${i + 1}`);
      row.querySelector('.u-label').placeholder = LABEL_HINTS[Math.min(i, LABEL_HINTS.length - 1)];
      row.querySelector('.unit-per').hidden = i === 0;
      if (i > 0) {
        row.querySelector('.u-per').placeholder = i === 1 ? '14' : '24';
        row.querySelector('.unit-per-text').textContent = `${labelOf(row) || 'this unit'} make 1 ${labelOf(rows[i - 1]) || 'the unit above'}`;
      }
    });
    els.unitAdd.disabled = els.unitAddBig.disabled = rows.length >= MAX_UNITS;
    const result = readBuilder();
    els.unitNote.classList.toggle('bad', !!result.error && builderErrors);
    els.unitNote.textContent = result.error || describeUnits(result.units);
    if (!result.error) {
      builderErrors = false;
      if (commit) {
        state.custom = { units: result.units };
        save();
      }
    }
  }

  els.unitList.addEventListener('input', () => refreshBuilder());
  els.unitList.addEventListener('click', (e) => {
    const remove = e.target.closest('.unit-remove');
    if (!remove) return;
    remove.closest('.unit-row').remove();
    refreshBuilder();
  });
  // A new unit goes below the smallest one, or above the biggest (which then
  // needs its own "how many make 1 of the unit above")
  const addUnit = (bigger) => () => {
    if (els.unitList.children.length >= MAX_UNITS) return;
    const row = unitRow({ label: '', per: null });
    if (bigger) els.unitList.prepend(row); else els.unitList.appendChild(row);
    refreshBuilder();
    row.querySelector('.u-label').focus();
  };
  els.unitAdd.addEventListener('click', addUnit(false));
  els.unitAddBig.addEventListener('click', addUnit(true));

  // Whether to carry on from the home screen (create, add an event): a custom
  // timeline needs valid units first, otherwise the problem is shown
  function customReady() {
    if (state.format !== 'custom' || els.home.hidden) return true;
    const result = readBuilder();
    if (!result.error) return true;
    builderErrors = true;
    refreshBuilder();
    result.input.focus();
    return false;
  }

  // Timeline format: only offered while the timeline is empty (see render)
  const formatButtons = [...document.querySelectorAll('[data-format]')];
  formatButtons.forEach((b) => b.addEventListener('click', () => {
    if (state.events.length) return;
    state.format = b.dataset.format;
    save();
    updateControls();
  }));

  $('#example').addEventListener('click', () => {
    const ex = [
      ['Sputnik 1 launched', '1957-10-04', '', 'First artificial satellite in orbit.'],
      ['Yuri Gagarin orbits Earth', '1961-04-12', '06:07', 'First human in space.'],
      ['"We choose to go to the Moon"', '1962-09-12', '', 'Kennedy\'s speech at Rice University.'],
      ['Project Gemini', '1965-03-23', '', 'Ten crewed flights practising spacewalks, docking and long missions.', '1966-11-15'],
      ['Apollo 8 launches', '1968-12-21', '', 'First crewed mission to orbit the Moon.'],
      ['Apollo 11 launches', '1969-07-16', '13:32', ''],
      ['Apollo 11 lands on the Moon', '1969-07-20', '20:17', 'Armstrong and Aldrin land in the Sea of Tranquility.'],
      ['Apollo 13 launches', '1970-04-11', '', '"Houston, we\'ve had a problem."'],
      ['Apollo 17 launches', '1972-12-07', '', 'Last crewed Moon landing (so far).'],
    ];
    state.title = state.title || 'The Space Race';
    state.format = 'datetime'; // the example uses full dates and times
    state.started = true;
    state.events = ex.map(([title, date, time, note, endDate], i) => ({
      id: newId(),
      created: Date.now() + i,
      title,
      ...(endDate ? { kind: 'period', date, time, endDate, endTime: '' } : { kind: 'moment', date, time, placement: 'start' }),
      note,
    }));
    state.hidden = [];
    save();
    render();
    collectMedia(true);
  });

  // ---------- Saving and opening files ----------
  // "Save to file" downloads the whole timeline: a plain .json file when it
  // has no photos or videos, otherwise a .zip holding timeline.json and a
  // media/ folder with the files. "Open file" reads either kind back, checks
  // everything in it (the file isn't trusted), and replaces the current
  // timeline, after offering to save that one first.
  const FILE_APP = 'timeline-maker';
  const FILE_VERSION = 1;
  const MAX_FILE_EVENTS = 5000;
  const MEDIA_EXT = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/ogg': '.ogv',
  };

  // A problem with a file that can be put to the user as it is
  class FileProblem extends Error {}
  const problem = (message) => { throw new FileProblem(message); };

  // --- ZIP files ---
  // Written without compression (photos and videos are compressed already),
  // so a large video is never copied into memory: the zip is a Blob made of
  // pieces. Reading also copes with zips made elsewhere (deflate).
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  async function crc32(blob) {
    let crc = 0xffffffff;
    const feed = (bytes) => { for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); };
    if (blob.stream) {
      const reader = blob.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        feed(value);
      }
    } else {
      feed(new Uint8Array(await blob.arrayBuffer()));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // entries: [{ name, blob }] -> a zip Blob
  async function makeZip(entries) {
    if (entries.length > 65000) problem('This timeline has too many files to save in one zip.');
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const { name, blob } of entries) {
      const nameBytes = encoder.encode(name);
      const crc = await crc32(blob);
      if (blob.size > 0xfffffff0 || offset > 0xfffffff0) problem('This timeline is too big to save in one file (over 4 GB).');
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // (names are UTF-8)
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, blob.size, true);
      local.setUint32(22, blob.size, true);
      local.setUint16(26, nameBytes.length, true);
      parts.push(local.buffer, nameBytes, blob);
      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(12, dosTime, true);
      entry.setUint16(14, dosDate, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, blob.size, true);
      entry.setUint32(24, blob.size, true);
      entry.setUint16(28, nameBytes.length, true);
      entry.setUint32(42, offset, true);
      central.push(entry.buffer, nameBytes);
      offset += 30 + nameBytes.length + blob.size;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, central.reduce((n, p) => n + p.byteLength, 0), true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  // The list of files in a zip: Map of name -> { method, csize, offset }
  async function readZip(file) {
    const tail = new DataView(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
    let end = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error('no zip directory');
    const count = tail.getUint16(end + 10, true);
    const size = tail.getUint32(end + 12, true);
    const start = tail.getUint32(end + 16, true);
    const dir = new DataView(await file.slice(start, start + size).arrayBuffer());
    const decoder = new TextDecoder();
    const entries = new Map();
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
      const nameLen = dir.getUint16(p + 28, true);
      const name = decoder.decode(new Uint8Array(dir.buffer, p + 46, nameLen));
      // (some tools write paths with backslashes)
      entries.set(name.replace(/\\/g, '/'), { method: dir.getUint16(p + 10, true), csize: dir.getUint32(p + 20, true), offset: dir.getUint32(p + 42, true) });
      p += 46 + nameLen + dir.getUint16(p + 30, true) + dir.getUint16(p + 32, true);
    }
    // A zip made by zipping the unpacked folder has everything inside one folder: look through it
    if (!entries.has('timeline.json')) {
      const inner = [...entries.keys()].filter((name) => /^[^/]+\/timeline\.json$/.test(name));
      if (inner.length === 1) {
        const prefix = inner[0].slice(0, -'timeline.json'.length);
        return new Map([...entries].filter(([name]) => name.startsWith(prefix)).map(([name, entry]) => [name.slice(prefix.length), entry]));
      }
    }
    return entries;
  }

  // One file out of a zip, as a Blob of the given type
  async function zipEntry(file, entry, type = '') {
    const head = new DataView(await file.slice(entry.offset, entry.offset + 30).arrayBuffer());
    if (head.getUint32(0, true) !== 0x04034b50) throw new Error('bad zip entry');
    const from = entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    const raw = file.slice(from, from + entry.csize, type);
    if (entry.method === 0) return raw;
    if (entry.method === 8 && typeof DecompressionStream === 'function') {
      const inflated = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      return inflated.slice(0, inflated.size, type);
    }
    return problem('This zip file uses a kind of compression that can\'t be read here.');
  }

  // --- Saving ---
  const saveFileName = () => (state.title || 'Timeline').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Timeline';

  // The file to download: { blob, name, missing } (missing: photos/videos the browser no longer has)
  async function buildSaveFile(forceZip = false) {
    const files = [];
    const missing = new Set();
    for (const id of new Set(state.events.flatMap((ev) => (ev.media || []).map((m) => m.id)))) {
      let blob = null;
      try { blob = await mediaGet(id); } catch (err) { /* treated as missing */ }
      if (blob) files.push({ id, blob }); else missing.add(id);
    }
    const timeline = {};
    for (const key of ['title', 'format', 'custom', 'categories', 'hidden', 'catsCollapsed', 'horizontal', 'reversed', 'gridLevel', 'showDates', 'noteScale']) timeline[key] = state[key];
    // (events only point at files the save file really holds)
    timeline.events = state.events.map((ev) => {
      if (!ev.media) return ev;
      const { media, ...rest } = ev;
      const kept = media.filter((m) => !missing.has(m.id));
      return kept.length ? { ...rest, media: kept } : rest;
    });
    const manifest = { app: FILE_APP, version: FILE_VERSION, saved: new Date().toISOString(), timeline };
    const base = saveFileName();
    if (!files.length && !forceZip) {
      return { blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), name: `${base}.json`, missing: missing.size };
    }
    manifest.files = {};
    const entries = files.map(({ id, blob }) => {
      const m = state.events.flatMap((ev) => ev.media || []).find((x) => x.id === id);
      const ext = MEDIA_EXT[blob.type] || ((/\.[a-z0-9]{1,5}$/i.exec(m ? m.name : '') || [''])[0]).toLowerCase();
      const path = `media/${id}${ext}`;
      manifest.files[id] = { path, type: blob.type };
      return { name: path, blob };
    });
    entries.unshift({ name: 'timeline.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
    return { blob: await makeZip(entries), name: `${base}.zip`, missing: missing.size };
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // --- Opening: reading and checking a file ---
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  async function readSaveFile(file) {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    let entries = null;
    let source;
    if (head[0] === 0x50 && head[1] === 0x4b) { // "PK": a zip
      try {
        entries = await readZip(file);
        const main = entries.get('timeline.json');
        if (!main) problem('This zip file isn\'t a saved timeline (it has no timeline.json inside).');
        source = await (await zipEntry(file, main)).text();
      } catch (err) {
        if (err instanceof FileProblem) throw err;
        problem('This zip file is damaged, or isn\'t a saved timeline.');
      }
    } else {
      if (file.size > 100e6) problem('This file is too big to be a saved timeline.');
      source = await file.text();
    }
    let manifest;
    try { manifest = JSON.parse(source); } catch (err) { problem('This file isn\'t a saved timeline.'); }
    if (!isObject(manifest) || manifest.app !== FILE_APP || !isObject(manifest.timeline)) problem('This file isn\'t a saved timeline.');
    if (!Number.isInteger(manifest.version) || manifest.version < 1) problem('This file isn\'t a saved timeline.');
    if (manifest.version > FILE_VERSION) problem('This timeline was saved by a newer version of Timeline Maker, so it can\'t be opened here.');
    return { file, entries, manifest, ...cleanTimeline(manifest, entries) };
  }

  // Whether a date (and time) is one this format can show
  function validWhen(date, time, format) {
    const m = /^(-?\d{1,11})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(date);
    if (!m) return false;
    const y = Number(m[1]);
    const month = m[2] === undefined ? null : Number(m[2]);
    const day = m[3] === undefined ? null : Number(m[3]);
    if (Math.abs(y) > YEAR_LIMIT) return false;
    if (month !== null && (month < 1 || month > 12)) return false;
    if (day !== null && (month === null || day < 1 || day > 31)) return false;
    if (day !== null && Math.abs(y) <= DATE_LIMIT && day > makeDate(y, month + 1, 0).getDate()) return false;
    const t = time ? /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time) : null;
    if (time && (!t || day === null || Number(t[1]) > 23 || Number(t[2]) > 59 || Number(t[3] || 0) > 59)) return false;
    if (format === 'calendar') return y === CALENDAR_YEAR && month !== null;
    if (format === 'year') return month === null && !time;
    return Math.abs(y) <= DATE_LIMIT || (month === null && !time);
  }

  // Checks a loaded manifest and builds the timeline it describes, with fresh
  // ids throughout. Problems that make it unusable throw a FileProblem; things
  // that can simply be left out (a link that isn't a web address, a photo the
  // file doesn't hold) are dropped and counted.
  function cleanTimeline(manifest, entries) {
    const raw = manifest.timeline;
    const format = raw.format;
    if (!['datetime', 'year', 'calendar', 'number', 'custom'].includes(format)) problem('This file\'s timeline type isn\'t one this version knows.');
    const timeline = { title: text(raw.title, 80), format, custom: null };
    if (format === 'custom') {
      timeline.custom = sanitizeCustom(raw.custom);
      if (!timeline.custom) problem('This file\'s custom units are missing or invalid.');
    } else {
      timeline.custom = sanitizeCustom(raw.custom); // (kept, if valid, for if you switch types later)
    }
    const numeric = format === 'number' || format === 'custom';
    if (!Array.isArray(raw.events)) problem('This file has no list of events.');
    if (raw.events.length > MAX_FILE_EVENTS) problem(`This file has more than ${MAX_FILE_EVENTS.toLocaleString()} events.`);

    const dropped = { files: 0, links: 0 };
    const eventIds = new Map();
    const categoryIds = new Map();

    // Tags
    timeline.categories = [];
    for (const c of Array.isArray(raw.categories) ? raw.categories : []) {
      const name = isObject(c) ? text(c.name, 40).trim() : '';
      if (!name || typeof c.id !== 'string' || categoryIds.has(c.id)) continue;
      const id = newId();
      categoryIds.set(c.id, id);
      timeline.categories.push({ id, name, color: normalizeHex(text(c.color, 9)) || PRESET_COLORS[timeline.categories.length % PRESET_COLORS.length][1] });
    }

    // Events: first the ids, so links between events can be pointed at the new ones
    raw.events.forEach((ev) => { if (isObject(ev) && typeof ev.id === 'string' && !eventIds.has(ev.id)) eventIds.set(ev.id, newId()); });
    const fileIds = new Map(); // new media id -> the id in the file
    const seenFiles = new Map(); // id in the file -> new media id
    const hasFile = (id) => !!(isObject(manifest.files) && isObject(manifest.files[id]) && typeof manifest.files[id].path === 'string' && entries && entries.has(manifest.files[id].path));

    timeline.events = raw.events.map((ev, i) => {
      const title = isObject(ev) ? text(ev.title, 120).trim() : '';
      const label = `Event ${i + 1}${title ? ` (“${title.slice(0, 40)}”)` : ''}`;
      if (!isObject(ev)) problem(`${label} isn't valid.`);
      if (!title) problem(`${label} has no title.`);
      const period = ev.kind === 'period';
      const out = { id: typeof ev.id === 'string' && eventIds.get(ev.id) ? eventIds.get(ev.id) : newId(), created: Number.isFinite(ev.created) ? ev.created : i, kind: period ? 'period' : 'moment', title, note: text(ev.note, NOTE_MAX) };
      if (numeric) {
        const num = (v) => { if (!Number.isFinite(v) || Math.abs(v) > NUM_LIMIT) problem(`${label} has a value that isn't valid.`); return v; };
        out.num = num(ev.num);
        if (period) out.endNum = num(ev.endNum);
      } else {
        const when = (date, time, what) => {
          if (typeof date !== 'string' || !validWhen(date, typeof time === 'string' ? time : '', format)) problem(`${label} has ${what} that isn't valid.`);
          return typeof time === 'string' ? time : '';
        };
        out.date = ev.date;
        out.time = when(ev.date, ev.time, 'a date');
        if (period) {
          out.endDate = ev.endDate;
          out.endTime = when(ev.endDate, ev.endTime, 'an end date');
        } else {
          out.placement = ev.placement === 'middle' && !out.time ? 'middle' : 'start';
        }
      }
      const color = typeof ev.color === 'string' ? normalizeHex(ev.color) : null;
      if (color) out.color = color;
      if (typeof ev.categoryId === 'string' && categoryIds.has(ev.categoryId)) out.categoryId = categoryIds.get(ev.categoryId);
      if (period) {
        for (const edge of ['start', 'end']) {
          const ref = ev[`${edge}Ref`];
          if (isObject(ref) && eventIds.has(ref.id) && (ref.edge === 'start' || ref.edge === 'end') && eventIds.get(ref.id) !== out.id) {
            out[`${edge}Ref`] = { id: eventIds.get(ref.id), edge: ref.edge };
          }
        }
      }
      const media = [];
      for (const m of Array.isArray(ev.media) ? ev.media.slice(0, MAX_MEDIA) : []) {
        if (!isObject(m) || typeof m.id !== 'string' || (m.kind !== 'image' && m.kind !== 'video')) continue;
        if (!hasFile(m.id)) { dropped.files++; continue; }
        if (!seenFiles.has(m.id)) {
          const id = newId();
          seenFiles.set(m.id, id);
          fileIds.set(id, m.id);
        }
        media.push({ id: seenFiles.get(m.id), kind: m.kind, name: text(m.name, 200) || 'file' });
      }
      if (media.length) out.media = media;
      const posterId = typeof ev.poster === 'string' ? seenFiles.get(ev.poster) : null;
      if (posterId && media.some((m) => m.id === posterId && m.kind === 'image')) out.poster = posterId;
      // (the marker lines in the notes that say where the photos go name the new ids)
      if (out.note.includes('[[media:')) {
        const keep = new Set(media.map((m) => m.id));
        out.note = out.note.split('\n').map((line) => {
          const m = NOTE_MEDIA_LINE.exec(line);
          if (!m) return line;
          const ids = m[1].split(',').map((id) => seenFiles.get(id)).filter((id) => id && keep.has(id));
          return ids.length ? mediaToken(ids) : null;
        }).filter((line) => line !== null).join('\n');
      }
      const links = [];
      for (const link of Array.isArray(ev.links) ? ev.links.slice(0, MAX_LINKS) : []) {
        const url = isObject(link) && typeof link.url === 'string' ? normalizeUrl(link.url) : null;
        if (!url) { dropped.links++; continue; }
        const label2 = text(link.text, 80).trim();
        links.push(label2 ? { url, text: label2 } : { url });
      }
      if (links.length) out.links = links;
      return out;
    });

    timeline.hidden = (Array.isArray(raw.hidden) ? raw.hidden : []).filter((id) => eventIds.has(id)).map((id) => eventIds.get(id));
    timeline.catsCollapsed = raw.catsCollapsed === true;
    timeline.horizontal = raw.horizontal === true;
    timeline.reversed = raw.reversed === true;
    timeline.gridLevel = Number.isInteger(raw.gridLevel) && raw.gridLevel >= 0 && raw.gridLevel < GRID_LEVELS.length ? raw.gridLevel : 0;
    timeline.showDates = raw.showDates !== false;
    timeline.noteScale = snapNoteScale(raw.noteScale); // (files from before this setting have none: normal size)
    return { timeline, fileIds, dropped };
  }

  // Replaces the current timeline with an opened one: its photos and videos
  // are stored first (so nothing changes if that fails), then the timeline
  // swaps in and the old one's files are cleaned away.
  async function applyOpened({ file, entries, manifest, timeline, fileIds }) {
    const stored = [];
    try {
      for (const [id, oldId] of fileIds) {
        const info = manifest.files[oldId];
        await mediaPut(id, await zipEntry(file, entries.get(info.path), text(info.type, 100)));
        stored.push(id);
      }
    } catch (err) {
      stored.forEach((id) => mediaDelete(id).catch(() => {}));
      problem('The photos and videos in this file couldn\'t be stored: the browser\'s storage may be full, or the file is damaged.');
    }
    stopStepping();
    Object.assign(state, timeline, { started: true, zoom: 1 });
    pinned = [];
    expandedId = null;
    openCategoryId = null;
    colorOpenId = null;
    closePicker();
    builderBuilt = false; // (the units builder is rebuilt from these units next time it shows)
    save();
    els.title.value = state.title;
    window.scrollTo(0, 0);
    render(null);
    collectMedia(true); // (the old timeline's photos and videos go)
  }

  // --- The questions and messages ---
  const fileDialog = $('#file-dialog');
  // Shows a dialog with the given buttons ([{ label, value, kind }]) and
  // resolves with the chosen value (null if it's dismissed)
  function askFile(heading, message, buttons) {
    $('#file-heading').textContent = heading;
    $('#file-text').textContent = message;
    const box = $('#file-actions');
    box.textContent = '';
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        fileDialog.removeEventListener('close', onClose);
        resolve(value);
      };
      // A dialog's 'close' event comes a moment after close(): if another dialog
      // has been opened by then, that late event is not about this one
      const onClose = () => { if (!fileDialog.open) finish(null); }; // (Esc, or a click outside)
      for (const b of buttons) {
        const btn = el('button', b.kind === 'primary' ? 'primary-btn' : b.kind === 'danger' ? 'danger-btn' : 'secondary-btn', b.label);
        btn.type = 'button';
        btn.addEventListener('click', () => { fileDialog.close(); finish(b.value); });
        box.append(btn);
      }
      fileDialog.addEventListener('close', onClose);
      fileDialog.showModal();
    });
  }
  fileDialog.addEventListener('click', (e) => { if (e.target === fileDialog) fileDialog.close(); });

  const tell = (heading, message) => askFile(heading, message, [{ label: 'OK', value: 'ok', kind: 'primary' }]);
  const whyNot = (err) => (err instanceof FileProblem ? err.message : 'Something went wrong with that file.');

  // --- Save and open, from the menu ---
  let fileBusy = false;
  // Asks where to save, where the browser can (Chrome and Edge): resolves with
  // the file to write to, null to download instead, and throws AbortError if
  // the person cancels. (It has to be called straight from a click, so it
  // comes before the slow work of packing the file.)
  async function askWhereToSave(base, withMedia) {
    if (typeof window.showSaveFilePicker !== 'function') return null;
    try {
      return await window.showSaveFilePicker({
        suggestedName: `${base}.${withMedia ? 'zip' : 'json'}`,
        types: [withMedia
          ? { description: 'Timeline with photos and videos (.zip)', accept: { 'application/zip': ['.zip'] } }
          : { description: 'Timeline (.json)', accept: { 'application/json': ['.json'] } }],
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      return null; // the picker can't be used here: download instead
    }
  }

  async function writeToFile(handle, blob) {
    let writer;
    try {
      writer = await handle.createWritable();
      await writer.write(blob);
      await writer.close();
    } catch (err) {
      try { if (writer) await writer.abort(); } catch (e) { /* already closed */ }
      problem('The file couldn\'t be written. Check that there\'s room and that you\'re allowed to save there.');
    }
  }

  async function saveToFile() {
    if (fileBusy) return false;
    fileBusy = true;
    try {
      const withMedia = state.events.some((ev) => (ev.media || []).length > 0);
      let handle;
      try {
        handle = await askWhereToSave(saveFileName(), withMedia);
      } catch (err) {
        return false; // cancelled: nothing is saved (and nothing else goes ahead)
      }
      $('#file-save').textContent = 'Saving…';
      const { blob, name, missing } = await buildSaveFile(withMedia);
      if (handle) await writeToFile(handle, blob); else downloadBlob(blob, name);
      if (missing) {
        await tell('Saved, with a gap', `${missing} photo${missing === 1 ? '' : 's'} or video${missing === 1 ? '' : 's'} couldn't be found in this browser's storage, so ${missing === 1 ? 'it isn\'t' : 'they aren\'t'} in the file.`);
      }
      return true;
    } catch (err) {
      await tell('Couldn\'t save the file', whyNot(err));
      return false;
    } finally {
      fileBusy = false;
      $('#file-save').textContent = 'Save to file…';
    }
  }

  async function openSavedFile(file) {
    let opened;
    try {
      opened = await readSaveFile(file);
    } catch (err) {
      await tell('Couldn\'t open that file', whyNot(err));
      return;
    }
    if (state.events.length) {
      const current = state.title ? `“${state.title}”` : 'your timeline';
      const choice = await askFile(
        `Open “${opened.timeline.title || 'Untitled timeline'}”?`,
        `This closes ${current}, which has ${state.events.length} event${state.events.length === 1 ? '' : 's'}. If you want to keep it, save it to a file first.`,
        [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Close without saving', value: 'replace', kind: 'danger' },
          { label: 'Save it, then open', value: 'save', kind: 'primary' },
        ],
      );
      if (choice !== 'replace' && choice !== 'save') return;
      if (choice === 'save' && !(await saveToFile())) return;
    }
    try {
      await applyOpened(opened);
    } catch (err) {
      await tell('Couldn\'t open that file', whyNot(err));
      return;
    }
    const { files, links } = opened.dropped;
    if (files || links) {
      const bits = [files && `${files} photo${files === 1 ? '' : 's'} or video${files === 1 ? '' : 's'} the file didn't contain`, links && `${links} link${links === 1 ? '' : 's'} that weren't web addresses`].filter(Boolean);
      await tell('Opened, with a few things left out', `Left out: ${bits.join(' and ')}.`);
    }
  }

  const fileInput = $('#file-input');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (file) openSavedFile(file);
  });
  $('#home-open').addEventListener('click', () => fileInput.click());

  // The menu under the toolbar's file button
  const filePop = $('#file-pop');
  const fileBtn = $('#file-btn');
  const setFileMenu = (open) => {
    filePop.hidden = !open;
    els.header.classList.toggle('menu-open', open);
    fileBtn.setAttribute('aria-expanded', String(open));
  };
  fileBtn.addEventListener('click', () => {
    setFileMenu(filePop.hidden);
    if (!filePop.hidden) $('#file-save').focus();
  });
  document.addEventListener('click', (e) => { if (!filePop.hidden && !e.target.closest('.file-menu')) setFileMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !filePop.hidden) { setFileMenu(false); fileBtn.focus(); }
  });
  $('#file-save').addEventListener('click', () => { setFileMenu(false); saveToFile(); });
  $('#file-open').addEventListener('click', () => { setFileMenu(false); fileInput.click(); });

  // The viewport changes size when the categories box above it grows or
  // shrinks (or the window does): keep the view valid and redraw it
  let trackSize = 0;
  new ResizeObserver(() => {
    const size = trackLen();
    if (!scale || size === trackSize) return;
    trackSize = size;
    setView(scale.vx);
  }).observe(els.track);

  // The tags box grows and shrinks (more tags, a tag opened or closed): Previous
  // may need to move out of its way, or back
  new ResizeObserver(() => { if (scale) updateJumps(); }).observe(catPanel);

  // On resize: card sizes depend on width, and the view's length may change
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      document.documentElement.style.setProperty('--header-h', `${els.header.offsetHeight}px`);
      if (!scale) return;
      layout();
      setView(scale.vx);
    }, 120);
  });

  render();
  collectMedia(); // (files left over from an earlier session's cancelled edits)
})();
