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
    const POS_KEY = 'saber-pet:pos';
    const SCALE_KEY = 'saber-pet:scale';
    const COLLAPSED_KEY = 'saber-pet:collapsed';

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
        greeting: 'Master，Saber 已就位。拖动可移动我，滚轮可调整大小。',
        working: '正在挥剑执行任务……',
        waiting: '等待 Master 的指示或确认。',
        celebrate: '任务完成，举剑庆祝！',
        panelTitle: 'Saber · 桌宠',
        sizeLabel: '显示大小',
        collapse: '收起 Saber',
        recall: '唤回 Saber ↗',
      },
      en: {
        greeting: 'Master, Saber reporting in. Drag me around; the scroll wheel resizes me.',
        working: 'Swinging the sword — task in progress…',
        waiting: 'Awaiting your input or confirmation, Master.',
        celebrate: 'Task complete — raising the sword!',
        panelTitle: 'Saber · Pet',
        sizeLabel: 'Size',
        collapse: 'Hide Saber',
        recall: 'Recall Saber ↗',
      },
    };

    const reducedMotion = () => {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
    };

    const clampScale = (value) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));

    /** 命令式桌宠部件：Shadow DOM 隔离 + rAF 动画引擎 + 拖拽/悬停/滚轮缩放/右键面板。 */
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
        this.collapsed = false;
        this.lastFrame = performance.now();
        this.hideTimer = 0;

        const root = host.attachShadow({ mode: 'open' });
        this.root = root;
        const style = document.createElement('style');
        style.textContent = `
          :host {
            all: initial;
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 29;
            color-scheme: inherit;
          }
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
            padding: 8px 12px;
            border-radius: 12px;
            background: #ffffff;
            border: 1px solid light-dark(rgba(0, 0, 0, .1), rgba(255, 255, 255, .16));
            color: #394565;
            font: 12.5px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
            box-shadow: 0 8px 22px rgba(31, 51, 138, .14);
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
            background: #ffffff;
            border-right: 1px solid light-dark(rgba(0, 0, 0, .1), rgba(255, 255, 255, .16));
            border-bottom: 1px solid light-dark(rgba(0, 0, 0, .1), rgba(255, 255, 255, .16));
          }
          .panel {
            position: absolute;
            width: 250px;
            padding: 12px 14px;
            border-radius: 14px;
            background: light-dark(#ffffff, #2b2c31);
            border: 1px solid light-dark(rgba(0, 0, 0, .08), rgba(255, 255, 255, .14));
            box-shadow: 0 10px 30px rgba(15, 25, 60, .18);
            color: light-dark(#1f2a44, #e8eaf6);
            font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
            font-size: 12.5px;
            line-height: 1.5;
            pointer-events: auto;
            display: none;
          }
          .panel.show { display: block; }
          .panel-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }
          .panel-title { font-weight: 600; font-size: 13px; }
          .panel-close {
            border: 0;
            background: transparent;
            cursor: pointer;
            color: inherit;
            width: 22px;
            height: 22px;
            border-radius: 6px;
            font-size: 14px;
            line-height: 1;
          }
          .panel-close:hover { background: rgba(128, 128, 128, .15); }
          .panel-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin: 8px 0;
          }
          .panel-label { font-size: 12.5px; }
          .panel-slider-wrap {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            justify-content: flex-end;
          }
          .panel-slider { width: 110px; accent-color: #4d6bfe; }
          .panel-pct { font-size: 12px; min-width: 36px; text-align: right; opacity: .8; }
          .panel-collapse {
            width: 100%;
            margin-top: 10px;
            padding: 6px 0;
            border: 1px solid light-dark(rgba(0, 0, 0, .12), rgba(255, 255, 255, .18));
            border-radius: 10px;
            background: transparent;
            color: inherit;
            font-family: inherit;
            font-size: 12.5px;
            cursor: pointer;
          }
          .panel-collapse:hover { background: rgba(128, 128, 128, .12); }
          .pill {
            position: absolute;
            right: 16px;
            bottom: 16px;
            padding: 4px 12px;
            border-radius: 999px;
            background: light-dark(#ffffff, #2b2c31);
            border: 1px solid light-dark(rgba(0, 0, 0, .1), rgba(255, 255, 255, .14));
            box-shadow: 0 4px 14px rgba(15, 25, 60, .16);
            color: light-dark(#1f2a44, #e8eaf6);
            font: 12px/1.5 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
            cursor: pointer;
            pointer-events: auto;
            display: none;
          }
          .pill.show { display: block; }
        `;
        root.append(style);

        this.pet = document.createElement('div');
        this.pet.className = 'pet';
        this.pet.setAttribute('role', 'img');
        this.pet.setAttribute('aria-label', 'Saber pet');

        this.bubble = document.createElement('div');
        this.bubble.className = 'bubble';

        this.panel = document.createElement('div');
        this.panel.className = 'panel';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-label', 'Saber settings');
        const head = document.createElement('div');
        head.className = 'panel-head';
        const title = document.createElement('span');
        title.className = 'panel-title';
        this.panelClose = document.createElement('button');
        this.panelClose.type = 'button';
        this.panelClose.className = 'panel-close';
        this.panelClose.textContent = '✕';
        this.panelClose.title = '关闭';
        head.append(title, this.panelClose);
        this.panelTitleEl = title;
        const sizeRow = document.createElement('div');
        sizeRow.className = 'panel-row';
        const sizeLabel = document.createElement('span');
        sizeLabel.className = 'panel-label';
        this.sizeLabelEl = sizeLabel;
        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'panel-slider-wrap';
        this.slider = document.createElement('input');
        this.slider.type = 'range';
        this.slider.className = 'panel-slider';
        this.slider.min = String(Math.round(SCALE_MIN * 100));
        this.slider.max = String(Math.round(SCALE_MAX * 100));
        this.slider.step = '5';
        this.pct = document.createElement('span');
        this.pct.className = 'panel-pct';
        sliderWrap.append(this.slider, this.pct);
        sizeRow.append(sizeLabel, sliderWrap);
        this.collapseButton = document.createElement('button');
        this.collapseButton.type = 'button';
        this.collapseButton.className = 'panel-collapse';
        this.panel.append(head, sizeRow, this.collapseButton);

        this.pill = document.createElement('button');
        this.pill.type = 'button';
        this.pill.className = 'pill';
        this.pill.setAttribute('aria-label', 'Recall Saber');

        root.append(this.bubble, this.panel, this.pet, this.pill);

        this.restoreScale();
        this.restorePosition();
        this.refreshPanelTexts();
        this.bindEvents();
        this.restoreCollapsed();
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
        if (Math.abs(next - this.scale) < 0.001) return;
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
        this.placeBubble();
        this.refreshPanelSize();
      }

      saveScale() {
        try { localStorage.setItem(SCALE_KEY, String(this.scale)); } catch { /* 忽略 */ }
      }

      // ---- 面板 ----
      refreshPanelTexts() {
        this.panelTitleEl.textContent = this.t('panelTitle');
        this.sizeLabelEl.textContent = this.t('sizeLabel');
        this.collapseButton.textContent = this.t('collapse');
        this.pill.textContent = this.t('recall');
        this.refreshPanelSize();
      }

      refreshPanelSize() {
        this.slider.value = String(Math.round(this.scale * 100));
        this.pct.textContent = `${Math.round(this.scale * 100)}%`;
      }

      showPanel() {
        if (this.disposed || this.collapsed) return;
        this.panel.classList.add('show');
        this.refreshPanelSize();
        this.placePanel();
      }

      hidePanel() {
        this.panel.classList.remove('show');
      }

      placePanel() {
        const panelWidth = this.panel.offsetWidth || 250;
        const panelHeight = this.panel.offsetHeight || 150;
        const petWidth = this.pet.offsetWidth;
        const petHeight = this.pet.offsetHeight;
        // 优先放在宠物右侧，放不下则放左侧，再不行贴窗口边
        let left = this.x + petWidth + 10;
        if (left + panelWidth > window.innerWidth - 8) left = this.x - panelWidth - 10;
        left = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, left));
        const top = Math.max(8, Math.min(window.innerHeight - panelHeight - 8, this.y + petHeight / 2 - panelHeight / 2));
        this.panel.style.left = `${left}px`;
        this.panel.style.top = `${top}px`;
      }

      // ---- 收起 / 唤回 ----
      collapse() {
        if (this.collapsed) return;
        this.collapsed = true;
        this.hidePanel();
        this.bubble.classList.remove('show');
        this.pet.style.display = 'none';
        this.pill.textContent = this.t('recall');
        this.pill.classList.add('show');
        try { localStorage.setItem(COLLAPSED_KEY, '1'); } catch { /* 忽略 */ }
      }

      restore() {
        if (!this.collapsed) return;
        this.collapsed = false;
        this.pet.style.display = '';
        this.pill.classList.remove('show');
        try { localStorage.removeItem(COLLAPSED_KEY); } catch { /* 忽略 */ }
        this.playOnce('waving');
        this.say(this.t('greeting'), 6400);
      }

      restoreCollapsed() {
        let collapsed = false;
        try { collapsed = localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { /* 忽略 */ }
        if (!collapsed) return;
        this.collapsed = true;
        this.pet.style.display = 'none';
        this.pill.textContent = this.t('recall');
        this.pill.classList.add('show');
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
          // 默认停靠窗口右下角
          x = window.innerWidth - width - 28;
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
            this.placeBubble();
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
          if (this.dragging || this.collapsed) return;
          event.preventDefault();
          this.setScale(this.scale * (event.deltaY > 0 ? 0.9 : 1.1));
        };
        this.onContextMenu = (event) => {
          if (this.collapsed) return;
          event.preventDefault();
          event.stopPropagation();
          if (this.panel.classList.contains('show')) this.hidePanel();
          else this.showPanel();
        };
        this.onPanelClose = () => this.hidePanel();
        this.onCollapse = () => this.collapse();
        this.onPillClick = () => this.restore();
        this.onSliderInput = () => {
          const percent = Number.parseInt(this.slider.value, 10);
          if (Number.isFinite(percent)) this.setScale(percent / 100);
        };
        this.onGlobalPointerDown = (event) => {
          // 点击面板与宠物之外的区域时收起面板
          if (!this.panel.classList.contains('show')) return;
          const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
          if (path.includes(this.panel) || path.includes(this.pet)) return;
          this.hidePanel();
        };
        this.onResize = () => {
          this.clampAndPlace(this.x, this.y, this.pet.offsetWidth, this.pet.offsetHeight);
          this.placeBubble();
          if (this.panel.classList.contains('show')) this.placePanel();
        };
        this.pet.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        this.pet.addEventListener('dblclick', this.onDoubleClick);
        this.pet.addEventListener('wheel', this.onWheel, { passive: false });
        this.pet.addEventListener('contextmenu', this.onContextMenu);
        this.panelClose.addEventListener('click', this.onPanelClose);
        this.slider.addEventListener('input', this.onSliderInput);
        this.collapseButton.addEventListener('click', this.onCollapse);
        this.pill.addEventListener('click', this.onPillClick);
        window.addEventListener('pointerdown', this.onGlobalPointerDown, true);
        window.addEventListener('resize', this.onResize);
      }

      // ---- 文案 ----
      t(key) {
        const table = STRINGS[this.language] || STRINGS.zh;
        return table[key] ?? key;
      }

      setLanguage(language) {
        if (STRINGS[language]) this.language = language;
        this.refreshPanelTexts();
      }

      say(text, duration = 4200) {
        if (this.disposed || this.collapsed) return;
        this.bubble.textContent = text;
        this.bubble.classList.add('show');
        this.placeBubble();
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => this.bubble.classList.remove('show'), duration);
      }

      /** 让可见的气泡跟随宠物当前位置与尺寸（缩放、拖拽后调用）。 */
      placeBubble() {
        if (this.disposed || this.collapsed || !this.bubble.classList.contains('show')) return;
        const bubbleWidth = Math.min(260, this.bubble.offsetWidth || 220);
        const petWidth = this.pet.offsetWidth;
        const left = Math.max(4, Math.min(window.innerWidth - bubbleWidth - 8, this.x + petWidth / 2 - bubbleWidth / 2));
        const bottom = this.y - 14;
        this.bubble.style.left = `${left}px`;
        this.bubble.style.top = `${Math.max(4, bottom - this.bubble.offsetHeight)}px`;
        this.bubble.style.setProperty('--tail', `${Math.min(90, Math.max(10, (this.x + petWidth / 2 - left)))}px`);
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
        if (this.collapsed) {
          // 收起期间保持时钟，唤回后动画立即正常
          this.lastFrame = now;
          this.currentAnim = null;
          this.raf = requestAnimationFrame((next) => this.tick(next));
          return;
        }
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
        this.pet.removeEventListener('contextmenu', this.onContextMenu);
        this.panelClose.removeEventListener('click', this.onPanelClose);
        this.slider.removeEventListener('input', this.onSliderInput);
        this.collapseButton.removeEventListener('click', this.onCollapse);
        this.pill.removeEventListener('click', this.onPillClick);
        window.removeEventListener('pointerdown', this.onGlobalPointerDown, true);
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
