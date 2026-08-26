import { describe, expect, it } from 'vitest';
import { has2WayAudio } from '../../src/utils/audio';

const createPeerConnection = (
  transceiver: Partial<RTCRtpTransceiver>,
): RTCPeerConnection =>
  ({
    getTransceivers: () => [transceiver as RTCRtpTransceiver],
  }) as unknown as RTCPeerConnection;

describe('has2WayAudio reserved microphone transceiver', () => {
  it('detects negotiated outbound audio before a microphone track is attached', () => {
    const pc = createPeerConnection({
      direction: 'sendonly',
      currentDirection: 'sendonly',
      sender: { track: null } as RTCRtpSender,
      receiver: { track: { kind: 'audio' } } as RTCRtpReceiver,
    });

    expect(has2WayAudio(pc)).toBe(true);
  });

  it('does not report two-way audio if the remote endpoint rejected sending', () => {
    const pc = createPeerConnection({
      direction: 'sendonly',
      currentDirection: 'inactive',
      sender: { track: null } as RTCRtpSender,
      receiver: { track: { kind: 'audio' } } as RTCRtpReceiver,
    });

    expect(has2WayAudio(pc)).toBe(false);
  });
});
