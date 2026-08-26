// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedCameraCardPTT } from '../src/ptt';
import {
  AdvancedCameraCardPTTTransportTarget,
  registerPTTTarget,
  unregisterPTTTarget,
} from '../src/ptt-registry';

const CARD_ID = 'front-door';

describe('AdvancedCameraCardPTT', () => {
  let card: AdvancedCameraCardPTT;
  let target: AdvancedCameraCardPTTTransportTarget;
  let active = false;

  beforeEach(async () => {
    active = false;
    target = {
      pttStart: vi.fn(async () => {
        active = true;
      }),
      pttStop: vi.fn(() => {
        active = false;
      }),
      isPTTAvailable: vi.fn(() => true),
      isPTTActive: vi.fn(() => active),
      isForbidden: vi.fn(() => false),
      bindSender: vi.fn(),
      unbindSender: vi.fn(),
    };
    registerPTTTarget(CARD_ID, target);

    // Instantiate the exported class directly so the import is a runtime value
    // (and cannot be elided as a type-only import before the custom element is
    // registered by its decorator).
    card = new AdvancedCameraCardPTT();
    card.setConfig({
      type: 'custom:advanced-camera-card-ptt',
      target: CARD_ID,
    });
    document.body.append(card);
    await card.updateComplete;
  });

  afterEach(() => {
    card.remove();
    unregisterPTTTarget(CARD_ID, target);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    vi.restoreAllMocks();
  });

  const press = async (): Promise<HTMLButtonElement> => {
    const button = card.shadowRoot?.querySelector('button');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('PTT button was not rendered');
    }

    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerType: { value: 'touch' },
      pointerId: { value: 1 },
      button: { value: 0 },
    });
    button.dispatchEvent(event);
    await Promise.resolve();

    expect(target.pttStart).toHaveBeenCalled();
    expect(active).toBe(true);
    return button;
  };

  it.each(['pointerup', 'pointercancel', 'lostpointercapture'])(
    'stops talking on %s',
    async (eventName) => {
      const button = await press();
      target.pttStop = vi.fn(() => {
        active = false;
      });

      const event = new Event(eventName, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      button.dispatchEvent(event);

      expect(target.pttStop).toHaveBeenCalled();
      expect(active).toBe(false);
    },
  );

  it('stops talking when the browser window loses focus', async () => {
    await press();
    target.pttStop = vi.fn(() => {
      active = false;
    });

    window.dispatchEvent(new Event('blur'));

    expect(target.pttStop).toHaveBeenCalled();
    expect(active).toBe(false);
  });

  it('stops talking when the app/document becomes hidden', async () => {
    await press();
    target.pttStop = vi.fn(() => {
      active = false;
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(target.pttStop).toHaveBeenCalled();
    expect(active).toBe(false);
  });

  it('stops talking when the PTT card leaves the DOM', async () => {
    await press();
    target.pttStop = vi.fn(() => {
      active = false;
    });

    card.remove();

    expect(target.pttStop).toHaveBeenCalled();
    expect(active).toBe(false);
  });
});
