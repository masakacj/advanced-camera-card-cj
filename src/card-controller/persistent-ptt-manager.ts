import {
  AdvancedCameraCardPTTTransportTarget,
  notifyPTTTargetStateChanged,
  registerPTTTarget,
  unregisterPTTTarget,
} from '../ptt-registry.js';
import { errorToConsole } from '../utils/basic.js';
import { CardMicrophoneAPI } from './types.js';

/**
 * Dedicated microphone lifecycle for the standalone CJ PTT card.
 *
 * The go2rtc provider negotiates an empty outbound audio transceiver when the
 * PeerConnection is first created. This manager only owns the physical
 * microphone track that is later attached to that already-negotiated sender.
 * PTT actions therefore never reconnect WebRTC or renegotiate SDP.
 */
export class PersistentPTTManager implements AdvancedCameraCardPTTTransportTarget {
  protected _api: CardMicrophoneAPI;
  protected _cardID?: string;
  protected _sender?: RTCRtpSender;
  protected _stream?: MediaStream;
  protected _track?: MediaStreamTrack;
  protected _startPromise?: Promise<void>;
  protected _desiredActive = false;
  protected _forbidden = false;
  protected _destroyed = false;
  protected _generation = 0;

  constructor(api: CardMicrophoneAPI) {
    this._api = api;
  }

  public initialize(): void {
    this._destroyed = false;
    this.refreshRegistration(true);
  }

  public refreshRegistration(force = false): void {
    if (this._destroyed) {
      return;
    }

    const cardID = this._api.getConfigManager().getConfig()?.card_id;
    if (cardID === this._cardID) {
      if (force && cardID) {
        registerPTTTarget(cardID, this);
      }
      return;
    }

    if (this._cardID) {
      unregisterPTTTarget(this._cardID, this);
    }

    this._cardID = cardID;
    if (cardID) {
      registerPTTTarget(cardID, this);
    }
  }

  public isSupported(): boolean {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  public isForbidden(): boolean {
    return this._forbidden;
  }

  public isPTTAvailable(): boolean {
    return (
      !this._destroyed &&
      !this._forbidden &&
      this.isSupported() &&
      !!this._sender &&
      this._api.getCardElementManager().getElement().isConnected &&
      this._api.getConfigManager().getConfig()?.card_id === this._cardID
    );
  }

  public isPTTActive(): boolean {
    return !!(this._desiredActive && this._sender && this._track && this._track.enabled);
  }

  public bindSender(sender: RTCRtpSender): void {
    if (this._destroyed || this._sender === sender) {
      return;
    }

    // A transport replacement is not caused by PTT (for example a network
    // reconnect or selected-camera change). Fail closed while the new transport
    // is bound, then reuse the already-acquired microphone track if there is one.
    this.pttStop();
    this._sender = sender;

    if (!this._track) {
      return;
    }

    const track = this._track;
    const generation = this._generation;
    void sender
      .replaceTrack(track)
      .then(() => {
        if (
          this._destroyed ||
          generation !== this._generation ||
          this._sender !== sender ||
          this._track !== track
        ) {
          return;
        }
        track.enabled = this._desiredActive;
        this._notifyStateChanged();
      })
      .catch((e: unknown) => {
        errorToConsole(e as Error);
        if (this._sender === sender) {
          this._sender = undefined;
          this._notifyStateChanged();
        }
      });
  }

  public unbindSender(sender: RTCRtpSender): void {
    if (this._sender !== sender) {
      return;
    }

    this.pttStop();
    this._sender = undefined;
    this._notifyStateChanged();
  }

  public async pttStart(): Promise<void> {
    if (!this.isSupported() || this._forbidden || this._destroyed) {
      return;
    }

    const sender = this._sender;
    if (!sender) {
      return;
    }

    this._desiredActive = true;

    if (this._track) {
      const track = this._track;

      // Under normal standalone-PTT operation the sender still owns this track,
      // so every press after the first is only an enabled=true toggle. If some
      // other microphone control replaced the sender track, reclaim it without
      // renegotiating the PeerConnection.
      if (sender.track !== track) {
        track.enabled = false;
        try {
          await sender.replaceTrack(track);
        } catch (e: unknown) {
          errorToConsole(e as Error);
          this._desiredActive = false;
          this._notifyStateChanged();
          return;
        }
      }

      if (this._desiredActive && this._sender === sender && this._track === track) {
        track.enabled = true;
      }
      this._notifyStateChanged();
      return;
    }

    if (!this._startPromise) {
      this._startPromise = this._acquireAndAttachMicrophone(sender).finally(() => {
        this._startPromise = undefined;
      });
    }

    await this._startPromise;
  }

  public pttStop(): void {
    this._desiredActive = false;
    if (this._track) {
      // Deliberately keep the physical microphone track alive for this card
      // session. A subsequent PTT press is then an instantaneous enabled toggle.
      this._track.enabled = false;
    }
    this._notifyStateChanged();
  }

  protected async _acquireAndAttachMicrophone(sender: RTCRtpSender): Promise<void> {
    const generation = this._generation;
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (e: unknown) {
      errorToConsole(e as Error);
      if (!this._destroyed && generation === this._generation) {
        this._forbidden = true;
        this._desiredActive = false;
        this._notifyStateChanged();
      }
      return;
    }

    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      this._desiredActive = false;
      this._notifyStateChanged();
      return;
    }

    // Never let a newly acquired microphone transmit before replaceTrack() has
    // completed and the initiating PTT press is still active.
    track.enabled = false;

    if (this._destroyed || generation !== this._generation || this._sender !== sender) {
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      return;
    }

    try {
      await sender.replaceTrack(track);
    } catch (e: unknown) {
      errorToConsole(e as Error);
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      this._desiredActive = false;
      this._notifyStateChanged();
      return;
    }

    if (this._destroyed || generation !== this._generation || this._sender !== sender) {
      track.enabled = false;
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      void sender.replaceTrack(null).catch(() => undefined);
      return;
    }

    this._stream = stream;
    this._track = track;
    track.enabled = this._desiredActive;
    this._notifyStateChanged();
  }

  public destroy(): void {
    const sender = this._sender;
    const stream = this._stream;
    const cardID = this._cardID;

    this._generation++;
    this._destroyed = true;
    this._desiredActive = false;
    if (this._track) {
      this._track.enabled = false;
    }

    if (cardID) {
      unregisterPTTTarget(cardID, this);
    }

    this._cardID = undefined;
    this._sender = undefined;
    this._stream = undefined;
    this._track = undefined;
    this._forbidden = false;

    stream?.getTracks().forEach((track) => track.stop());

    // Best-effort detach from the sender before the provider closes its
    // PeerConnection. The normal provider lifecycle remains responsible for
    // closing the PeerConnection and video element.
    if (sender) {
      void sender.replaceTrack(null).catch(() => undefined);
    }
  }

  protected _notifyStateChanged(): void {
    if (this._cardID) {
      notifyPTTTargetStateChanged(this._cardID, this);
    }
  }
}
