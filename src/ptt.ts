import { CSSResultGroup, LitElement, TemplateResult, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { REPO_URL } from './const.js';
import { HomeAssistant } from './ha/types.js';
import { getPTTTarget, subscribePTTTargets } from './ptt-registry.js';

interface AdvancedCameraCardPTTConfig {
  type: string;
  target: string;
  name?: string;
  icon?: string;
  active_icon?: string;
}

interface CustomCardMetadata {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
  documentationURL?: string;
}

type CustomCardsWindow = Window & {
  customCards?: CustomCardMetadata[];
};

if (typeof window !== 'undefined') {
  const customCardsWindow = window as CustomCardsWindow;
  customCardsWindow.customCards ??= [];

  if (
    !customCardsWindow.customCards.some(
      (card) => card.type === 'advanced-camera-card-ptt',
    )
  ) {
    customCardsWindow.customCards.push({
      type: 'advanced-camera-card-ptt',
      name: 'Advanced Camera Card PTT',
      description: 'Push-to-talk control for an existing Advanced Camera Card',
      preview: true,
      documentationURL: REPO_URL,
    });
  }
}

@customElement('advanced-camera-card-ptt')
export class AdvancedCameraCardPTT extends LitElement {
  @property({ attribute: false })
  public hass?: HomeAssistant;

  @state()
  protected _pressed = false;

  protected _config?: AdvancedCameraCardPTTConfig;
  protected _unsubscribeTargets?: () => void;

  public setConfig(config: AdvancedCameraCardPTTConfig): void {
    if (!config?.target || typeof config.target !== 'string') {
      throw new Error('Advanced Camera Card PTT requires a target card_id');
    }

    this._config = config;
    this.requestUpdate();
  }

  public getCardSize(): number {
    return 1;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribeTargets = subscribePTTTargets(() => this.requestUpdate());
  }

  public disconnectedCallback(): void {
    this._stopTalking();
    this._unsubscribeTargets?.();
    this._unsubscribeTargets = undefined;
    super.disconnectedCallback();
  }

  protected _getAvailableTarget() {
    if (!this._config) {
      return undefined;
    }

    const target = getPTTTarget(this._config.target);
    return target?.isAvailable() && target.isSupported() && !target.isForbidden()
      ? target
      : undefined;
  }

  protected async _startTalking(): Promise<void> {
    if (this._pressed) {
      return;
    }

    const target = this._getAvailableTarget();
    if (!target) {
      return;
    }

    this._pressed = true;
    this.requestUpdate();

    await target.unmute();

    if (target.isForbidden()) {
      this._pressed = false;
    }
    this.requestUpdate();
  }

  protected _stopTalking(): void {
    if (!this._pressed || !this._config) {
      return;
    }

    getPTTTarget(this._config.target)?.mute();
    this._pressed = false;
    this.requestUpdate();
  }

  protected _handlePointerDown(ev: PointerEvent): void {
    if (ev.pointerType === 'mouse' && ev.button !== 0) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    void this._startTalking();
  }

  protected _handlePointerUp(ev: PointerEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this._stopTalking();
  }

  protected _handleKeyDown(ev: KeyboardEvent): void {
    if ((ev.key !== ' ' && ev.key !== 'Enter') || ev.repeat) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    void this._startTalking();
  }

  protected _handleKeyUp(ev: KeyboardEvent): void {
    if (ev.key !== ' ' && ev.key !== 'Enter') {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    this._stopTalking();
  }

  protected render(): TemplateResult | void {
    if (!this._config) {
      return;
    }

    const target = getPTTTarget(this._config.target);
    const available = !!(
      target?.isAvailable() &&
      target.isSupported() &&
      !target.isForbidden()
    );
    const name = this._config.name ?? 'Talk';
    const title = !target?.isAvailable()
      ? `Target ACC "${this._config.target}" is not available`
      : available
        ? name
        : 'Microphone is unavailable';

    return html`<ha-card title=${title}>
      <button
        class=${this._pressed ? 'active' : ''}
        type="button"
        ?disabled=${!available}
        aria-label=${name}
        aria-pressed=${this._pressed ? 'true' : 'false'}
        title=${title}
        @pointerdown=${this._handlePointerDown}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerUp}
        @lostpointercapture=${() => this._stopTalking()}
        @keydown=${this._handleKeyDown}
        @keyup=${this._handleKeyUp}
        @blur=${() => this._stopTalking()}
        @contextmenu=${(ev: Event) => ev.preventDefault()}
      >
        <ha-icon
          .icon=${this._pressed
            ? (this._config.active_icon ?? 'mdi:microphone')
            : (this._config.icon ?? 'mdi:microphone-off')}
        ></ha-icon>
        <span>${name}</span>
      </button>
    </ha-card>`;
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: block;
      }

      ha-card {
        overflow: hidden;
      }

      button {
        box-sizing: border-box;
        width: 100%;
        min-height: 52px;
        padding: 8px 14px;
        border: 0;
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--ha-card-background, var(--card-background-color));
        color: var(--primary-text-color);
        cursor: pointer;
        touch-action: none;
        user-select: none;

        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;

        font: inherit;
        font-weight: 500;
      }

      button.active {
        background: var(--error-color);
        color: white;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      ha-icon {
        width: 24px;
        height: 24px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'advanced-camera-card-ptt': AdvancedCameraCardPTT;
  }
}
