/* =============================================================
 * CatJumper — игровая логика (чистый ES2020+, без зависимостей).
 *
 * Аркадный платформер «бесконечная лестница вверх»: кот прыгает по процедурно
 * генерируемым платформам, камера едет только вверх, чем выше — тем сложнее.
 * Смерть от падения или от шипов.
 *
 * Подключается обычным скриптом: <script src="game.js" defer></script>
 * Никаких импортов/экспортов, никаких сборщиков.
 *
 * Жёсткий контракт с HTML:
 *   #game (canvas 480x720), #score, #best, #coins,
 *   #menu, #over (скрытие только классом .hidden),
 *   #btnStart, #btnRestart, #btnLeft, #btnRight, #btnJump,
 *   опционально #overBest / #overScore / #overCoins.
 * ============================================================= */

'use strict';

(function () {
  /* ===========================================================
   * CONFIG — все магические числа живут здесь
   * =========================================================== */
  const CONFIG = {
    // Логическое поле (не зависит от CSS-размера) и HiDPI
    VIEW_W: 480, VIEW_H: 720, MAX_DPR: 2,

    // Физика кота
    GRAVITY: 2100,           // px/с^2
    MAX_FALL: 900,           // предел скорости падения, px/с
    MOVE_SPEED: 300,         // макс. горизонтальная скорость, px/с
    ACCEL: 2400, AIR_ACCEL: 1600,   // разгон по земле / в воздухе
    FRICTION: 2800, AIR_DRAG: 420,  // трение по земле / сопротивление воздуха
    JUMP_VELOCITY: -760,     // скорость прыжка (вверх — минус)
    JUMP_CUT: 0.45,          // усечение прыжка при раннем отпускании
    DOUBLE_JUMP_VELOCITY: -650,
    COYOTE_TIME: 0.10,       // «койот-тайм», с
    JUMP_BUFFER_TIME: 0.12,  // буфер ввода прыжка, с
    JUMP_COUNT_MAX: 2,       // основной + один двойной
    MAX_DT: 1 / 30,          // клампинг dt (защита после сворачивания вкладки)

    // Габариты и «живость» кота
    CAT_W: 28, CAT_H: 30,
    SQUASH_DECAY: 4.5,      // предел возврата squash&stretch к норме, ед/с
    SQUASH_ATTACK: 4.5,      // предел разгона к пиковому squash, ед/с (0.075 за кадр при 60 fps)
    SQUASH_EASE: 0.5,        // доля разницы до цели, съедаемая за кадр
    SQUASH_EPS: 0.005,       // на каком расстоянии до цели squash считается достигнутым
    LAND_SQUASH: 0.30,       // максимальное сжатие при приземлении
    JUMP_STRETCH: 0.22,      // растяжение при прыжке
    TRAIL_MAX: 12, TRAIL_INTERVAL: 0.028, TRAIL_MIN_SPEED: 90,
    TRAIL_FADE: 5.2,           // скорость затухания следа, 1/с
    TRAIL_R_MAX: 5,            // радиус пятна следа в момент появления, px
    TRAIL_DRIFT: 0.25,         // насколько след «инерцирует» вниз, доля
    TRAIL_FALL: 0.15,          // собственное падение пятна (в долях гравитации),
    BLINK_INTERVAL: 3.4, BLINK_TIME: 0.12,

    // Мир и генерация
    PLATFORM_H: 14,
    // Старт — крыша одной из высоток: платформа ограниченной ширины, под ней
    // пустота. Постоянной земли во всю ширину кадра в мире больше нет.
    START_PLATFORM_W: 150,
    START_TOWER_INDEX: 5,     // дом ближнего ряда, на крыше которого стоит кот
    PLATFORM_W_MIN: 66, PLATFORM_W_MAX: 132,
    PLATFORM_GAP_MIN: 78,    // вертикальный зазор между соседними платформами
    PLATFORM_GAP_MAX: 116,   // <= MAX_JUMP_HEIGHT (~137) — всегда достижимо
    PLATFORM_GAP_SAFE: 82,   // «страховочный» зазор
    REACH_X: 140,            // гарантированная горизонтальная досягаемость с запасом
    MIN_REACH: 70,           // нижняя граница бюджета достижимости (ход платформы)
    SIDE_MARGIN: 14,         // отступ платформ от краёв экрана
    SPAWN_AHEAD: 900,        // докуда генерировать платформы над камерой
    CULL_BELOW: 420,         // что ниже — выбиваем
    SEED_PLATFORMS: 14,      // сколько платформ построить сразу
    COLLIDE_TOLERANCE: 3,    // допуск «залипания» сверху, px
    DUST_MIN_SPEED: 120,    // ниже этой скорости падения пыли нет (иначе сыпется стоя)
    GROUND_PROBE: 3,         // доп. проверка «стою на земле», px

    // Типы платформ
    CRUMBLE_DELAY: 0.35,     // разрушается через 0.35 c после касания
    CRUMBLE_RESPAWN: 3.0,    // респавн через 3 c
    CRUMBLE_SHAKE: 2.5,      // амплитуда дрожи перед разрушением, px
    MOVING_AMP_MIN: 30, MOVING_AMP_MAX: 56,
    MOVING_SPEED_MIN: 0.9, MOVING_SPEED_MAX: 1.7,
    BOUNCY_VELOCITY: -1120,  // импульс отскока

    // Шипы
    HAZARD_MIN_SCORE: 500,    // ниже этого счёта шипов на карте нет вообще
    HAZARD_W_MIN: 22, HAZARD_W_MAX: 38, HAZARD_H: 12,
    HAZARD_INSET: 5,         // inset по AABB, чтобы не было ложных срабатываний
    HAZARD_PLATFORM_MARGIN: 10,

    // Монеты
    COIN_R: 8, COIN_VALUE: 5, COIN_CHANCE: 0.42, COIN_COUNT_MAX: 3,
    COIN_SPACING: 24, COIN_HEIGHT: 48, COIN_INSET: 4,

    // Сложность (шансы растут с высотой)
    DIFF_RAMP_M: 200,        // метров до максимальной сложности
    CRUMBLE_CHANCE_MIN: 0.06, CRUMBLE_CHANCE_MAX: 0.30,
    MOVING_CHANCE_MIN: 0.08, MOVING_CHANCE_MAX: 0.26,
    HAZARD_CHANCE_MIN: 0.05, HAZARD_CHANCE_MAX: 0.30,
    BOUNCY_CHANCE: 0.07,

    // Камера
    CAM_ANCHOR: 0.55,        // где по вертикали сидит кот в кадре
    CAM_DEADZONE: 70,        // мёртвая зона, px
    CAM_LERP: 9,             // скорость «догоняющего» lerp, 1/с
    SHAKE_DECAY: 6,

    // Смерть, счёт и рекорд
    DEATH_MARGIN: 140,       // падение ниже камеры на столько px = смерть
    DEATH_SHOW_DELAY: 0.85,  // анимация падения до показа #over
    METERS_PER_SCORE: 10,    // 10 px высоты = 1 «метр» счёта
    BEST_KEY: 'catjumper.best',

    // Частицы
    PARTICLE_CAP: 240, DUST_COUNT: 8, SPARK_COUNT: 8, SHARD_COUNT: 10,

    // Фон
    CLOUD_COUNT: 4, CLOUD_SPAN: 320,
    STAR_COUNT: 40, BG_MENU_DRIFT: 10, // «дыхание» фона в меню, px

    // Космос: после SPACE_SCORE сумеречное небо непрерывно превращается в
    // глубокое пространство и заканчивает переход через SPACE_FADE_SCORE очков.
    SPACE_SCORE: 2000,
    SPACE_FADE_SCORE: 700,
    CLOUD_SPACE_FALL: 900,   // на сколько px облака уходят вниз за весь переход
    SPACE_STAR_BOOST: 1.4,   // во сколько раз ярче становятся базовые звёзды
    SPACE_STAR_ALPHA: 0.85,  // макс. прозрачность «дополнительных» звёзд космоса
    MOON_FADE: 0.85,        // насколько луна гаснет к концу перехода в космос
    CLOUD_SPACE_FADE: 0.95, // насколько облака гаснут к концу перехода

    // Дома стоят на линии горизонта у самого низа кадра: основание уходит под
    // нижний край, крыша растёт вверх. Поэтому город читается как силуэт,
    // а не как отдельные прямоугольники, висящие в небе.
    // baseY — экранная Y основания на старте, parallax — скорость ухода вниз.
    TOWER_FAR: { parallax: 0.05, baseY: 684, minH: 80, hVar: 190, wMin: 30, wVar: 44 },
    TOWER_NEAR: { parallax: 0.11, baseY: 726, minH: 120, hVar: 250, wMin: 38, wVar: 56 },
    TOWER_COUNT: 10,           // домов в ряду — на всю ширину кадра
    TOWER_FAR_SEED: 0, TOWER_NEAR_SEED: 17,
    // За сколько экранных px параллакса ряд гаснет до нуля: уход города
    // растворяется, а не обрывается кадром (см. drawTowers).
    TOWER_FADE: 300,
  };

  // Высота прыжка (~137px) — верхняя граница зазора между платформами
  const MAX_JUMP_HEIGHT = (CONFIG.JUMP_VELOCITY * CONFIG.JUMP_VELOCITY) / (2 * CONFIG.GRAVITY);

  // Насколько глубоко уже ушёл космос: 0 — сумеречное небо, 1 — чистый космос.
  function spaceBlend() {
    return clamp((totalScore() - CONFIG.SPACE_SCORE) / CONFIG.SPACE_FADE_SCORE, 0, 1);
  }

  const COLOR = {
    skyTop: '#101538', skyMid: '#33265c', skyLow: '#8d4a6b', skyBottom: '#ffb26b',
    // Глубокий космос: почти чёрный с холодным синим подтоном, в духе skyTop.
    space: '#04061a',
    star: 'rgba(255,255,255,0.9)', starSpace: 'rgba(214,232,255,0.95)',
    moon: '#ffeab4', moonGlow: 'rgba(255,226,160,0.18)',
    cloud: 'rgba(255,255,255,0.08)', cloudNear: 'rgba(255,255,255,0.15)',
    towerFar: 'rgba(34,26,64,0.5)', towerNear: 'rgba(16,12,34,0.85)',
    solidTop: '#8bf5c6', solidBody: '#1f8f68', solidEdge: '#0f6b4e',
    movingTop: '#8ecbff', movingBody: '#2a6fbd',
    crumbleTop: '#d7c39a', crumbleBody: '#8a7646',
    bouncyTop: '#ffb1d9', bouncyBody: '#d4478f',
    hazard: '#ff6b6b', hazardDark: '#a52b2b',
    coin: '#ffd44d', coinDark: '#c98f10',
    fur: '#ffb457', furDark: '#e0873a', furLight: '#ffd9a8',
    outline: '#2a1a10', eye: '#22303f',
    trail: 'rgba(255,255,255,0.22)', vignette: 'rgba(8,6,20,0.55)',
  };

  /* ===========================================================
   * DOM — получаем один раз, всё через безопасные хелперы
   * =========================================================== */
  const dom = {};
  let ctx = null;
  let canvas = null;

  function grabDom() {
    dom.canvas = document.getElementById('game');
    ['score', 'best', 'coins', 'menu', 'over', 'btnStart', 'btnRestart',
      'btnLeft', 'btnRight', 'btnJump', 'overBest', 'overScore', 'overCoins',
      // Управляющие кнопки верхних панелей. Могут отсутствовать в разметке —
      // все обращения идут через listen(), который молча выходит.
      'btnMenu', 'btnGuide', 'btnGuideClose', 'guidePanel']
      .forEach((id) => { dom[id] = document.getElementById(id); });
  }

  /** HUD и текстовые узлы — только textContent, с защитой от отсутствия узла. */
  function setText(el, value) {
    if (!el) return;
    try { el.textContent = String(value); } catch (err) { /* узел мог исчезнуть */ }
  }

  /** Скрытие оверлеев ТОЛЬКО классом .hidden (display задаёт CSS). */
  function setOverlay(el, visible) {
    if (el && el.classList) el.classList.toggle('hidden', !visible);
  }

  function setActive(el, active) {
    if (el && el.classList) el.classList.toggle('is-active', !!active);
  }

  /* ===========================================================
   * STATE — мир и игрок
   * =========================================================== */
  let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'over'
  let rafId = 0;
  let lastTime = null;
  let bgTime = 0;

  const platforms = [];
  const coins = [];
  const hazards = [];
  const particles = [];
  const trail = [];
  let entityId = 1;

  const player = {
    x: 0, y: 0, w: CONFIG.CAT_W, h: CONFIG.CAT_H,
    vx: 0, vy: 0,
    grounded: false, riding: null, jumpsUsed: 0, coyote: 0,
    jumpCutArmed: false, facing: 1,
    squashX: 1, squashY: 1,
    squashTX: 1, squashTY: 1,   // цель squash: к ней разгоняемся, а не прыгаем сразу
    blink: CONFIG.BLINK_INTERVAL,
  };

  let cameraY = 0;           // мировая Y камеры (уменьшается вверх, только вверх)
  let shakeX = 0, shakeY = 0, shakeAmp = 0;
  let maxHeight = 0;         // максимальная достигнутая высота, px
  let score = 0;
  let best = 0;
  let coinScore = 0;         // очки за монеты (входят в итоговый счёт)
  let coinsCollected = 0;
  let topPlatformY = 0;      // Y самой верхней сгенерированной платформы
  let lastPlatform = null;   // предыдущая платформа для расчёта достижимости
  let trailTimer = 0;

  let dieTimer = 0;          // таймер анимации падения перед показом #over
  let overShown = false;     // показан ли уже экран Game Over
  let deathReason = '';
  let newBest = false;

  let dpr = 1;
  let skyGradient = null;
  let topShade = null;
  let vignetteGradient = null;

  /* ===========================================================
   * INPUT — клавиатура + мобильные кнопки (pointer capture)
   * =========================================================== */
  const input = {
    keys: { left: false, right: false, jump: false },
    touch: { left: false, right: false, jump: false },
    jumpBuffer: 0,
    listeners: [], // для destroy()
  };

  const JUMP_CODES = new Set(['Space', 'ArrowUp', 'KeyW']);
  const LEFT_CODES = new Set(['ArrowLeft', 'KeyA']);
  const RIGHT_CODES = new Set(['ArrowRight', 'KeyD']);
  // Клавиши, у которых браузерный дефолт мешает игре (скролл страницы).
  // Escape сюда не входит: он гасится только когда открыт гайд.
  const SWALLOW_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

  function axisX() {
    return (input.keys.left || input.touch.left ? -1 : 0) + (input.keys.right || input.touch.right ? 1 : 0);
  }

  function jumpHeld() {
    return input.keys.jump || input.touch.jump;
  }

  function pressJump() {
    input.jumpBuffer = CONFIG.JUMP_BUFFER_TIME; // буфер: раннее нажатие не теряется
  }

  function onKeyDown(e) {
    if (!e) return;
    const code = e.code || '';
    if (SWALLOW_CODES.has(code) && typeof e.preventDefault === 'function') e.preventDefault();

    // Escape закрывает гайд, если он открыт. Отдельного бинда на паузу нет.
    if (code === 'Escape') {
      if (!e.repeat && isGuideOpen()) closeGuide();
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (e.repeat) return;
      if (state === 'menu') start();
      else if (state === 'over' && overShown) restart();
      return;
    }

    if (LEFT_CODES.has(code)) input.keys.left = true;
    else if (RIGHT_CODES.has(code)) input.keys.right = true;
    else if (JUMP_CODES.has(code)) {
      if (!e.repeat) pressJump();
      input.keys.jump = true;
    }
  }

  function onKeyUp(e) {
    if (!e) return;
    const code = e.code || '';
    if (LEFT_CODES.has(code)) input.keys.left = false;
    else if (RIGHT_CODES.has(code)) input.keys.right = false;
    else if (JUMP_CODES.has(code)) input.keys.jump = false;
  }

  /** Вешает обработчик и запоминает его для destroy(). */
  function listen(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler, options);
    input.listeners.push({ target, type, handler, options });
  }

  // Уход с вкладки/окна — страховка, а не бинд: игра ставится на паузу сама.
  function onWindowBlur() {
    if (state === 'playing') togglePause();
  }

  function onVisibilityChange() {
    if (document.hidden && state === 'playing') togglePause();
  }

  function bindHoldButton(el, action) {
    if (!el) return;
    el.style.touchAction = 'none'; // страховка, если CSS-агент ещё не применил

    const press = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      try {
        if (e && typeof el.setPointerCapture === 'function' && e.pointerId != null) {
          el.setPointerCapture(e.pointerId);
        }
      } catch (err) { /* setPointerCapture может бросить — не критично */ }
      input.touch[action] = true;
      if (action === 'jump') pressJump();
      setActive(el, true);
    };
    const release = (e) => {
      if (e && e.type !== 'lostpointercapture' && typeof e.preventDefault === 'function') e.preventDefault();
      input.touch[action] = false;
      setActive(el, false);
    };
    const onContext = (e) => { if (e && typeof e.preventDefault === 'function') e.preventDefault(); };

    listen(el, 'pointerdown', press);
    listen(el, 'pointerup', release);
    listen(el, 'pointercancel', release);
    listen(el, 'lostpointercapture', release);
    listen(el, 'contextmenu', onContext);
  }

  function setupInput() {
    listen(window, 'keydown', onKeyDown, { passive: false });
    listen(window, 'keyup', onKeyUp);
    listen(window, 'blur', onWindowBlur);
    listen(document, 'visibilitychange', onVisibilityChange);
    listen(window, 'resize', resizeCanvas);
    bindHoldButton(dom.btnLeft, 'left');
    bindHoldButton(dom.btnRight, 'right');
    bindHoldButton(dom.btnJump, 'jump');
    listen(dom.btnStart, 'click', () => start());
    listen(dom.btnRestart, 'click', () => restart());
    listen(dom.btnMenu, 'click', () => exitToMenu());
    listen(dom.btnGuide, 'click', () => openGuide());
    listen(dom.btnGuideClose, 'click', () => closeGuide());
  }

  /* ===========================================================
   * ГАЙД — панель поверх меню, открывается и закрывается кнопками
   * =========================================================== */
  function openGuide() {
    setOverlay(dom.guidePanel, true);
  }

  function closeGuide() {
    setOverlay(dom.guidePanel, false);
  }

  function isGuideOpen() {
    return !!(dom.guidePanel && dom.guidePanel.classList
      && !dom.guidePanel.classList.contains('hidden'));
  }

  function resetInput() {
    input.keys.left = input.keys.right = input.keys.jump = false;
    input.touch.left = input.touch.right = input.touch.jump = false;
    input.jumpBuffer = 0;
    setActive(dom.btnLeft, false);
    setActive(dom.btnRight, false);
    setActive(dom.btnJump, false);
  }

  /* ===========================================================
   * SPAWN — процедурная генерация с гарантией достижимости
   * =========================================================== */

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /** Детерминированный шум для фона: объекты не «дрожат» между кадрами. */
  function hash01(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /** Насколько сложно сейчас: 0 внизу, 1 на DIFF_RAMP_M метрах. */
  function difficulty() {
    return clamp(maxHeight / CONFIG.METERS_PER_SCORE / CONFIG.DIFF_RAMP_M, 0, 1);
  }

  function makePlatform(x, y, w, type) {
    const d = difficulty();
    // Амплитуда ограничена так, чтобы вся орбита помещалась на экране:
    // иначе синус упирался бы в край и платформа «залипала» на границе.
    const maxAmp = Math.max(0, (CONFIG.VIEW_W - CONFIG.SIDE_MARGIN * 2 - w) / 2);
    return {
      id: entityId++,
      x, y, w, h: CONFIG.PLATFORM_H, type,
      originX: x,                            // центр колебания для moving
      amp: type === 'moving' ? Math.min(lerp(CONFIG.MOVING_AMP_MIN, CONFIG.MOVING_AMP_MAX, d), maxAmp) : 0,
      speed: type === 'moving' ? rand(CONFIG.MOVING_SPEED_MIN, CONFIG.MOVING_SPEED_MAX) : 0,
      phase: Math.random() * Math.PI * 2,
      t: 0, dx: 0,
      state: 'idle',                         // 'idle' | 'crumbling' | 'gone'
      timer: 0, active: true,
    };
  }

  /**
   * Крыша стартовой высотки. Геометрия ближнего ряда детерминирована (hash01),
   * поэтому и положение платформы, и линия крыши считаются от одного и того же
   * индекса дома — кот гарантированно стоит на крыше, а не висит в воздухе.
   */
  function startRoofScreenY() {
    return CONFIG.TOWER_NEAR.baseY - (CONFIG.TOWER_NEAR.minH + CONFIG.TOWER_NEAR.hVar);
  }

  /** Стартовая платформа центрируется на крыше выбранного дома. */
  function startPlatformX(platW) {
    const band = CONFIG.VIEW_W / CONFIG.TOWER_COUNT;
    const slot = CONFIG.START_TOWER_INDEX % CONFIG.TOWER_COUNT;
    // Тот же jitter, что и в drawTowers, — иначе платформа уедет с крыши.
    const jitter = (hash01(slot * 5.3 + CONFIG.TOWER_NEAR_SEED) - 0.5) * band;
    const towerCx = slot * band + jitter + band / 2;
    return clamp(towerCx - platW / 2, CONFIG.SIDE_MARGIN,
      CONFIG.VIEW_W - CONFIG.SIDE_MARGIN - platW);
  }

  /**
   * Ставит платформу так, чтобы она гарантированно была достижима с предыдущей.
   * Учитывает ход предыдущей (moving) и орбиту новой платформы. Если вписаться
   * в экран нельзя — отдаём «страховочную» solid-платформу ровно над предыдущей.
   */
  function placeReachable(prev, plat) {
    const w = plat.w;
    const minX = CONFIG.SIDE_MARGIN;
    const maxX = CONFIG.VIEW_W - CONFIG.SIDE_MARGIN - w;
    const amp = plat.type === 'moving' ? plat.amp : 0;

    if (!prev) {
      plat.x = plat.originX = clamp((CONFIG.VIEW_W - w) / 2, minX, maxX);
      return;
    }

    const prevCenter = prev.x + prev.w / 2;
    const prevSweep = prev.type === 'moving' ? prev.amp : 0;
    const budget = Math.max(CONFIG.MIN_REACH, CONFIG.REACH_X - prevSweep);

    // Ближайшая к предыдущей точка орбиты новой платформы
    const nearOffset = (baseX) => (baseX + w / 2 >= prevCenter ? -amp : amp);
    const nearDx = (baseX) => baseX + nearOffset(baseX) + w / 2 - prevCenter;

    let baseX = clamp(prevCenter + rand(-budget, budget) - w / 2, minX + amp, maxX - amp);
    if (Math.abs(nearDx(baseX)) > budget) {
      const shifted = clamp(baseX + (budget - nearDx(baseX)), minX + amp, maxX - amp);
      if (Math.abs(nearDx(shifted)) <= budget) {
        baseX = shifted;
      } else {
        plat.type = 'solid'; // страховка: обычная платформа прямо над предыдущей
        plat.amp = 0;
        baseX = clamp(prevCenter - w / 2, minX, maxX);
      }
    }
    plat.x = plat.originX = baseX;
  }

  function pickType() {
    const d = difficulty();
    const roll = Math.random();
    let acc = lerp(CONFIG.CRUMBLE_CHANCE_MIN, CONFIG.CRUMBLE_CHANCE_MAX, d);
    if (roll < acc) return 'crumble';
    acc += lerp(CONFIG.MOVING_CHANCE_MIN, CONFIG.MOVING_CHANCE_MAX, d);
    if (roll < acc) return 'moving';
    acc += CONFIG.BOUNCY_CHANCE;
    return roll < acc ? 'bouncy' : 'solid';
  }

  function spawnNext() {
    const prev = lastPlatform;
    const d = difficulty();
    const gap = rand(CONFIG.PLATFORM_GAP_MIN, lerp(CONFIG.PLATFORM_GAP_MIN, CONFIG.PLATFORM_GAP_MAX, d));
    const w = rand(CONFIG.PLATFORM_W_MIN, CONFIG.PLATFORM_W_MAX);
    const plat = makePlatform((CONFIG.VIEW_W - w) / 2, prev ? prev.y - gap : -CONFIG.PLATFORM_GAP_SAFE, w, pickType());

    placeReachable(prev, plat);
    // Вертикаль: зазор обязан остаться в пределах высоты прыжка (с запасом)
    if (prev) {
      const g = prev.y - plat.y;
      if (g < CONFIG.PLATFORM_GAP_SAFE || g > MAX_JUMP_HEIGHT - 12) {
        plat.y = prev.y - clamp(g, CONFIG.PLATFORM_GAP_SAFE, MAX_JUMP_HEIGHT - 12);
      }
    }
    platforms.push(plat);
    lastPlatform = plat;
    topPlatformY = plat.y;

    // Шипы — только на solid/moving, не на первой платформе, с местом по краям.
    // Первые HAZARD_MIN_SCORE очков карта идёт вообще без шипов: на старте кот
    // ещё осваивается, и смерть «с первого прыжка» неуместна.
    if (totalScore() >= CONFIG.HAZARD_MIN_SCORE
      && (plat.type === 'solid' || plat.type === 'moving')) {
      const room = plat.w - CONFIG.HAZARD_PLATFORM_MARGIN * 2;
      const chance = lerp(CONFIG.HAZARD_CHANCE_MIN, CONFIG.HAZARD_CHANCE_MAX, d);
      if (platforms.length > 3 && room >= CONFIG.HAZARD_W_MIN && Math.random() < chance) {
        const hw = Math.min(rand(CONFIG.HAZARD_W_MIN, CONFIG.HAZARD_W_MAX), room);
        hazards.push({
          plat,
          offsetX: Math.random() < 0.5
            ? CONFIG.HAZARD_PLATFORM_MARGIN
            : plat.w - CONFIG.HAZARD_PLATFORM_MARGIN - hw,
          w: hw, h: CONFIG.HAZARD_H,
        });
      }
    }
    if (Math.random() < CONFIG.COIN_CHANCE) spawnCoins(plat);
    return plat;
  }

  function spawnCoins(plat) {
    const count = 1 + Math.floor(Math.random() * CONFIG.COIN_COUNT_MAX);
    const spacing = CONFIG.COIN_SPACING;
    const startX = clamp(
      plat.x + plat.w / 2 - ((count - 1) * spacing) / 2,
      CONFIG.COIN_R + CONFIG.SIDE_MARGIN * 0.5,
      CONFIG.VIEW_W - CONFIG.COIN_R - CONFIG.SIDE_MARGIN * 0.5
    );
    const baseY = plat.y - CONFIG.COIN_HEIGHT;
    for (let i = 0; i < count; i++) {
      coins.push({
        x: startX + i * spacing,
        // лёгкая дуга, чтобы цепочка читалась как «след» монет
        y: baseY - Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 10,
        phase: Math.random() * Math.PI * 2,
        taken: false,
      });
    }
  }

  /** Достраиваем мир, пока сверху не хватает контента. */
  function spawnUpTo(limitY) {
    let guard = 0;
    while (topPlatformY > limitY && guard++ < 200) spawnNext();
  }

  /**
   * Убирает всё, что осталось далеко ПОД камерой (уже пройдено).
   * Важно: объекты выше камеры выбивать нельзя — камера едет только вверх,
   * и именно они нужны игроку дальше. Выше камеры мир ограничен SPAWN_AHEAD.
   */
  function cullBehind() {
    const below = cameraY + CONFIG.VIEW_H + CONFIG.CULL_BELOW;
    for (let i = platforms.length - 1; i >= 0; i--) {
      const p = platforms[i];
      if (p.y < below || p === player.riding) continue;
      platforms.splice(i, 1);
    }
    for (let i = hazards.length - 1; i >= 0; i--) {
      if (hazards[i].plat.y < below) continue;
      hazards.splice(i, 1);
    }
    for (let i = coins.length - 1; i >= 0; i--) {
      if (coins[i].y < below) continue;
      coins.splice(i, 1);
    }
  }

  /* ===========================================================
   * PHYSICS — движение кота
   * =========================================================== */

  function buildWorld() {
    platforms.length = 0;
    coins.length = 0;
    hazards.length = 0;
    particles.length = 0;
    trail.length = 0;
    entityId = 1;

    // Стартовая платформа — крыша высотки: узкая, смещена так, чтобы её линия
    // совпала с крышей одного из ближних домов. Постоянной земли во всю ширину
    // кадра больше нет: под ней пустота, сошёл с края — падаешь до смерти.
    const roof = makePlatform(0, 0, CONFIG.START_PLATFORM_W, 'solid');
    roof.x = roof.originX = startPlatformX(roof.w);
    platforms.push(roof);
    lastPlatform = roof;
    topPlatformY = roof.y;
    spawnUpTo(-CONFIG.SEED_PLATFORMS * CONFIG.PLATFORM_GAP_MAX - CONFIG.VIEW_H);

    player.x = roof.x + (roof.w - player.w) / 2;
    player.y = roof.y - player.h - 2;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    player.riding = roof;
    player.jumpsUsed = 0;
    player.coyote = CONFIG.COYOTE_TIME;
    player.jumpCutArmed = false;
    player.facing = 1;
    player.squashX = 1;
    player.squashY = 1;
    player.squashTX = 1;
    player.squashTY = 1;
    player.blink = CONFIG.BLINK_INTERVAL;

    // Камера встаёт так, чтобы стартовая платформа попала ровно на экранную
    // линию крыши выбранного дома (см. startRoofScreenY).
    cameraY = -startRoofScreenY();
    shakeAmp = 0; shakeX = 0; shakeY = 0;
    maxHeight = 0; score = 0; coinScore = 0; coinsCollected = 0;
    dieTimer = 0; overShown = false; deathReason = ''; newBest = false;
    trailTimer = 0;
  }

  function doJump(velocity) {
    const p = player;
    p.vy = velocity;
    p.grounded = false;
    p.riding = null;
    p.jumpCutArmed = true;
    p.squashTY = 1 + CONFIG.JUMP_STRETCH;
    p.squashTX = 1 - CONFIG.JUMP_STRETCH * 0.8;
    spawnDust(p.x + p.w / 2, p.y + p.h, 4);
  }

  /**
   * Один шаг squash к цели. Скорость ограничена единицами в секунду, а не долями
   * от разницы: прыжок растягивает кота до 1.22, а приземление сжимает до ~0.76 —
   * разрыв между ними ~0.46, и долевой lerp съедал его за один кадр (кот «щёлкал»).
   * Дойдя до цели, фиксируем её ровно: долевая сходимость сама по себе асимптотична
   * и без этого оставляла кота на неразличимом остатке от нормы навсегда.
   */
  function squashStep(cur, target, dt) {
    const diff = target - cur;
    if (Math.abs(diff) < CONFIG.SQUASH_EPS) return target;
    const limit = (target === 1 ? CONFIG.SQUASH_DECAY : CONFIG.SQUASH_ATTACK) * dt;
    return cur + clamp(diff * CONFIG.SQUASH_EASE, -limit, limit);
  }

  /**
   * Разгон к цели squash и возврат к норме. Зовётся и при падении после смерти.
   * keepTarget — цель держится (форма разбившегося кота), иначе, дойдя до неё,
   * снимается в норму.
   */
  function updateSquash(dt, keepTarget) {
    const p = player;
    // Пик пройден — снимаем цель. Проверяем именно значение относительно цели:
    // цель после прыжка равна 1.22 и к единице не близка, поэтому сравнение цели
    // с единицей не срабатывало никогда и кот залипал в растянутом/сплюснутом виде.
    if (!keepTarget) {
      if (Math.abs(p.squashY - p.squashTY) < CONFIG.SQUASH_EPS) p.squashTY = 1;
      if (Math.abs(p.squashX - p.squashTX) < CONFIG.SQUASH_EPS) p.squashTX = 1;
    }
    p.squashX = squashStep(p.squashX, p.squashTX, dt);
    p.squashY = squashStep(p.squashY, p.squashTY, dt);
  }

  function updatePlayer(dt) {
    const p = player;

    // --- Горизонталь: разгон / торможение / сопротивление воздуха ---
    const dir = axisX();
    if (dir !== 0) {
      p.vx = clamp(p.vx + dir * (p.grounded ? CONFIG.ACCEL : CONFIG.AIR_ACCEL) * dt,
        -CONFIG.MOVE_SPEED, CONFIG.MOVE_SPEED);
      p.facing = dir > 0 ? 1 : -1;
    } else {
      const mag = Math.max(0, Math.abs(p.vx) - (p.grounded ? CONFIG.FRICTION : CONFIG.AIR_DRAG) * dt);
      p.vx = p.vx < 0 ? -mag : mag;
    }

    // --- Койот-тайм и буфер прыжка ---
    if (p.grounded) {
      p.coyote = CONFIG.COYOTE_TIME;
      p.jumpsUsed = 0;
    } else {
      p.coyote = Math.max(0, p.coyote - dt);
    }
    if (input.jumpBuffer > 0) {
      if (p.coyote > 0) {
        doJump(CONFIG.JUMP_VELOCITY);
        p.jumpsUsed = 1;
        p.coyote = 0;
        input.jumpBuffer = 0;
      } else if (p.jumpsUsed < CONFIG.JUMP_COUNT_MAX) {
        doJump(CONFIG.DOUBLE_JUMP_VELOCITY);
        p.jumpsUsed += 1;
        input.jumpBuffer = 0;
        spawnDust(p.x + p.w / 2, p.y + p.h, 5);
      }
    }

    // --- Укорочение прыжка при раннем отпускании ---
    if (!jumpHeld() && p.jumpCutArmed && p.vy < 0) {
      p.vy *= CONFIG.JUMP_CUT;
      p.jumpCutArmed = false;
    }
    if (p.vy >= 0) p.jumpCutArmed = false;

    // --- Гравитация ---
    p.vy = Math.min(p.vy + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);

    // --- Езда на движущейся платформе ---
    if (p.riding && p.riding.active && p.riding.type === 'moving') p.x += p.riding.dx;

    // Сдвиг за кадр <= 30px < CAT_H + PLATFORM_H, поэтому туннелирования нет
    p.x = clamp(p.x + p.vx * dt, -player.w * 0.5, CONFIG.VIEW_W - p.w * 0.5);
    const wasGrounded = p.grounded;
    const prevBottom = p.y + p.h;
    p.y += p.vy * dt;
    resolveVertical(prevBottom, p.y + p.h, wasGrounded);

    // --- Мигание, след ---
    updateSquash(dt);
    p.blink -= dt;
    if (p.blink <= -CONFIG.BLINK_TIME) p.blink = CONFIG.BLINK_INTERVAL;

    trailTimer -= dt;
    if (trailTimer <= 0) {
      // След оставляем только в заметном движении: реже, чем раньше, и только
      // когда кот действительно летит/падает, а не стоит.
      if (!p.grounded && Math.abs(p.vx) + Math.max(0, p.vy) > CONFIG.TRAIL_MIN_SPEED) {
        trail.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, vy: p.vy, life: 1 });
        if (trail.length > CONFIG.TRAIL_MAX) trail.shift();
      }
      trailTimer = CONFIG.TRAIL_INTERVAL;
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      const t = trail[i];
      t.life -= dt * CONFIG.TRAIL_FADE;
      // Каждое пятно живёт своей баллистикой, а не повторяет текущую vy кота —
      // иначе след дёргается и «висит» в воздухе после приземления.
      t.vy += CONFIG.GRAVITY * CONFIG.TRAIL_FALL * dt;
      t.y += t.vy * dt * CONFIG.TRAIL_DRIFT;
      t.x += p.vx * dt * 0.15;
      if (t.life <= 0) trail.splice(i, 1);
    }

    // --- Высота и счёт ---
    // Считаем по лапам кота (y + h), а не по его верху: на старте он стоит на
    // крыше (y = 0), поэтому высота — ровно 0 и счёт не стартует с «фантовых» очков.
    maxHeight = Math.max(maxHeight, Math.max(0, -(p.y + p.h)));
    score = Math.floor(maxHeight / CONFIG.METERS_PER_SCORE);
  }

  /* ===========================================================
   * COLLISION — односторонние платформы (только приземление сверху)
   * =========================================================== */
  function resolveVertical(prevBottom, newBottom, wasGrounded) {
    const p = player;
    p.grounded = false;
    p.riding = null;
    if (p.vy < 0) return; // летим вверх — платформы пролетаем насквозь

    let landed = null;
    let landedY = Infinity;
    for (let i = 0; i < platforms.length; i++) {
      const plat = platforms[i];
      if (!plat.active) continue;
      if (p.x + p.w <= plat.x || p.x >= plat.x + plat.w) continue;
      const tol = CONFIG.COLLIDE_TOLERANCE;
      if (prevBottom <= plat.y + tol && newBottom >= plat.y && plat.y < landedY) {
        landedY = plat.y;
        landed = plat;
      }
    }
    if (landed) {
      onLand(landed, Math.abs(p.vy));
      return;
    }

    // Доп. проверка «стою на земле»: страхует движущиеся платформы и уход с края.
    // Работает только если на прошлом кадре кот стоял на земле, иначе приземление
    // обрабатывалось бы на кадр позже.
    if (wasGrounded && p.vy >= 0) {
      for (let i = 0; i < platforms.length; i++) {
        const plat = platforms[i];
        if (!plat.active) continue;
        if (p.x + p.w <= plat.x || p.x >= plat.x + plat.w) continue;
        if (Math.abs((p.y + p.h) - plat.y) <= CONFIG.GROUND_PROBE) {
          p.y = plat.y - p.h;
          p.vy = 0;
          p.grounded = true;
          p.riding = plat;
          p.jumpsUsed = 0;
          break;
        }
      }
    }
  }

  function onLand(plat, impactVel) {
    const p = player;
    p.y = plat.y - p.h;
    p.vy = 0;
    p.grounded = true;
    p.riding = plat;
    p.jumpsUsed = 0;
    p.coyote = CONFIG.COYOTE_TIME;

    // Пыль — только при настоящем приземлении. resolveVertical вызывает onLand
    // и когда кот просто стоит (каждый кадр), поэтому без этого гейта под лапами
    // стоящего кота всё время клубится пыль.
    const impact = clamp(impactVel / 700, 0, 1);
    if (impactVel > CONFIG.DUST_MIN_SPEED) {
      p.squashTY = 1 - CONFIG.LAND_SQUASH * (0.4 + impact * 0.6);
      p.squashTX = 1 + CONFIG.LAND_SQUASH * (0.4 + impact * 0.6);
      spawnDust(p.x + p.w / 2, plat.y, Math.round(CONFIG.DUST_COUNT * (0.4 + impact)));
    }

    if (plat.type === 'crumble' && plat.state === 'idle') {
      plat.state = 'crumbling';
      plat.timer = CONFIG.CRUMBLE_DELAY;
    }
    if (plat.type === 'bouncy') {
      p.vy = CONFIG.BOUNCY_VELOCITY;
      p.grounded = false;
      p.riding = null;
      p.jumpsUsed = 1;
      p.jumpCutArmed = false;
      p.squashTY = 1 + CONFIG.JUMP_STRETCH;
      p.squashTX = 1 - CONFIG.JUMP_STRETCH * 0.8;
      spawnSparks(p.x + p.w / 2, plat.y, CONFIG.SPARK_COUNT, 1);
      shake(2.5);
    }
  }

  /** AABB кота и шипа с inset'ом — без ложных срабатываний. */
  function checkHazards() {
    const p = player;
    const inset = CONFIG.HAZARD_INSET;
    const px0 = p.x + inset, px1 = p.x + p.w - inset;
    const py0 = p.y + inset, py1 = p.y + p.h - inset;
    if (px1 <= px0 || py1 <= py0) return;

    for (let i = 0; i < hazards.length; i++) {
      const hz = hazards[i];
      if (!hz.plat.active) continue;
      const hx0 = hz.plat.x + hz.offsetX + inset * 0.5;
      const hx1 = hx0 + hz.w - inset * 0.5;
      const hy0 = hz.plat.y - hz.h;
      if (px1 > hx0 && px0 < hx1 && py1 > hy0 && py0 < hz.plat.y) {
        die('spike');
        return;
      }
    }
  }

  function checkCoins() {
    const p = player;
    const inset = CONFIG.COIN_INSET;
    const px0 = p.x + inset, px1 = p.x + p.w - inset;
    const py0 = p.y + inset, py1 = p.y + p.h - inset;
    const r = CONFIG.COIN_R;

    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.taken) continue;
      if (c.y + r < cameraY - 40 || c.y - r > cameraY + CONFIG.VIEW_H + 40) continue;
      if (px1 > c.x - r && px0 < c.x + r && py1 > c.y - r && py0 < c.y + r) {
        c.taken = true;
        coinsCollected += 1;
        coinScore += CONFIG.COIN_VALUE;
        spawnSparks(c.x, c.y, CONFIG.SPARK_COUNT, 0);
        updateHud();
      }
    }
  }

  function checkDeath() {
    if (player.y > cameraY + CONFIG.VIEW_H + CONFIG.DEATH_MARGIN) die('fall');
  }

  /* ===========================================================
   * ENTITIES — обновление платформ (шипы и монеты живут на платформах)
   * =========================================================== */
  function updatePlatforms(dt) {
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      p.t += dt;
      if (p.type === 'moving') {
        // Орбита уже вписана в экран при создании, clamp — только страховка
        const nx = clamp(
          p.originX + Math.sin(p.t * p.speed + p.phase) * p.amp,
          CONFIG.SIDE_MARGIN * 0.5,
          CONFIG.VIEW_W - p.w - CONFIG.SIDE_MARGIN * 0.5
        );
        p.dx = nx - p.x;
        p.x = nx;
      } else {
        p.dx = 0;
      }

      if (p.type === 'crumble') {
        if (p.state === 'crumbling') {
          p.timer -= dt;
          if (p.timer <= 0) {
            p.state = 'gone';
            p.timer = CONFIG.CRUMBLE_RESPAWN;
            p.active = false;
            spawnShards(p);
          }
        } else if (p.state === 'gone') {
          p.timer -= dt;
          if (p.timer <= 0) { p.state = 'idle'; p.active = true; }
        }
      }
    }
  }

  /** Лёгкая жизнь декора в меню: едут только «движущиеся» платформы. */
  function updatePlatformsDecor(dt) {
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (p.type !== 'moving') continue;
      p.t += dt;
      const nx = clamp(
        p.originX + Math.sin(p.t * p.speed + p.phase) * p.amp,
        CONFIG.SIDE_MARGIN * 0.5,
        CONFIG.VIEW_W - p.w - CONFIG.SIDE_MARGIN * 0.5
      );
      p.dx = nx - p.x;
      p.x = nx;
    }
  }

  /* ===========================================================
   * PARTICLES — пыль, искры, осколки
   * =========================================================== */
  function addParticle(p) {
    if (particles.length >= CONFIG.PARTICLE_CAP) particles.shift();
    particles.push(p);
  }

  function spawnDust(x, y, count) {
    for (let i = 0; i < count; i++) {
      addParticle({
        kind: 'dust', x: x + rand(-6, 6), y: y + rand(-2, 1),
        vx: rand(-70, 70), vy: rand(-90, -20),
        life: rand(0.25, 0.5), maxLife: 0.5,
        size: rand(2, 4.5), grav: 260,
      });
    }
  }

  function spawnSparks(x, y, count, upBias) {
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(70, 210);
      addParticle({
        kind: 'spark', x, y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - upBias * 60,
        life: rand(0.22, 0.45), maxLife: 0.45,
        size: rand(1.4, 2.6), grav: 180,
      });
    }
  }

  function spawnShards(plat) {
    for (let i = 0; i < CONFIG.SHARD_COUNT; i++) {
      addParticle({
        kind: 'shard',
        x: plat.x + rand(2, Math.max(3, plat.w - 2)), y: plat.y + rand(0, plat.h),
        vx: rand(-110, 110), vy: rand(-160, -40),
        life: rand(0.4, 0.8), maxLife: 0.8,
        size: rand(3, 6.5), grav: 900,
      });
    }
    shake(3);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /* ===========================================================
   * CAMERA — следует вверх, монотонно, с мёртвой зоной и lerp
   * =========================================================== */
  function updateCamera(dt) {
    const targetY = player.y - CONFIG.VIEW_H * CONFIG.CAM_ANCHOR;
    if (targetY < cameraY - CONFIG.CAM_DEADZONE) {
      const next = cameraY + (targetY - cameraY) * (1 - Math.exp(-CONFIG.CAM_LERP * dt));
      cameraY = Math.min(next, cameraY); // только вверх (Y уменьшается)
    }
  }

  function shake(amount) {
    shakeAmp = Math.min(8, shakeAmp + amount);
  }

  function updateShake(dt) {
    if (shakeAmp <= 0) {
      shakeX = 0; shakeY = 0; shakeAmp = 0;
      return;
    }
    shakeAmp = Math.max(0, shakeAmp - CONFIG.SHAKE_DECAY * dt * 2);
    shakeX = rand(-shakeAmp, shakeAmp);
    shakeY = rand(-shakeAmp, shakeAmp);
  }

  /* ===========================================================
   * RENDER — фон → мир → частицы → виньетка (culling + save/restore)
   * =========================================================== */

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rawDpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    dpr = clamp(rawDpr, 1, CONFIG.MAX_DPR);
    canvas.width = Math.round(CONFIG.VIEW_W * dpr);
    canvas.height = Math.round(CONFIG.VIEW_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    buildGradients();
  }

  function buildGradients() {
    if (!ctx) return;
    skyGradient = ctx.createLinearGradient(0, 0, 0, CONFIG.VIEW_H);
    skyGradient.addColorStop(0, COLOR.skyTop);
    skyGradient.addColorStop(0.42, COLOR.skyMid);
    skyGradient.addColorStop(0.72, COLOR.skyLow);
    skyGradient.addColorStop(1, COLOR.skyBottom);

    vignetteGradient = ctx.createRadialGradient(
      CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2, CONFIG.VIEW_H * 0.32,
      CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2, CONFIG.VIEW_H * 0.78
    );
    vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGradient.addColorStop(1, COLOR.vignette);

    topShade = ctx.createLinearGradient(0, 0, 0, 90);
    topShade.addColorStop(0, 'rgba(6,6,24,0.35)');
    topShade.addColorStop(1, 'rgba(6,6,24,0)');
  }

  /** Видимость по вертикали с запасом — база для culling'а. */
  function isVisible(y, margin) {
    const top = y - cameraY;
    return top > -(margin || 40) && top < CONFIG.VIEW_H + (margin || 40);
  }

  function roundRectPath(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }

  function drawBackground() {
    // В меню фон чуть «дышит», в игре стоит на месте
    const drift = state === 'menu' ? Math.sin(bgTime * 0.35) * CONFIG.BG_MENU_DRIFT : 0;
    const scroll = -cameraY + drift;
    const space = spaceBlend();

    ctx.fillStyle = skyGradient || COLOR.skyMid;
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);

    // Космос — слой поверх сумеречного неба, прозрачность равна spaceBlend.
    // Градиент не пересоздаём: это один и тот же цвет, только нарастающий.
    if (space > 0) {
      ctx.save();
      ctx.globalAlpha = space;
      ctx.fillStyle = COLOR.space;
      ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
      ctx.restore();
    }

    // Звёзды: ярче и холоднее по мере наступления космоса
    ctx.fillStyle = space > 0 ? COLOR.starSpace : COLOR.star;
    const boost = 1 + space * CONFIG.SPACE_STAR_BOOST;
    const period = CONFIG.STAR_COUNT * 420;
    for (let i = 0; i < CONFIG.STAR_COUNT; i++) {
      const x = hash01(i * 3.7) * CONFIG.VIEW_W;
      const y = ((hash01(i * 7.1) * period - scroll * 0.12) % period + period) % period;
      ctx.globalAlpha = clamp((0.35 + 0.35 * Math.sin(bgTime * 1.6 + i)) * boost, 0, 1);
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    // Вторая «волна» звёзд — появляется вместе с космосом, тоже непрерывно
    if (space > 0) {
      for (let i = 0; i < CONFIG.STAR_COUNT; i++) {
        const x = hash01(i * 11.3 + 5) * CONFIG.VIEW_W;
        const y = ((hash01(i * 9.7 + 2) * period - scroll * 0.05) % period + period) % period;
        ctx.globalAlpha = space * CONFIG.SPACE_STAR_ALPHA
          * (0.45 + 0.55 * Math.sin(bgTime * 1.1 + i * 2.3));
        ctx.fillRect(x, y, 2.2, 2.2);
      }
    }
    ctx.globalAlpha = 1;

    // Луна с ореолом. Космос её «съедает»: и ореол, и диск, и кратеры гаснут
    // одним множителем, поэтому никаких ступенек на переходе.
    const moonY = 130 - (scroll * 0.06) % (CONFIG.VIEW_H * 2);
    ctx.save();
    const moonAlpha = 1 - space * CONFIG.MOON_FADE;
    if (moonAlpha > 0) {
      ctx.globalAlpha = moonAlpha;
      ctx.fillStyle = COLOR.moonGlow;
      ctx.beginPath();
      ctx.arc(384, moonY, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR.moon;
      ctx.beginPath();
      ctx.arc(384, moonY, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(210,180,120,0.35)';
      ctx.beginPath();
      ctx.arc(390, moonY - 6, 4.5, 0, Math.PI * 2);
      ctx.arc(377, moonY + 7, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    drawTowers(CONFIG.TOWER_FAR, COLOR.towerFar, CONFIG.TOWER_FAR_SEED);
    drawTowers(CONFIG.TOWER_NEAR, COLOR.towerNear, CONFIG.TOWER_NEAR_SEED);
    drawClouds(0.14, COLOR.cloud, CONFIG.CLOUD_SPAN, 90);
    drawClouds(0.3, COLOR.cloudNear, CONFIG.CLOUD_SPAN * 1.6, 46);
  }

  /**
   * Дома стоят на общей линии горизонта у самого низа кадра: основание (baseY)
   * уходит под нижний край, крыша растёт вверх. При подъёме кота горизонт
   * медленно опускается (параллакс) — город уезжает вниз и в итоге исчезает.
   */
  function drawTowers(cfg, color, seedOffset) {
    const scroll = (-cameraY - startRoofScreenY()) * cfg.parallax;
    const baseY = cfg.baseY + scroll;
    const minH = cfg.minH;
    // Крыша самого низкого дома — нижняя граница ряда. Когда она доходит до
    // нижнего края кадра, ряд начинает таять и за TOWER_FADE px параллакса
    // доходит до нуля. Раньше здесь стоял жёсткий return по maxTop: город
    // щёлкал целиком и исчезал одним кадром. Теперь прозрачность линейна.
    const maxTop = baseY - minH;
    const fade = 1 - clamp((maxTop - CONFIG.VIEW_H) / CONFIG.TOWER_FADE, 0, 1);
    if (fade <= 0) return;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = color;
    for (let i = 0; i < CONFIG.TOWER_COUNT; i++) {
      const w = cfg.wMin + hash01(i * 1.9 + seedOffset) * cfg.wVar;
      const h = minH + hash01(i * 3.7 + seedOffset) * cfg.hVar;
      const x = (i / CONFIG.TOWER_COUNT) * CONFIG.VIEW_W
        + (hash01(i * 5.3 + seedOffset) - 0.5) * (CONFIG.VIEW_W / CONFIG.TOWER_COUNT);
      const top = baseY - h;
      if (top > CONFIG.VIEW_H || x > CONFIG.VIEW_W || x + w < 0) continue;

      // Корпус уходит под низ кадра — дом стоит на земле, а не висит в небе
      ctx.fillRect(x, top, w, (baseY - top) + 40);

      // Окна — только по видимой части корпуса
      ctx.fillStyle = 'rgba(255,220,150,0.10)';
      for (let r = 0; r < 7; r++) {
        const wy = top + 14 + r * 28;
        if (wy > baseY - 12 || wy < -10) continue;
        if (hash01(i * 3.1 + r * 7 + seedOffset) < 0.42) continue;
        ctx.fillRect(x + 8, wy, 4, 6);
      }
      ctx.fillStyle = color;
    }
    ctx.restore();
  }

  function drawClouds(parallax, color, span, size) {
    // С наступлением космоса облака медленно уходят вниз и тают: и дрейф, и
    // прозрачность линейны по spaceBlend, поэтому переход без ступенек.
    const space = spaceBlend();
    // y = i * span - scroll, поэтому рост scroll тянет облака ВВЕРХ. Чтобы в
    // космосе они уходили вниз, из scroll вычитаем сдвиг (знак — наоборот).
    const scroll = -cameraY * parallax + (state === 'menu' ? bgTime * 6 : 0)
      - space * CONFIG.CLOUD_SPACE_FALL;
    const fade = 1 - space * CONFIG.CLOUD_SPACE_FADE;
    const first = Math.floor((scroll - CONFIG.VIEW_H) / span) - 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = color;
    for (let k = 0; k < CONFIG.CLOUD_COUNT; k++) {
      const i = first + k;
      const x = hash01(i * 1.7) * CONFIG.VIEW_W;
      const y = i * span - scroll;
      if (y > CONFIG.VIEW_H + 60 || y + 40 < -60) continue;
      const r = size * (0.7 + hash01(i * 4.4) * 0.7);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(x + r * 0.8, y + r * 0.16, r * 0.7, r * 0.42, 0, 0, Math.PI * 2);
      ctx.ellipse(x - r * 0.75, y + r * 0.2, r * 0.6, r * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function platformColors(type) {
    switch (type) {
      case 'moving': return [COLOR.movingTop, COLOR.movingBody];
      case 'crumble': return [COLOR.crumbleTop, COLOR.crumbleBody];
      case 'bouncy': return [COLOR.bouncyTop, COLOR.bouncyBody];
      default: return [COLOR.solidTop, COLOR.solidBody];
    }
  }

  function drawPlatforms() {
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (!isVisible(p.y, p.h + 60)) continue;
      if (p.x > CONFIG.VIEW_W + 40 || p.x + p.w < -40) continue;

      let x = p.x;
      let alpha = 1;
      if (p.type === 'crumble' && p.state === 'crumbling') x += Math.sin(bgTime * 60) * CONFIG.CRUMBLE_SHAKE;
      if (!p.active) alpha = 0.22;

      const cols = platformColors(p.type);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = cols[1];
      roundRectPath(ctx, x, p.y - cameraY, p.w, p.h, 4);
      ctx.fill();
      ctx.fillStyle = cols[0];
      roundRectPath(ctx, x, p.y - cameraY, p.w, Math.max(4, p.h * 0.5), 4);
      ctx.fill();
      drawPlatformDecor(p, x, p.y - cameraY, alpha);
      ctx.restore();
    }
  }

  /** Узоры поверх платформ: травинки, стрелки, трещины, «пружина». */
  function drawPlatformDecor(p, x, sy, alpha) {
    if (p.type === 'solid') {
      ctx.fillStyle = COLOR.solidEdge;
      for (let gx = x + 4; gx < x + p.w - 4; gx += 9) ctx.fillRect(gx, sy + 1, 2, 3);
      return;
    }
    if (p.type === 'moving') {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      const cy = sy + p.h / 2;
      const ax = p.dx >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x + p.w / 2 - 6 * ax, cy - 3);
      ctx.lineTo(x + p.w / 2 + 2 * ax, cy);
      ctx.lineTo(x + p.w / 2 - 6 * ax, cy + 3);
      ctx.closePath();
      ctx.fill();
      return;
    }
    ctx.lineWidth = 1.2;
    if (p.type === 'crumble') {
      ctx.strokeStyle = p.active ? 'rgba(40,28,10,0.45)' : 'rgba(40,28,10,0.2)';
      ctx.beginPath();
      const cracks = Math.max(2, Math.floor(p.w / 16));
      for (let c = 0; c < cracks; c++) {
        const cx = x + (p.w / cracks) * (c + 0.5);
        ctx.moveTo(cx, sy + 1);
        ctx.lineTo(cx + (c % 2 ? 3 : -3), sy + p.h - 1);
      }
      ctx.stroke();
      return;
    }
    // bouncy — «пружина» зигзагом
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = Math.max(3, Math.floor(p.w / 12));
    const stepW = (p.w - 6) / steps;
    for (let s = 0; s < steps; s++) {
      const sx = x + 3 + s * stepW;
      ctx.moveTo(sx, sy + p.h - 2);
      ctx.lineTo(sx + stepW / 2, sy + p.h / 2 + 1);
      ctx.lineTo(sx + stepW, sy + p.h - 2);
    }
    ctx.stroke();
  }

  function drawHazards() {
    for (let i = 0; i < hazards.length; i++) {
      const hz = hazards[i];
      if (!hz.plat.active || !isVisible(hz.plat.y, hz.h + 60)) continue;
      const x = hz.plat.x + hz.offsetX;
      if (x > CONFIG.VIEW_W + 20 || x + hz.w < -20) continue;
      const baseY = hz.plat.y - cameraY;
      const teeth = Math.max(2, Math.round(hz.w / 9));
      const tw = hz.w / teeth;

      ctx.save();
      ctx.beginPath();
      for (let t = 0; t < teeth; t++) {
        ctx.moveTo(x + t * tw, baseY);
        ctx.lineTo(x + t * tw + tw / 2, baseY - hz.h);
        ctx.lineTo(x + t * tw + tw, baseY);
        ctx.closePath();
      }
      ctx.fillStyle = COLOR.hazard;
      ctx.fill();
      ctx.strokeStyle = COLOR.hazardDark;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = COLOR.hazardDark;
      ctx.fillRect(x, baseY - 2.5, hz.w, 2.5);
      ctx.restore();
    }
  }

  function drawCoins() {
    const spin = 5.5;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.taken || !isVisible(c.y, 60)) continue;
      if (c.x < -30 || c.x > CONFIG.VIEW_W + 30) continue;
      const sy = c.y - cameraY + Math.sin(bgTime * 2 + c.phase) * 3;
      const rx = Math.max(1.2, CONFIG.COIN_R * Math.abs(Math.cos(bgTime * spin + c.phase)));

      ctx.save();
      ctx.fillStyle = COLOR.coinDark;
      ctx.beginPath();
      ctx.ellipse(c.x, sy, rx, CONFIG.COIN_R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR.coin;
      ctx.beginPath();
      ctx.ellipse(c.x, sy, rx * 0.78, CONFIG.COIN_R * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      if (rx > 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(c.x - 1, sy - CONFIG.COIN_R * 0.5, 1.6, CONFIG.COIN_R * 0.7);
      }
      ctx.restore();
    }
  }

  function drawTrail() {
    if (!trail.length) return;
    ctx.save();
    ctx.fillStyle = COLOR.trail;
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      if (!isVisible(t.y, 30)) continue;
      // Пятно уменьшается и гаснет, а не растёт и не держится в воздухе.
      const life = clamp(t.life, 0, 1);
      ctx.globalAlpha = life * life * 0.3;
      ctx.beginPath();
      ctx.arc(t.x, t.y - cameraY, CONFIG.TRAIL_R_MAX * life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Кот целиком из canvas-примитивов: тело, голова, уши, хвост, глаза. */
  function drawCat() {
    const p = player;
    if (!isVisible(p.y + p.h, 120)) return;

    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y - cameraY + p.h / 2);
    ctx.rotate(clamp(p.vx / CONFIG.MOVE_SPEED, -1, 1) * 0.1); // наклон в сторону бега
    ctx.scale(p.facing * p.squashX, p.squashY);              // отражение по фейсу + squash

    const bodyW = p.w * 0.92;
    const bodyH = p.h * 0.82;

    // хвост
    ctx.strokeStyle = COLOR.furDark;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.45, 6);
    ctx.quadraticCurveTo(-bodyW * 1.1, 4, -bodyW * 0.95, -12 - Math.sin(bgTime * 4) * 3);
    ctx.stroke();

    // лапки
    ctx.fillStyle = COLOR.furDark;
    ctx.beginPath();
    ctx.ellipse(-bodyW * 0.34, bodyH * 0.5, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(bodyW * 0.3, bodyH * 0.5, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // тело и пузико
    ctx.fillStyle = COLOR.fur;
    ctx.beginPath();
    ctx.ellipse(0, 4, bodyW * 0.5, bodyH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOR.furLight;
    ctx.beginPath();
    ctx.ellipse(2, 8, bodyW * 0.28, bodyH * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // голова
    const headY = -6;
    ctx.fillStyle = COLOR.fur;
    ctx.beginPath();
    ctx.arc(2, headY, 9.5, 0, Math.PI * 2);
    ctx.fill();

    // уши (наружная часть + розовая серединка)
    ctx.fillStyle = COLOR.furDark;
    ctx.beginPath();
    ctx.moveTo(-5, headY - 5); ctx.lineTo(-4.5, headY - 13); ctx.lineTo(1.5, headY - 8);
    ctx.closePath();
    ctx.moveTo(4, headY - 7); ctx.lineTo(6, headY - 14); ctx.lineTo(10, headY - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,180,190,0.75)';
    ctx.beginPath();
    ctx.moveTo(-4.2, headY - 6.5); ctx.lineTo(-3.8, headY - 11); ctx.lineTo(-1, headY - 8);
    ctx.closePath();
    ctx.moveTo(4.6, headY - 8); ctx.lineTo(5.8, headY - 11.5); ctx.lineTo(8, headY - 6);
    ctx.closePath();
    ctx.fill();

    // глаза (с морганием)
    if (p.blink < 0) {
      ctx.strokeStyle = COLOR.eye;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-1.5, headY - 1); ctx.lineTo(2, headY - 1);
      ctx.moveTo(5, headY - 1.5); ctx.lineTo(8.5, headY - 1.5);
      ctx.stroke();
    } else {
      ctx.fillStyle = COLOR.eye;
      ctx.beginPath();
      ctx.ellipse(0, headY - 1.5, 1.7, 2.2, 0, 0, Math.PI * 2);
      ctx.ellipse(6.5, headY - 2, 1.7, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0.6, headY - 2.4, 0.7, 0, Math.PI * 2);
      ctx.arc(7.1, headY - 2.9, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // нос, мордочка и усы
    ctx.fillStyle = 'rgba(230,120,120,0.9)';
    ctx.beginPath();
    ctx.moveTo(4.2, headY + 1.5);
    ctx.lineTo(5.6, headY + 1.5);
    ctx.lineTo(4.9, headY + 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLOR.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(4.9, headY + 2.6, 2.4, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(3, headY + 3.5); ctx.lineTo(-4, headY + 2);
    ctx.moveTo(3.5, headY + 4.5); ctx.lineTo(-4.5, headY + 4.5);
    ctx.moveTo(7, headY + 3.5); ctx.lineTo(13, headY + 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!isVisible(p.y, 30)) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === 'dust') {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y - cameraY, p.size * (1.4 - a * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = a;
        ctx.fillStyle = COLOR.coin;
        ctx.beginPath();
        ctx.arc(p.x, p.y - cameraY, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = COLOR.crumbleTop;
        ctx.fillRect(p.x - p.size / 2, p.y - cameraY - p.size / 2, p.size, p.size);
      }
    }
    ctx.restore();
  }

  function drawVignette() {
    if (vignetteGradient) {
      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    }
    if (topShade) { // лёгкое затемнение сверху — «небо» не отвлекает
      ctx.fillStyle = topShade;
      ctx.fillRect(0, 0, CONFIG.VIEW_W, 90);
    }
  }

  function render() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);

    drawBackground();
    ctx.save();
    if (shakeAmp > 0) ctx.translate(shakeX, shakeY);
    drawTrail();
    drawCoins();
    drawHazards();
    drawPlatforms();
    drawCat();
    drawParticles();
    ctx.restore();
    drawVignette();

    if (state === 'paused') {
      ctx.save();
      ctx.fillStyle = 'rgba(8,6,20,0.5)';
      ctx.fillRect(0, CONFIG.VIEW_H / 2 - 26, CONFIG.VIEW_W, 52);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ПАУЗА', CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2);
      ctx.restore();
    }
  }

  /* ===========================================================
   * GAME FLOW — состояния, счёт, рекорд, HUD
   * =========================================================== */

  function loadBest() {
    try {
      const value = parseInt(window.localStorage.getItem(CONFIG.BEST_KEY), 10);
      best = Number.isFinite(value) && value > 0 ? value : 0;
    } catch (err) {
      best = 0; // приватный режим / запрет хранилища — не ломаем игру
    }
    return best;
  }

  function saveBest() {
    try {
      window.localStorage.setItem(CONFIG.BEST_KEY, String(best));
    } catch (err) { /* хранилище может быть недоступно */ }
  }

  function totalScore() {
    return score + coinScore;
  }

  /** HUD пишем в DOM только при реальном изменении значения. */
  const hudCache = { score: null, best: null, coins: null };
  function updateHud() {
    const s = String(totalScore());
    const b = String(best);
    const c = String(coinsCollected);
    if (hudCache.score !== s) { hudCache.score = s; setText(dom.score, s); }
    if (hudCache.best !== b) { hudCache.best = b; setText(dom.best, b); }
    if (hudCache.coins !== c) { hudCache.coins = c; setText(dom.coins, c); }
  }

  function showOverPanel() {
    setText(dom.overBest, best);
    if (dom.overScore) setText(dom.overScore, totalScore());
    if (dom.overCoins) setText(dom.overCoins, coinsCollected);
    setOverlay(dom.over, true);
    setOverlay(dom.menu, false);
    overShown = true;
  }

  function start() {
    buildWorld();
    resetInput();
    state = 'playing';
    overShown = false;
    dieTimer = 0;
    lastTime = null;
    setOverlay(dom.menu, false);
    setOverlay(dom.over, false);
    updateHud();
  }

  function restart() {
    start();
  }

  /**
   * Выход в меню из любого состояния: menu / playing / paused / over.
   * Мир пересобирается, оверлеи приводятся в порядок, ввод сбрасывается —
   * иначе «зажатая» после смерти кнопка утащила бы кота сразу после старта.
   */
  function exitToMenu() {
    buildWorld();
    resetInput();
    state = 'menu';
    overShown = false;
    dieTimer = 0;
    lastTime = null;
    closeGuide();
    setOverlay(dom.menu, true);
    setOverlay(dom.over, false);
    updateHud();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    lastTime = null; // чтобы dt не накопился
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    lastTime = null;
  }

  function togglePause() {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
  }

  /** Смерть: короткая анимация падения, затем показ #over. */
  function die(reason) {
    if (state !== 'playing') return;
    state = 'over';
    deathReason = reason;
    dieTimer = CONFIG.DEATH_SHOW_DELAY;
    overShown = false;

    const final = totalScore();
    newBest = final > best;
    if (newBest) {
      best = final;
      saveBest();
    }
    updateHud();
    spawnSparks(player.x + player.w / 2, player.y + player.h / 2, CONFIG.SPARK_COUNT, 0);
    if (reason === 'spike') shake(6);
  }

  function getState() {
    return state;
  }

  function getDeathReason() {
    return deathReason;
  }

  /* ===========================================================
   * UPDATE — главный шаг симуляции
   * =========================================================== */
  function updateDyingCat(dt) {
    const p = player;
    p.vy = Math.min(p.vy + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);
    p.y += p.vy * dt;
    p.vx *= 0.99;
    p.x = clamp(p.x + p.vx * dt, -player.w * 0.5, CONFIG.VIEW_W - p.w * 0.5);
    p.squashTX = 0.8;
    p.squashTY = 1.25;
    updateSquash(dt, true); // форма держится до конца падения, иначе замирала/дёргалась
    dieTimer -= dt;
    if (dieTimer <= 0) showOverPanel();
  }

  function update(dt) {
    bgTime += dt;

    if (state === 'playing') {
      if (input.jumpBuffer > 0) input.jumpBuffer = Math.max(0, input.jumpBuffer - dt);
      updatePlatforms(dt);
      updatePlayer(dt);
      checkCoins();
      if (state === 'playing') checkHazards();
      if (state === 'playing') {
        updateCamera(dt);
        checkDeath();
      }
      updateShake(dt);
      updateHud();
      spawnUpTo(cameraY - CONFIG.VIEW_H - CONFIG.SPAWN_AHEAD);
      cullBehind();
    } else if (state === 'over' && !overShown) {
      updateShake(dt);
      updateDyingCat(dt); // анимация падения перед показом #over
    } else if (state === 'menu') {
      updateShake(dt);
      updatePlatformsDecor(dt);
    }
    updateParticles(dt);
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    const now = (ts || 0) * 0.001;
    let dt = lastTime === null ? 0 : now - lastTime;
    lastTime = now;
    // Клампинг: после сворачивания вкладки физика не «взрывается»
    if (!(dt > 0)) dt = 0;
    else if (dt > CONFIG.MAX_DT) dt = CONFIG.MAX_DT;

    update(dt);
    render();
  }

  /* ===========================================================
   * BOOT — инициализация, публичный API, destroy
   * =========================================================== */
  let booted = false;

  function init() {
    if (booted) return;
    grabDom();
    canvas = dom.canvas;

    if (!canvas || typeof canvas.getContext !== 'function') {
      console.warn('[CatJumper] Не найден <canvas id="game"> — игра не инициализирована.');
      return;
    }
    ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[CatJumper] Не удалось получить 2D-контекст — игра не инициализирована.');
      return;
    }

    booted = true;
    resizeCanvas();
    loadBest();
    buildWorld();     // мир нужен и для декора меню
    resetInput();
    updateHud();
    setupInput();

    state = 'menu';
    setOverlay(dom.menu, true);
    setOverlay(dom.over, false);

    rafId = window.requestAnimationFrame(frame);
  }

  function destroy() {
    if (!booted) return;
    booted = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    lastTime = null;
    for (let i = 0; i < input.listeners.length; i++) {
      const l = input.listeners[i];
      if (l.target && typeof l.target.removeEventListener === 'function') {
        l.target.removeEventListener(l.type, l.handler, l.options);
      }
    }
    input.listeners.length = 0;
    resetInput();
    platforms.length = 0;
    coins.length = 0;
    hazards.length = 0;
    particles.length = 0;
    trail.length = 0;
    state = 'menu';
  }

  // Публичный API для отладки/QA
  window.CatJumper = {
    start,
    restart,
    toMenu: exitToMenu,
    pause,
    resume,
    getState,
    destroy,
    getScore: totalScore,
    getBest: () => best,
    getCoins: () => coinsCollected,
    getHeight: () => maxHeight,
    getDeathReason,
    isNewBest: () => newBest,
    config: CONFIG,
  };

  // DOM уже готов при <script defer>, но на случай подключения без defer —
  // ждём DOMContentLoaded, и только если документ ещё грузится.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();