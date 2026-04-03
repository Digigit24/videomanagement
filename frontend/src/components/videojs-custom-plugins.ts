/**
 * Custom Video.js components: Skip buttons + Quality selector menu
 * Also injects CSS overrides that MUST load after Video.js + Tailwind.
 */
import videojs from 'video.js';

let registered = false;

export function registerCustomComponents() {
  if (registered) return;
  registered = true;

  // --- Inject CSS override via <style> tag (loads LAST, wins specificity) ---
  const style = document.createElement('style');
  style.textContent = `
    .video-js { width: 100% !important; height: 100% !important; }
    .video-js video,
    .video-js .vjs-tech {
      max-width: none !important;
      max-height: none !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
    }
  `;
  document.head.appendChild(style);

  const Button = videojs.getComponent('Button') as any;
  const MenuButton = videojs.getComponent('MenuButton') as any;
  const MenuItem = videojs.getComponent('MenuItem') as any;

  // --- Skip Backward 10s ---
  class SkipBackwardButton extends Button {
    constructor(player: any, options: any) {
      super(player, options);
      this.controlText('Skip Back 10s');
      this.el().innerHTML = `
        <span class="vjs-icon-placeholder" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;position:relative;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11.5 2a10 10 0 1 1-7 3"/>
            <polyline points="11.5 2 5.5 2 5.5 8"/>
          </svg>
          <span style="position:absolute;font-size:8px;font-weight:700;top:50%;left:50%;transform:translate(-50%,-40%);">10</span>
        </span>`;
    }
    handleClick() {
      const ct = this.player().currentTime() || 0;
      this.player().currentTime(Math.max(0, ct - 10));
    }
    buildCSSClass() {
      return `vjs-skip-backward-button vjs-control vjs-button ${super.buildCSSClass()}`;
    }
  }

  // --- Skip Forward 10s ---
  class SkipForwardButton extends Button {
    constructor(player: any, options: any) {
      super(player, options);
      this.controlText('Skip Forward 10s');
      this.el().innerHTML = `
        <span class="vjs-icon-placeholder" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;position:relative;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.5 2a10 10 0 1 0 7 3"/>
            <polyline points="12.5 2 18.5 2 18.5 8"/>
          </svg>
          <span style="position:absolute;font-size:8px;font-weight:700;top:50%;left:50%;transform:translate(-50%,-40%);">10</span>
        </span>`;
    }
    handleClick() {
      const ct = this.player().currentTime() || 0;
      const dur = this.player().duration() || 0;
      this.player().currentTime(Math.min(dur, ct + 10));
    }
    buildCSSClass() {
      return `vjs-skip-forward-button vjs-control vjs-button ${super.buildCSSClass()}`;
    }
  }

  // --- Quality Menu Item ---
  class QualityMenuItem extends MenuItem {
    qualityLevel: any;
    constructor(player: any, options: any) {
      super(player, { ...options, selectable: true, multiSelectable: false });
      this.qualityLevel = options.qualityLevel;
      this.selected(options.selected || false);
    }
    handleClick() {
      const qualityLevels = (this.player() as any).qualityLevels?.() || [];
      const selectedHeight = this.qualityLevel?.height;

      for (let i = 0; i < qualityLevels.length; i++) {
        qualityLevels[i].enabled = selectedHeight === -1 || qualityLevels[i].height === selectedHeight;
      }

      const menu = this.parentComponent();
      if (menu) {
        for (const item of menu.children() || []) {
          if (item !== this && item.selected) item.selected(false);
        }
      }
      this.selected(true);

      const menuButton = this.parentComponent()?.parentComponent();
      if (menuButton?.updateLabel) {
        menuButton.updateLabel(selectedHeight === -1 ? 'Auto' : `${selectedHeight}p`, selectedHeight);
      }
    }
  }

  // --- Quality Menu Button ---
  class QualityMenuButton extends MenuButton {
    labelEl: HTMLElement | null;
    selectedHeight: number;

    constructor(player: any, options: any) {
      super(player, options);
      this.controlText('Quality');
      this.labelEl = null;
      this.selectedHeight = -1; // -1 = Auto

      const el = this.el();
      const label = document.createElement('span');
      label.className = 'vjs-quality-label';
      label.textContent = 'Auto';
      el.querySelector('.vjs-icon-placeholder')?.appendChild(label);
      this.labelEl = label;

      player.ready(() => {
        const ql = (player as any).qualityLevels?.();
        if (ql) ql.on('addqualitylevel', () => this.update());
      });
    }

    createItems() {
      const items: any[] = [];
      const ql = (this.player() as any).qualityLevels?.();
      if (!ql || ql.length === 0) return items;

      const heights = new Set<number>();
      for (let i = 0; i < ql.length; i++) {
        if (ql[i].height) heights.add(ql[i].height);
      }
      const sorted = Array.from(heights).sort((a, b) => b - a);

      items.push(new QualityMenuItem(this.player(), {
        label: 'Auto', qualityLevel: { height: -1 }, selected: this.selectedHeight === -1,
      }));

      for (const h of sorted) {
        const label = h >= 2160 ? '4K' : h >= 1440 ? '1440p' : `${h}p`;
        const badge = h >= 720 ? ' HD' : '';
        items.push(new QualityMenuItem(this.player(), {
          label: `${label}${badge}`, qualityLevel: { height: h }, selected: this.selectedHeight === h,
        }));
      }
      return items;
    }

    updateLabel(text: string, height: number) {
      this.selectedHeight = height;
      if (this.labelEl) this.labelEl.textContent = text;
    }

    buildCSSClass() {
      return `vjs-quality-menu-button vjs-menu-button ${super.buildCSSClass()}`;
    }
  }

  videojs.registerComponent('skipBackwardButton', SkipBackwardButton as any);
  videojs.registerComponent('skipForwardButton', SkipForwardButton as any);
  videojs.registerComponent('qualityMenuButton', QualityMenuButton as any);
}
