window.__ModuleLoader__.load({
  id: 'dsh-plugin-saber-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // 精灵表（8 列 × 9 行，单格 192×208），构建时注入 WebP data URL。
    const SPRITESHEET = '__SPRITESHEET_DATA_URL__';
    const CELL_W = 192;
    const CELL_H = 208;
    const DEFAULT_SCALE = 1.05;
    const SCALE_MIN = 0.6;
    const SCALE_MAX = 1.75;
    const SCALE_PRESETS = [
      { label: '小', value: 0.75 },
      { label: '标准', value: 1.05 },
      { label: '大', value: 1.4 },
    ];
    const POS_KEY = 'saber-pet:pos';
    const SCALE_KEY = 'saber-pet:scale';

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
    const totalDuration = (animation) => animation.durations.reduce((sum, value) => sum + value, 0);

    const STRINGS = {
      zh: {
        greeting: 'Master，Saber 已就位。拖动可移动我，滚轮或按钮可调整大小。',
        working: '正在挥剑执行任务……',
        waiting: '等待 Master 的指示或确认。',
        celebrate: '任务完成，举剑庆祝！',
        tip: '我是栖息在 Harness 里的 Saber。',
      },
      en: {
        greeting: 'Master, Saber reporting in. Drag me around; wheel or buttons resize me.',
        working: 'Swinging the sword — task in progress…',
        waiting: 'Awaiting your input or confirmation, Master.',
        celebrate: 'Task complete — raising the sword!',
        tip: 'I am Saber, living in your Harness.',
      },
    };

    const reducedMotion = () => {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
    };

    const clampScale = (value) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));

    /** 命令式桌宠部件：Shadow DOM 隔离 + rAF 动画引擎 + 拖拽/悬停/缩放交互。 */
    class SaberWidget {
      constructor(host, { language }) {
        this.host = host;
        this.disposed = false;
        this.language = STRINGS[language] ? language : 'zh';
        this.scale = DEFAULT_SCALE;
        this.state = { mode: 'idle' }; // idle | working | waiting
        this.once = null;              // { name, elapsed, done }
        this.hover = false;
        this.dragging = false;
        this.dragDir = 1;
        this.loopElapsed = 0;
        this.onceElapsed = 0;
        this.busyElapsed = 0;
        this.currentAnim = null;
        this.currentElapsed = 0;
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
            background-image: url("${SPRITESHEET}");
            background-repeat: no-repeat;
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
            padding: 8px 12px 7px;
            border-radius: 12px;
            background: linear-gradient(160deg, #4d6bfe, #6a83ff);
            color: #fff;
            font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
            font-size: 12.5px;
            line-height: 1.55;
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
          .bubble-actions {
            display: flex;
            gap: 4px;
            justify-content: center;
            margin-top: 6px;
          }
          .bubble-actions button {
            border: 0;
            border-radius: 10px;
            padding: 2px 9px;
            background: rgba(255, 255, 255, .28);
            color: #fff;
            font-family: inherit;
            font-size: 11.5px;
            line-height: 1.5;
            cursor: pointer;
          }
          .bubble-actions button:hover { background: rgba(255, 255, 255, .45); }
          .bubble-actions button.active { background: #fff; color: #3d5ef0; }
        `;
        root.append(style);

        this.pet = document.createElement('div');
        this.pet.className = 'pet';
        this.pet.setAttribute('role', 'img');
        this.pet.setAttribute('aria-label', 'Saber pet');
        this.bubble = document.createElement('div');
        this.bubble.className = 'bubble';
        this.bubbleText = document.createElement('div');
        this.bubbleText.className = 'bubble-text';
        this.bubbleActions = document.createElement('div');
        this.bubbleActions.className = 'bubble-actions';
        this.scaleButtons = SCALE_PRESETS.map((preset) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = preset.label;
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.setScale(preset.value);
          });
          this.bubbleActions.append(button);
          return { preset, button };
        });
        root.append(this.bubble, this.pet);
        this.bubble.append(this.bubbleText, this.bubbleActions);

        this.restoreScale();
        this.restorePosition();
        this.refreshScaleButtons();
        this.bindEvents();
        this.raf = requestAnimationFrame((now) => { this.lastFrame = now; this.tick(now); });
      }

      // ---- 大小 ----
      restoreScale() {
        try {
          const saved = Number.parseFloat(localStorage.getItem(SCALE_KEY) || '');
          if (Number.isFinite(saved)) this.scale = clampScale(saved);
        } catch { /* 页面本地偏好不可用则用默认值 */ }
        this.applyScale();
      }

      applyScale() {
        this.pet.style.width = `${Math.round(CELL_W * this.scale)}px`;
        this.pet.style.height = `${Math.round(CELL_H * this.scale)}px`;
        this.pet.style.backgroundSize =
          `${Math.round(1536 * this.scale)}px ${Math.round(1872 * this.scale)}px`;
      }

      setScale(value) {
        const next = clampScale(value);
        if (Math.abs(next - this.scale) < 0.001) { this.refreshScaleButtons(); return; }
        // 以脚底中心为锚缩放，宠物原地变大变小
        const oldWidth = this.pet.offsetWidth || Math.round(CELL_W * this.scale);
        const oldHeight = this.pet.offsetHeight || Math.round(CELL_H * this.scale);
        const centerX = this.x + oldWidth / 2;
        const bottomY = this.y + oldHeight;
        this.scale = next;
        this.applyScale();
        const width = Math.round(CELL_W * this.scale);
        const height = Math.round(CELL_H * this.scale);
        this.clampAndPlace(Math.round(centerX - width / 2), Math.round(bottomY - height), width, height);
        if (this.currentAnim) this.draw(this.currentAnim, this.currentElapsed); // 缩放不打断当前动画
        this.saveScale();
        this.refreshScaleButtons();
      }

      saveScale() {
        try { localStorage.setItem(SCALE_KEY, String(this.scale)); } catch { /* 忽略 */ }
      }

      refreshScaleButtons() {
        for (const { preset, button } of this.scaleButtons) {
          button.classList.toggle('active', Math.abs(this.scale - preset.value) < 0.01);
        }
      }

      // ---- 位置 ----
      restorePosition() {
        let x = null;
        let y = null;
        try {
          const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
          if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) { x = saved.x; y = saved.y; }
        } catch { /* 页面本地偏好不可用则用默认位 */ }
        const width = Math.round(CELL_W * this.scale);
        const height = Math.round(CELL_H * this.scale);
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
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: this.x, y: this.y })); } catch { /* 忽略 */ }
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
          else this.say(this.t('greeting'), 6400);
        };
        this.onDoubleClick = () => {
          this.playOnce('waving');
          this.say(this.t('greeting'), 6400);
        };
        this.onWheel = (event) => {
          if (this.dragging) return;
          event.preventDefault();
          this.setScale(this.scale * (event.deltaY > 0 ? 0.9 : 1.1));
        };
        this.onResize = () => this.clampAndPlace(this.x, this.y, this.pet.offsetWidth, this.pet.offsetHeight);
        this.pet.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        this.pet.addEventListener('dblclick', this.onDoubleClick);
        this.pet.addEventListener('wheel', this.onWheel, { passive: false });
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
        this.bubbleText.textContent = text;
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

      playOnce(stateName) {
        const animation = ANIMATIONS[stateName];
        if (!animation) return;
        this.once = { name: stateName, elapsed: 0 };
      }

      // ---- 动画引擎（迁移自 codex-saber preview 的 draw）----
      draw(animation, elapsed) {
        let remaining = elapsed % totalDuration(animation);
        let column = 0;
        if (!reducedMotion()) {
          while (column < animation.durations.length - 1 && remaining >= animation.durations[column]) {
            remaining -= animation.durations[column++];
          }
        }
        this.pet.style.backgroundPosition =
          `${-column * CELL_W * this.scale}px ${-animation.row * CELL_H * this.scale}px`;
      }

      tick(now) {
        if (this.disposed) return;
        const dt = Math.min(now - this.lastFrame, 120);
        this.lastFrame = now;

        if (this.dragging) {
          this.loopElapsed += dt;
          this.currentAnim = ANIMATIONS[this.dragDir >= 0 ? 'running-right' : 'running-left'];
          this.currentElapsed = this.loopElapsed;
          this.draw(this.currentAnim, this.currentElapsed);
        } else if (this.once) {
          this.onceElapsed += dt;
          const animation = ANIMATIONS[this.once.name];
          this.currentAnim = animation;
          this.currentElapsed = this.onceElapsed;
          this.draw(animation, this.onceElapsed);
          if (this.onceElapsed >= totalDuration(animation)) this.once = null;
        } else if (this.state.working) {
          this.busyElapsed += dt;
          this.currentAnim = ANIMATIONS.running;
          this.currentElapsed = this.busyElapsed;
          this.draw(this.currentAnim, this.currentElapsed);
        } else if (this.state.waiting) {
          this.busyElapsed += dt;
          this.currentAnim = ANIMATIONS.waiting;
          this.currentElapsed = this.busyElapsed;
          this.draw(this.currentAnim, this.currentElapsed);
        } else if (this.hover) {
          this.loopElapsed += dt;
          this.currentAnim = ANIMATIONS.jumping;
          this.currentElapsed = this.loopElapsed;
          this.draw(this.currentAnim, this.currentElapsed);
        } else {
          this.loopElapsed += dt;
          this.currentAnim = ANIMATIONS.idle;
          this.currentElapsed = this.loopElapsed;
          this.draw(this.currentAnim, this.currentElapsed);
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
        this.pet.removeEventListener('wheel', this.onWheel);
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
