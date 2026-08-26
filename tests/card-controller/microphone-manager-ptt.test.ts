import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { MicrophoneManager } from '../../src/card-controller/microphone-manager';
import { createCardAPI, createConfig } from '../test-utils';

const navigatorMock: Navigator = {
  ...mock<Navigator>(),
  mediaDevices: {
    ...mock<MediaDevices>(),
    getUserMedia: vi.fn(),
  },
};

const createMockStream = (): {
  stream: MediaStream;
  track: MediaStreamTrack;
} => {
  const stream = mock<MediaStream>();
  const track = mock<MediaStreamTrack>();
  track.enabled = true;
  stream.getTracks.mockImplementation(() => [track]);
  return { stream, track };
};

// @vitest-environment jsdom
describe('MicrophoneManager PTT disconnect timeout', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', navigatorMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  const createManager = (disconnectSeconds: number) => {
    const api = createCardAPI();
    const manager = new MicrophoneManager(api);
    const { stream, track } = createMockStream();

    vi.mocked(navigatorMock.mediaDevices.getUserMedia).mockResolvedValue(stream);
    vi.mocked(api.getConfigManager().getConfig).mockReturnValue(
      createConfig({
        live: {
          microphone: {
            always_connected: false,
            disconnect_seconds: disconnectSeconds,
          },
        },
      }),
    );

    return { manager, stream, track };
  };

  it('does not disconnect while PTT is held and disconnects after release', async () => {
    const disconnectSeconds = 3;
    const { manager, track } = createManager(disconnectSeconds);

    await manager.unmute();
    expect(manager.isConnected()).toBeTruthy();
    expect(manager.isMuted()).toBeFalsy();

    vi.advanceTimersByTime(disconnectSeconds * 3 * 1000);
    expect(manager.isConnected()).toBeTruthy();
    expect(track.stop).not.toHaveBeenCalled();

    manager.mute();
    vi.advanceTimersByTime(disconnectSeconds * 1000 - 1);
    expect(manager.isConnected()).toBeTruthy();

    vi.advanceTimersByTime(1);
    expect(manager.isConnected()).toBeFalsy();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('cancels an existing release timer when PTT is pressed again', async () => {
    const disconnectSeconds = 3;
    const { manager } = createManager(disconnectSeconds);

    await manager.unmute();
    manager.mute();

    vi.advanceTimersByTime(2000);
    await manager.unmute();

    vi.advanceTimersByTime(disconnectSeconds * 1000);
    expect(manager.isConnected()).toBeTruthy();
    expect(manager.isMuted()).toBeFalsy();
  });
});
