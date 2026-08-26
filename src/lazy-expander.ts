import { CSSResultGroup, LitElement, TemplateResult, css, html } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCard, LovelaceCardConfig } from './ha/types.js';

interface AdvancedCameraCardLazyExpanderConfig extends LovelaceCardConfig {
  cards: LovelaceCardConfig[];
  title?: string;
  expanded?: boolean;
}

interface LovelaceCardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

interface CustomCardMetadata {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
}

type HomeAssistantWindow = Window & {
  customCards?: CustomCardMetadata[];
  loadCardHelpers?: () => Promise<LovelaceCardHelpers>;
};

const COLLAPSE_ANIMATION_MS = 300;

if (typeof window !== 'undefined') {
  const haWindow = window as HomeAssistantWindow;
  haWindow.customCards ??= [];

  if (
    !haWindow.customCards.some(
      (card) => card.type === 'advanced-camera-card-lazy-expander',
    )
  ) {
    haWindow.customCards.push({
      type: 'advanced-camera-card-lazy-expander',
      name: 'Advanced Camera Card CJ Lazy Expander',
      description: 'Lazy-mount child cards only while the expander is open',
      preview: true,
    });
  }
}

@customElement('advanced-camera-card-lazy-expander')
export class AdvancedCameraCardLazyExpander extends LitElement {
  @property({ attribute: false })
  public hass?: HomeAssistant;

  @state()
  protected _expanded = false;

  @state()
  protected _renderChildren = false;

  @query('.children')
  protected _childrenContainer?: HTMLElement;

  protected _config?: AdvancedCameraCardLazyExpanderConfig;
  protected _childCards: LovelaceCard[] = [];
  protected _collapseTimer?: number;
  protected _mountEpoch = 0;

  public setConfig(config: AdvancedCameraCardLazyExpanderConfig): void {
    if (!Array.isArray(config?.cards)) {
      throw new Error('Advanced Camera Card CJ Lazy Expander requires cards');
    }

    this._cancelCollapseTimer();
    this._mountEpoch++;
    this._clearChildren();
    this._config = config;
    this._expanded = config.expanded ?? false;
    this._renderChildren = this._expanded;
    this.requestUpdate();
  }

  public getCardSize(): number {
    return 1;
  }

  public disconnectedCallback(): void {
    this._cancelCollapseTimer();
    this._mountEpoch++;
    this._clearChildren();
    super.disconnectedCallback();
  }

  protected updated(): void {
    this._propagateHass();
    if (this._renderChildren) {
      void this._mountChildren();
    }
  }

  protected _cancelCollapseTimer(): void {
    if (this._collapseTimer !== undefined) {
      window.clearTimeout(this._collapseTimer);
      this._collapseTimer = undefined;
    }
  }

  protected _clearChildren(): void {
    this._childrenContainer?.replaceChildren();
    this._childCards = [];
  }

  protected _propagateHass(): void {
    if (!this.hass) {
      return;
    }
    for (const card of this._childCards) {
      card.hass = this.hass;
    }
  }

  protected async _mountChildren(): Promise<void> {
    if (
      !this._renderChildren ||
      !this._config ||
      !this.hass ||
      !this._childrenContainer ||
      this._childCards.length
    ) {
      return;
    }

    const haWindow = window as HomeAssistantWindow;
    if (!haWindow.loadCardHelpers) {
      return;
    }

    const epoch = ++this._mountEpoch;
    const container = this._childrenContainer;
    const helpers = await haWindow.loadCardHelpers();

    if (
      epoch !== this._mountEpoch ||
      !this._renderChildren ||
      !container.isConnected
    ) {
      return;
    }

    const childCards = this._config.cards.map((config) => {
      const card = helpers.createCardElement(config);
      card.hass = this.hass;
      return card;
    });

    container.replaceChildren(...childCards);
    this._childCards = childCards;
  }

  protected _toggleExpanded(): void {
    this._cancelCollapseTimer();

    if (this._expanded) {
      this._expanded = false;
      this._collapseTimer = window.setTimeout(() => {
        if (this._expanded) {
          return;
        }
        this._mountEpoch++;
        this._clearChildren();
        this._renderChildren = false;
        this._collapseTimer = undefined;
      }, COLLAPSE_ANIMATION_MS);
      return;
    }

    this._renderChildren = true;
    this._expanded = true;
  }

  protected render(): TemplateResult | void {
    if (!this._config) {
      return;
    }

    const title = this._config.title ?? 'Expand';

    return html`<ha-card>
      <button
        type="button"
        aria-expanded=${this._expanded ? 'true' : 'false'}
        @click=${this._toggleExpanded}
      >
        <ha-icon
          class=${this._expanded ? 'chevron expanded' : 'chevron'}
          icon="mdi:chevron-down"
        ></ha-icon>
        <span>${title}</span>
      </button>
      <div class=${this._expanded ? 'content expanded' : 'content'}>
        <div class="content-inner">
          ${this._renderChildren ? html`<div class="children"></div>` : ''}
        </div>
      </div>
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
        min-height: 48px;
        padding: 8px 12px;
        border: 0;
        background: transparent;
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        font: inherit;
        text-align: left;
      }

      .chevron {
        width: 20px;
        height: 20px;
        transition: transform ${COLLAPSE_ANIMATION_MS}ms ease;
      }

      .chevron.expanded {
        transform: rotate(180deg);
      }

      .content {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows ${COLLAPSE_ANIMATION_MS}ms ease;
      }

      .content.expanded {
        grid-template-rows: 1fr;
      }

      .content-inner {
        min-height: 0;
        overflow: hidden;
      }

      .children {
        display: grid;
        gap: 8px;
        padding: 0 8px 8px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'advanced-camera-card-lazy-expander': AdvancedCameraCardLazyExpander;
  }
}
