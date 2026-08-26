export const reserveMicrophoneTransceiver = (
  pc: RTCPeerConnection,
  microphoneStream: MediaStream | null,
): RTCRtpTransceiver | null => {
  if (microphoneStream?.getAudioTracks().length) {
    return null;
  }

  return pc.addTransceiver('audio', { direction: 'sendonly' });
};

export const findMicrophoneTransceiver = (
  pc: RTCPeerConnection,
  microphoneStream: MediaStream | null,
): RTCRtpTransceiver | null => {
  const microphoneTrack = microphoneStream?.getAudioTracks()[0] ?? null;

  return (
    pc.getTransceivers().find((transceiver) => {
      if (transceiver.direction !== 'sendonly' && transceiver.direction !== 'sendrecv') {
        return false;
      }

      if (microphoneTrack) {
        return transceiver.sender.track === microphoneTrack;
      }

      return (
        transceiver.sender.track?.kind === 'audio' ||
        transceiver.receiver.track?.kind === 'audio'
      );
    }) ?? null
  );
};

export const replaceMicrophoneTrack = async (
  transceiver: RTCRtpTransceiver,
  microphoneStream: MediaStream | null,
): Promise<void> => {
  const microphoneTrack = microphoneStream?.getAudioTracks()[0] ?? null;
  await transceiver.sender.replaceTrack(microphoneTrack);
};
