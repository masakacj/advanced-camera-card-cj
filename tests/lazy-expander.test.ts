import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeAssistant, LovelaceCard, LovelaceCardConfig } from '../src/ha/types';
import '../src/lazy-expander';

// @vitest-environment jsdom

type LazyExpanderElement = HTMLElement & {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig & { cards: LovelaceCardConfig[] }): void;
  updateComplete: Promise<boolean>;
};

describe('AdvancedCameraCardLazyExpander', () => {
  const createCardElement = vi.fn((config: LovelaceCardConfig) => {
    const card = document.createElement('div') as LovelaceCard;
    card.dataset.type = config.type;
    card.getCardSize = () => 1;
    card.setConfig = () => undefined;
    return card;
  });

  beforeEach(() => {
    createCardElement.mockClear();
    Object.assign(window, {
      loadCardHelpers: vi.fn(async () => ({ createCardElement })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    delete (window as Window & { loadCardHelpers?: unknown }).loadCardHelpers;
  });

  const createExpander = async (): Promise<LazyExpanderElement> => {
    const element = document.createElement(
      'advanced-camera-card-lazy-expander',
    ) as LazyExpanderElement;
    element.setConfig({
      type: 'custom:advanced-camera-card-lazy-expander',
      title: '显示其他监控',
      cards: [{ type: 'custom:advanced-camera-card' }],
    });
    element.hass = {} as HomeAssistant;
    document.body.append(element);
    await element.updateComplete;
    return element;
  };

  it('does not create child cards while collapsed', async () => {
    await createExpander();
    await Promise.resolve();

    expect(createCardElement).not.toHaveBeenCalled();
  });

  it('creates children on expand and disconnects them after collapse', async () => {
    vi.useFakeTimers();
    const element = await createExpander();
    const button = element.shadowRoot?.querySelector('button');
    expect(button).toBeTruthy();

    button?.click();
    await element.updateComplete;
    await Promise.resolve();
    await Promise.resolve();

    expect(createCardElement).toHaveBeenCalledTimes(1);
    const child = element.shadowRoot?.querySelector('.children > div');
    expect(child?.isConnected).toBe(true);

    button?.click();
    vi.advanceTimersByTime(300);
    await element.updateComplete;

    expect(child?.isConnected).toBe(false);
  });
});
