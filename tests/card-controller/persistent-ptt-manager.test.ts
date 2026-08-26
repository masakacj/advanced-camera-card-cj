import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistentPTTManager } from '../../src/card-controller/persistent-ptt-manager';
import { CardHTMLElement } from '../../src/card-controller/card-element-manager';
import {
  getPTTTarget,
  registerPTTSender,
  unregisterPTTSender,
} from '../../src/ptt-registry';
import { createCardAPI, createConfig } from '../test-utils';

const CARD_ID = 'front-door';

const createMicrophone = (): {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: ReturnType<typeof vi.fn>;
} => {
  const stop = vi.fn();
  const track = {
    kind: 'audio',
    enabled: false,
    stop,
  } as unknown as MediaStreamTrack;
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track, stop };
};

const createSender = (): RTCRtpSender => {
  const sender = {
    track: null as MediaStreamTrack | null,
    replaceTrack: vi.fn(async (track: MediaStreamTrack | null) => {
      sender.track = track;
    }),
  };
  return sender as unknown as RTCRtpSender;
};

// @vitest-environment jsdom
describe('PersistentPTTManager', () => {
  const getUserMedia = vi.fn();
  let manager: PersistentPTTManager | undefined;
  let sender: RTCRtpSender | undefined;
  let element: HTMLElement | undefined;

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
      },
    } as unknown as Navigator);
    getUserMedia.mockReset();
  });

  afterEach(() => {
    manager?.destroy();
    if (sender) {
      unregisterPTTSender(CARD_ID, sender);
    }
    element?.remove();
    manager = undefined;
    sender = undefined;
    element = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const createManager = (): PersistentPTTManager => {
    const api = createCardAPI();
    element = document.createElement('div');
    document.body.append(element);
    api.getCardElementManager().getElement.mockReturnValue(
      element as unknown as CardHTMLElement,
    );
    api.getConfigManager().getConfig.mockReturnValue(
      createConfig({ card_id: CARD_ID }),
    );

    manager = new PersistentPTTManager(api);
    manager.initialize();
    return manager;
  };

  const bindSender = (): RTCRtpSender => {
    sender = createSender();
    registerPTTSender(CARD_ID, sender);
    return sender;
  };

  it('does not request a physical microphone when the card or sender initializes', () => {
    const ptt = createManager();
    const pttSender = bindSender();

    expect(getPTTTarget(CARD_ID)).toBe(ptt);
    expect(ptt.isPTTAvailable()).toBe(true);
    expect(pttSender.track).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('attaches once, toggles enabled on later PTT presses, and keeps the track alive', async () => {
    const ptt = createManager();
    const pttSender = bindSender();
    const microphone = createMicrophone();
    getUserMedia.mockResolvedValue(microphone.stream);

    await ptt.pttStart();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(pttSender.replaceTrack).toHaveBeenCalledTimes(1);
    expect(pttSender.replaceTrack).toHaveBeenLastCalledWith(microphone.track);
    expect(microphone.track.enabled).toBe(true);
    expect(ptt.isPTTActive()).toBe(true);

    ptt.pttStop();

    expect(microphone.track.enabled).toBe(false);
    expect(microphone.stop).not.toHaveBeenCalled();
    expect(pttSender.replaceTrack).toHaveBeenCalledTimes(1);

    await ptt.pttStart();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(pttSender.replaceTrack).toHaveBeenCalledTimes(1);
    expect(microphone.track.enabled).toBe(true);
    expect(ptt.isPTTActive()).toBe(true);
  });

  it('fails closed if PTT is released while the first permission request is pending', async () => {
    const ptt = createManager();
    const pttSender = bindSender();
    const microphone = createMicrophone();
    let resolveMicrophone!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        resolveMicrophone = resolve;
      }),
    );

    const start = ptt.pttStart();
    ptt.pttStop();
    resolveMicrophone(microphone.stream);
    await start;

    expect(pttSender.replaceTrack).toHaveBeenCalledTimes(1);
    expect(microphone.track.enabled).toBe(false);
    expect(ptt.isPTTActive()).toBe(false);
    expect(microphone.stop).not.toHaveBeenCalled();
  });

  it('does not request microphone access when no pre-negotiated sender exists', async () => {
    const ptt = createManager();

    expect(ptt.isPTTAvailable()).toBe(false);
    await ptt.pttStart();

    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('reuses a cached microphone track if the provider creates a new transport', async () => {
    const ptt = createManager();
    const firstSender = bindSender();
    const microphone = createMicrophone();
    getUserMedia.mockResolvedValue(microphone.stream);

    await ptt.pttStart();
    ptt.pttStop();

    const secondSender = createSender();
    registerPTTSender(CARD_ID, secondSender);
    await Promise.resolve();

    expect(microphone.track.enabled).toBe(false);
    expect(secondSender.replaceTrack).toHaveBeenCalledWith(microphone.track);
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    unregisterPTTSender(CARD_ID, secondSender);
    sender = firstSender;
  });

  it('releases the physical microphone only when the card manager is destroyed', async () => {
    const ptt = createManager();
    const pttSender = bindSender();
    const microphone = createMicrophone();
    getUserMedia.mockResolvedValue(microphone.stream);

    await ptt.pttStart();
    ptt.destroy();
    await Promise.resolve();

    expect(microphone.track.enabled).toBe(false);
    expect(microphone.stop).toHaveBeenCalledTimes(1);
    expect(pttSender.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(getPTTTarget(CARD_ID)).toBeUndefined();
  });
});
