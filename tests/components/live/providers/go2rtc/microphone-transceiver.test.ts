import { describe, expect, it, vi } from 'vitest';
import {
  findMicrophoneTransceiver,
  replaceMicrophoneTrack,
  reserveMicrophoneTransceiver,
} from '../../../../../src/components/live/providers/go2rtc/microphone-transceiver';

const createAudioTrack = (): MediaStreamTrack =>
  ({ kind: 'audio' }) as MediaStreamTrack;

const createStream = (track: MediaStreamTrack): MediaStream =>
  ({ getAudioTracks: () => [track] }) as unknown as MediaStream;

const createTransceiver = (
  senderTrack: MediaStreamTrack | null,
  receiverKind = 'audio',
): RTCRtpTransceiver =>
  ({
    direction: 'sendonly',
    sender: {
      track: senderTrack,
      replaceTrack: vi.fn().mockResolvedValue(undefined),
    },
    receiver: { track: { kind: receiverKind } },
  }) as unknown as RTCRtpTransceiver;

describe('go2rtc microphone transceiver', () => {
  it('reserves a sendonly audio transceiver without a microphone stream', () => {
    const transceiver = createTransceiver(null);
    const addTransceiver = vi.fn().mockReturnValue(transceiver);
    const pc = { addTransceiver } as unknown as RTCPeerConnection;

    expect(reserveMicrophoneTransceiver(pc, null)).toBe(transceiver);
    expect(addTransceiver).toHaveBeenCalledWith('audio', { direction: 'sendonly' });
  });

  it('does not reserve a duplicate transceiver when a microphone track already exists', () => {
    const track = createAudioTrack();
    const addTransceiver = vi.fn();
    const pc = { addTransceiver } as unknown as RTCPeerConnection;

    expect(reserveMicrophoneTransceiver(pc, createStream(track))).toBeNull();
    expect(addTransceiver).not.toHaveBeenCalled();
  });

  it('finds the transceiver carrying the current microphone track', () => {
    const track = createAudioTrack();
    const transceiver = createTransceiver(track);
    const pc = {
      getTransceivers: () => [transceiver],
    } as unknown as RTCPeerConnection;

    expect(findMicrophoneTransceiver(pc, createStream(track))).toBe(transceiver);
  });

  it('finds a reserved audio transceiver before a real track is attached', () => {
    const transceiver = createTransceiver(null);
    const pc = {
      getTransceivers: () => [transceiver],
    } as unknown as RTCPeerConnection;

    expect(findMicrophoneTransceiver(pc, null)).toBe(transceiver);
  });

  it('hot attaches and detaches the microphone with replaceTrack', async () => {
    const track = createAudioTrack();
    const transceiver = createTransceiver(null);
    const replaceTrack = vi.mocked(transceiver.sender.replaceTrack);

    await replaceMicrophoneTrack(transceiver, createStream(track));
    expect(replaceTrack).toHaveBeenLastCalledWith(track);

    await replaceMicrophoneTrack(transceiver, null);
    expect(replaceTrack).toHaveBeenLastCalledWith(null);
  });
});
