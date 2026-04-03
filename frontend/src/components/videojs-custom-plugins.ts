/**
 * Custom Video.js components: Skip buttons + Quality selector menu
 * Also injects CSS overrides that MUST load after Video.js + Tailwind.
 */
import videojs from 'video.js';

let registered = false;

/**
 * Force the <video> element inside a Video.js player to fill its container.
 * Uses direct DOM query (not player.tech()) to find the video element.
 * Retries up to 10 times with 200ms intervals to handle async HLS tech creation.
 */
export function forceVideoFill(playerEl: Element, isPortraitCb?: (portrait: boolean) => void) {
  let attempts = 0;
  const apply = () => {
    const video = playerEl.querySelector('video') as HTMLVideoElement | null;
    if (!video) {
      if (attempts++ < 10) setTimeout(apply, 200);
      return;
    }
    video.style.setProperty('width', '100%', 'important');
    video.style.setProperty('height', '100%', 'important');
    video.style.setProperty('max-width', 'none', 'important');
    video.style.setProperty('max-height', 'none', 'important');
    video.style.setProperty('position', 'absolute', 'important');
    video.style.setProperty('top', '0', 'important');
    video.style.setProperty('left', '0', 'important');
    video.style.setProperty('object-fit', 'contain', 'important');

    // Check portrait once dimensions are available
    const checkDimensions = () => {
      if (video.videoWidth > 0) {
        const portrait = video.videoHeight > video.videoWidth;
        video.style.setProperty('object-fit', portrait ? 'cover' : 'contain', 'important');
        if (isPortraitCb) isPortraitCb(portrait);
      }
    };
    video.addEventListener('loadedmetadata', checkDimensions);
    video.addEventListener('loadeddata', checkDimensions);
    video.addEventListener('playing', checkDimensions);
    // Also check immediately in case already loaded
    checkDimensions();
  };
  apply();
}

export function registerCustomComponents() {
  if (registered) return;
  registered = true;

  // --- Inject CSS override via <style> tag (loads LAST, wins specificity) ---
  const style = document.createElement('style');
  style.textContent = `
    /* Target both <video-js> tag and .video-js class */
    .video-js, video-js {
      width: 100% !important;
      height: 100% !important;
    }
    /* Target every possible way the <video> tech element can be selected */
    .video-js video,
    .video-js .vjs-tech,
    video-js video,
    video-js .vjs-tech,
    video-js > video,
    .video-js > video,
    [data-vjs-player] video,
    [data-vjs-player] .vjs-tech {
      max-width: none !important;
      max-height: none !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
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
      const player = this.player() as any;
      const qualityLevels = player.qualityLevels?.() || [];
      const selectedHeight = this.qualityLevel?.height;

      // Enable/disable quality levels in VHS
      for (let i = 0; i < qualityLevels.length; i++) {
        qualityLevels[i].enabled = selectedHeight === -1 || qualityLevels[i].height === selectedHeight;
      }

      // Store selection on the player and fire event so MenuButton can update
      player._selectedQualityHeight = selectedHeight;
      player.trigger('qualityselected');
    }
  }

  // --- Quality Menu Button ---
  class QualityMenuButton extends MenuButton {
    labelEl: HTMLElement | null;

    constructor(player: any, options: any) {
      super(player, options);
      this.controlText('Quality');
      this.labelEl = null;

      const el = this.el();
      const label = document.createElement('span');
      label.className = 'vjs-quality-label';
      label.textContent = 'Auto';
      el.querySelector('.vjs-icon-placeholder')?.appendChild(label);
      this.labelEl = label;

      // Initialize stored selection
      if ((player as any)._selectedQualityHeight === undefined) {
        (player as any)._selectedQualityHeight = -1;
      }

      // Listen for quality selection changes
      player.on('qualityselected', () => {
        const h = (player as any)._selectedQualityHeight;
        const text = h === -1 ? 'Auto' : (h >= 2160 ? '4K' : h >= 1440 ? '1440p' : `${h}p`);
        if (this.labelEl) this.labelEl.textContent = text;
        this.update(); // rebuild menu to update checkmarks
      });

      player.ready(() => {
        const ql = (player as any).qualityLevels?.();
        if (ql) ql.on('addqualitylevel', () => this.update());
      });
    }

    createItems() {
      const items: any[] = [];
      const ql = (this.player() as any).qualityLevels?.();
      if (!ql || ql.length === 0) return items;

      const selectedHeight = (this.player() as any)._selectedQualityHeight ?? -1;

      const heights = new Set<number>();
      for (let i = 0; i < ql.length; i++) {
        if (ql[i].height) heights.add(ql[i].height);
      }
      const sorted = Array.from(heights).sort((a, b) => b - a);

      items.push(new QualityMenuItem(this.player(), {
        label: 'Auto', qualityLevel: { height: -1 }, selected: selectedHeight === -1,
      }));

      for (const h of sorted) {
        const label = h >= 2160 ? '4K' : h >= 1440 ? '1440p' : `${h}p`;
        const badge = h >= 720 ? ' HD' : '';
        items.push(new QualityMenuItem(this.player(), {
          label: `${label}${badge}`, qualityLevel: { height: h }, selected: selectedHeight === h,
        }));
      }
      return items;
    }

    buildCSSClass() {
      return `vjs-quality-menu-button vjs-menu-button ${super.buildCSSClass()}`;
    }
  }

  videojs.registerComponent('skipBackwardButton', SkipBackwardButton as any);
  videojs.registerComponent('skipForwardButton', SkipForwardButton as any);
  videojs.registerComponent('qualityMenuButton', QualityMenuButton as any);
}
