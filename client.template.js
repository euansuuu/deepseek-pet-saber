window.__ModuleLoader__.load({
  id: 'dsh-plugin-saber-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // 精灵表（8 列 × 9 行，单格 192×208），构建时注入 WebP data URL。
    const SPRITESHEET = '__SPRITESHEET_DATA_URL__';
    const CELL_W = 192;
    const CELL_H = 208;
    const PET_SCALE = 1.05;
    const STORAGE_KEY = 'saber-pet:pos';

    // 动作编排迁移自 codex-saber 的 animation.json v1（每行一个动作）。
    const ANIMATIONS = {
      idle: { row: 0, durations: [1680, 660, 660, 840, 840, 1920] },
      'running-right': { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
      'running-left': { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
      waving: { row: 3, durations: [140, 140, 140, 280] },
      jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
      failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
      waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
      running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
      review: { row: 8, durations: [150, 150, 150, 150, 150, 280] },
    };
    const totalDuration = (anim) => anim.durations.reduce((sum, value) => sum + value, 0);

    const STRINGS = {
      zh: {
        greeting: 'Master，Saber 已就位。拖动可移动我，点击可召唤气泡。',
        working: '正在挥剑执行任务……',
        waiting: '等待 Master 的指示或确认。',
        celebrate: '任务完成，举剑庆祝！',
        tip: '我是栖息在 Harness 里的 Saber。',
      },
      en: {
        greeting: 'Master, Saber reporting in. Drag me around, click me to talk.',
        working: 'Swinging the sword — task in progress…',
        waiting: 'Awaiting your input or confirmation, Master.',
        celebrate: 'Task complete — raising the sword!',
        tip: 'I am Saber, living in your Harness.',
      },
    };

    const reducedMotion = () => {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
    };

    /** 命令式桌宠部件：Shadow DOM 隔离 + rAF 动画引擎 + 拖拽/悬停交互。 */
    class SaberWidget {
      constructor(host, { language }) {
        this.host = host;
        this.disposed = false;
        this.language = STRINGS[language] ? language : 'zh';
        this.state = { mode: 'idle' }; // idle | working | waiting
        this.once = null;              // { name, elapsed, done }
        this.hover = false;
        this.dragging = false;
        this.dragDir = 1;
        this.loopElapsed = 0;
        this.onceElapsed = 0;
        this.busyElapsed = 0;
        this.lastFrame = performance.now();
        this.hideTimer = 0;

        const root = host.attachShadow({ mode: 'open' });
        this.root = root;
        const style = document.createElement('style');
        style.textContent = `
          :host { all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 29; }
          * { box-sizing: border-box; }
          .pet {
            position: absolute;
            width: ${Math.round(CELL_W * PET_SCALE)}px;
            height: ${Math.round(CELL_H * PET_SCALE)}px;
            background-image: url("${SPRITESHEET}");
            background-repeat: no-repeat;
            background-size: ${Math.round(1536 * PET_SCALE)}px ${Math.round(1872 * PET_SCALE)}px;
            image-rendering: auto;
            pointer-events: auto;
            cursor: grab;
            will-change: background-position;
            filter: drop-shadow(0 6px 10px rgba(31, 51, 138, .25));
          }
          .pet:active { cursor: grabbing; }
          .bubble {
            position: absolute;
            max-width: 260px;
            padding: 8px 12px;
            border-radius: 12px;
            background: linear-gradient(160deg, #4d6bfe, #6a83ff);
            color: #fff;
            font: 12.5px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
            box-shadow: 0 8px 22px rgba(31, 51, 138, .32);
            opacity: 0;
            transform: translateY(6px);
            transition: opacity .18s ease, transform .18s ease;
            pointer-events: none;
            white-space: pre-wrap;
          }
          .bubble.show { opacity: 1; transform: translateY(0); }
          .bubble::after {
            content: "";
            position: absolute;
            bottom: -6px;
            left: var(--tail, 50%);
            width: 12px; height: 12px;
            transform: translateX(-50%) rotate(45deg);
            background: #6a83ff;
          }
        `;
        root.append(style);

        this.pet = document.createElement('div');
        this.pet.className = 'pet';
        this.pet.setAttribute('role', 'img');
        this.pet.setAttribute('aria-label', 'Saber pet');
        this.bubble = document.createElement('div');
        this.bubble.className = 'bubble';
        root.append(this.bubble, this.pet);

        this.restorePosition();
        this.drawFrame(ANIMATIONS.idle, 0);
        this.bindEvents();
        this.raf = requestAnimationFrame((now) => { this.lastFrame = now; this.tick(now); });
      }

      // ---- 位置 ----
      restorePosition() {
        let x = null;
        let y = null;
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
          if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) { x = saved.x; y = saved.y; }
        } catch { /* 页面本地偏好不可用则用默认位 */ }
        const width = Math.round(CELL_W * PET_SCALE);
        const height = Math.round(CELL_H * PET_SCALE);
        if (x === null) {
          x = 28;
          y = window.innerHeight - height - 24;
        }
        this.clampAndPlace(x, y, width, height);
      }

      clampAndPlace(x, y, width, height) {
        const maxX = Math.max(4, window.innerWidth - width - 4);
        const maxY = Math.max(4, window.innerHeight - height - 4);
        this.x = Math.min(Math.max(4, x), maxX);
        this.y = Math.min(Math.max(4, y), maxY);
        this.pet.style.left = `${this.x}px`;
        this.pet.style.top = `${this.y}px`;
      }

      savePosition() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: this.x, y: this.y })); } catch { /* 忽略 */ }
      }

      // ---- 交互 ----
      bindEvents() {
        this.onPointerDown = (event) => {
          if (event.button !== 0) return;
          this.dragging = true;
          this.dragMoved = false;
          this.dragDir = 1;
          this.lastPointerX = event.clientX;
          this.lastPointerY = event.clientY;
          this.pet.setPointerCapture?.(event.pointerId);
          event.preventDefault();
        };
        this.onPointerMove = (event) => {
          if (this.dragging) {
            const dx = event.clientX - this.lastPointerX;
            const dy = event.clientY - this.lastPointerY;
            if (dx === 0 && dy === 0) return;
            this.dragMoved = true;
            if (dx > 1) this.dragDir = 1;
            else if (dx < -1) this.dragDir = -1;
            this.lastPointerX = event.clientX;
            this.lastPointerY = event.clientY;
            this.clampAndPlace(this.x + dx, this.y + dy, this.pet.offsetWidth, this.pet.offsetHeight);
            return;
          }
          const rect = this.pet.getBoundingClientRect();
          const over = event.clientX >= rect.left && event.clientX <= rect.right
            && event.clientY >= rect.top && event.clientY <= rect.bottom;
          this.hover = over;
        };
        this.onPointerUp = () => {
          if (!this.dragging) return;
          this.dragging = false;
          if (this.dragMoved) this.savePosition();
          else this.say(this.t('greeting'), 5200);
        };
        this.onDoubleClick = () => {
          this.playOnce('waving');
          this.say(this.t('greeting'), 5200);
        };
        this.onResize = () => this.clampAndPlace(this.x, this.y, this.pet.offsetWidth, this.pet.offsetHeight);
        this.pet.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        this.pet.addEventListener('dblclick', this.onDoubleClick);
        window.addEventListener('resize', this.onResize);
      }

      // ---- 文案 ----
      t(key) {
        const table = STRINGS[this.language] || STRINGS.zh;
        return table[key] ?? key;
      }

      setLanguage(language) {
        if (STRINGS[language]) this.language = language;
      }

      say(text, duration = 4200) {
        if (this.disposed) return;
        this.bubble.textContent = text;
        // 气泡贴在宠物上方
        const bubbleWidth = Math.min(260, this.bubble.offsetWidth || 220);
        const petWidth = this.pet.offsetWidth;
        const left = Math.max(4, Math.min(window.innerWidth - bubbleWidth - 8, this.x + petWidth / 2 - bubbleWidth / 2));
        const bottom = this.y - 14;
        this.bubble.style.left = `${left}px`;
        this.bubble.style.top = `${Math.max(4, bottom - this.bubble.offsetHeight)}px`;
        this.bubble.style.setProperty('--tail', `${Math.min(90, Math.max(10, (this.x + petWidth / 2 - left)))}px`);
        this.bubble.classList.add('show');
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => this.bubble.classList.remove('show'), duration);
      }

      // ---- 状态 ----
      setState(next) {
        if (this.disposed) return;
        const wasWorking = this.state.mode === 'working';
        this.state = { ...this.state, ...next };
        if (next.working === true) this.once = null; // 执行优先，打断庆祝
        if (wasWorking && next.working === false) {
          // 完成瞬间（无法区分取消/失败原因，均以庆祝收尾）
          this.playOnce('review');
          this.say(this.t('celebrate'), 4200);
        } else if (next.working === true) {
          this.say(this.t('working'), 3600);
        } else if (next.waiting === true && wasWorking === false && this.state.mode !== 'waiting') {
          this.say(this.t('waiting'), 3600);
        }
      }

      playOnce(name) {
        const anim = ANIMATIONS[name];
        if (!anim) return;
        this.once = { name, elapsed: 0 };
      }

      // ---- 动画引擎（迁移自 codex-saber preview 的 draw）----
      drawFrame(anim, elapsed) {
        let remaining = elapsed % totalDuration(anim);
        let column = 0;
        if (!reducedMotion()) {
          while (column < anim.durations.length - 1 && remaining >= anim.durations[column]) {
            remaining -= anim.durations[column++];
          }
        }
        this.pet.style.backgroundPosition =
          `${-column * CELL_W * PET_SCALE}px ${-anim.row * CELL_H * PET_SCALE}px`;
      }

      tick(now) {
        if (this.disposed) return;
        const dt = Math.min(now - this.lastFrame, 120);
        this.lastFrame = now;

        if (this.dragging) {
          this.loopElapsed += dt;
          this.drawFrame(ANIMATIONS[this.dragDir >= 0 ? 'running-right' : 'running-left'], this.loopElapsed);
        } else if (this.once) {
          this.onceElapsed += dt;
          const anim = ANIMATIONS[this.once.name];
          this.drawFrame(anim, this.onceElapsed);
          if (this.onceElapsed >= totalDuration(anim)) this.once = null;
        } else if (this.state.working) {
          this.busyElapsed += dt;
          this.drawFrame(ANIMATIONS.running, this.busyElapsed);
        } else if (this.state.waiting) {
          this.busyElapsed += dt;
          this.drawFrame(ANIMATIONS.waiting, this.busyElapsed);
        } else if (this.hover) {
          this.loopElapsed += dt;
          this.drawFrame(ANIMATIONS.jumping, this.loopElapsed);
        } else {
          this.loopElapsed += dt;
          this.drawFrame(ANIMATIONS.idle, this.loopElapsed);
        }
        this.raf = requestAnimationFrame((next) => this.tick(next));
      }

      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        clearTimeout(this.hideTimer);
        this.pet.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.pet.removeEventListener('dblclick', this.onDoubleClick);
        window.removeEventListener('resize', this.onResize);
        this.root.replaceChildren();
      }
    }

    /** 从 Session catalog/status 快照聚合工作与等待状态（字段读取保持防御式）。 */
    function aggregateActivity(catalog, statuses) {
      let working = false;
      let waiting = false;
      const statusList = statuses && typeof statuses === 'object' ? Object.values(statuses) : [];
      for (const status of statusList) {
        if (!status || typeof status !== 'object') continue;
        if (status.running === true) working = true;
        if (status.waiting === true || status.pending === true || status.pendingInteraction != null) waiting = true;
      }
      if (!working && catalog && typeof catalog === 'object') {
        const rows = catalog.byId ? Object.values(catalog.byId)
          : Array.isArray(catalog.rows) ? catalog.rows : [];
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          if (row.running === true) working = true;
          if (row.waiting === true || row.pending === true) waiting = true;
        }
      }
      return { working, waiting };
    }

    function readLanguage(locale) {
      try {
        const active = locale?.getSnapshot?.().active;
        return typeof active === 'string' && active.startsWith('zh') ? 'zh' : 'en';
      } catch { return 'zh'; }
    }

    function createPlugin() {
      return {
        inject: ['slots', 'locale'],
        apply(ctx) {
          // 注册界面文案（en/zh），注册失败不影响渲染。
          try {
            ctx.locale?.register?.('saber-pet', { zh: STRINGS.zh, en: STRINGS.en });
          } catch { /* locale 服务不可用时直接用内置表 */ }

          function useSaber() {
            const element = React.useRef(null);
            const widget = React.useRef(null);
            React.useEffect(() => {
              if (!element.current) return undefined;
              const instance = new SaberWidget(element.current, { language: readLanguage(ctx.locale) });
              widget.current = instance;
              let stopLanguage = () => {};
              try {
                stopLanguage = ctx.locale?.subscribe?.(() => instance.setLanguage(readLanguage(ctx.locale))) || (() => {});
              } catch { /* 语言订阅失败保持初始语言 */ }
              return () => {
                stopLanguage();
                instance.dispose();
                if (widget.current === instance) widget.current = null;
              };
            }, []);
            return [element, widget];
          }

          function QuietPet() {
            const [element] = useSaber();
            return h('div', { ref: element, 'data-saber-pet': 'quiet' });
          }

          function ConnectedPet(props) {
            const catalog = props.useSessions((snapshot) => snapshot);
            const statuses = props.useSessionStatus((map) => map);
            const latest = React.useRef({ catalog, statuses });
            latest.current = { catalog, statuses };
            const [element, widget] = useSaber();
            React.useEffect(() => {
              widget.current?.setState(aggregateActivity(latest.current.catalog, latest.current.statuses));
            }, [catalog, statuses]);
            return h('div', { ref: element, 'data-saber-pet': 'connected' });
          }

          class Boundary extends React.Component {
            constructor(props) { super(props); this.state = { failed: false }; }
            static getDerivedStateFromError() { return { failed: true }; }
            render() { return this.state.failed ? h(QuietPet) : this.props.children; }
          }

          function PetRoot(props) {
            const supported = typeof props.useSessions === 'function' && typeof props.useSessionStatus === 'function';
            return h(Boundary, null, supported ? h(ConnectedPet, props) : h(QuietPet));
          }

          ctx.slots.inject('shell.overlay', () => ctx.slots.register({
            name: 'shell.overlay', id: 'saber-pet', order: 91,
          }, PetRoot));
        },
      };
    }

    return createPlugin();
  },
});
