import { registerPTTTarget, unregisterPTTTarget } from '../ptt-registry';
import { errorToConsole } from '../utils/basic';
import { Timer } from '../utils/timer';
import { CardMicrophoneAPI, MicrophoneState } from './types';

export class MicrophoneManager {
  protected _api: CardMicrophoneAPI;
  protected _stream?: MediaStream | null;
  protected _timer = new Timer();
  protected _pttCardID?: string;

  protected _state: MicrophoneState = {
    connected: false,
    muted: true,
    forbidden: false,
  };

  // We keep desired mute state separate from the overall state so that
  // mute/unmute can be expressed before the stream is even created -- and when
  // it's created it will have the right mute status.
  protected _desireMute = true;

  constructor(api: CardMicrophoneAPI) {
    this._api = api;
  }

  public getState(): MicrophoneState {
    return this._state;
  }

  public initialize(): void {
    this.refreshPTTRegistration(true);
    this._setState();
  }

  public refreshPTTRegistration(force = false): void {
    const cardID = this._api.getConfigManager().getConfig()?.card_id;
    if (cardID === this._pttCardID) {
      if (force && cardID) {
        registerPTTTarget(cardID, this);
      }
      return;
    }

    if (this._pttCardID) {
      unregisterPTTTarget(this._pttCardID, this);
    }

    this._pttCardID = cardID;
    if (cardID) {
      registerPTTTarget(cardID, this);
    }
  }

  public isAvailable(): boolean {
    return (
      this._api.getCardElementManager().getElement().isConnected &&
      this._api.getConfigManager().getConfig()?.card_id === this._pttCardID
    );
  }

  public shouldConnectOnInitialization(): boolean {
    // Microphone access in this fork is intentionally user-initiated. The
    // always_connected option still controls the lifetime of a stream after
    // the user explicitly enables two-way audio, but it must never cause a
    // microphone permission request or capture merely by opening the card.
    return false;
  }

  public isSupported(): boolean {
    // Some browsers will have mediaDevices/getUserMedia as undefined if
    // accessed over http.
    // See: https://github.com/dermotduffy/advanced-camera-card/issues/1543
    return !!navigator.mediaDevices?.getUserMedia;
  }

  public async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (e: unknown) {
      errorToConsole(e as Error);

      this._stream = null;
      this._setState();
      return false;
    }
    this._setDesiredMuteOnStream();
    this._setState();
    return true;
  }

  public disconnect(): void {
    this._timer.stop();
    this._desireMute = true;
    this._stream?.getTracks().forEach((track) => track.stop());

    this._stream = undefined;
    this._setState();
  }

  public getStream(): MediaStream | undefined {
    return this._stream ?? undefined;
  }

  public mute(): void {
    this._desireMute = true;
    this._setDesiredMuteOnStream();
    this._setState();
  }

  public async unmute(): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    this._desireMute = false;

    if (!this.isConnected() && !this.isForbidden()) {
      // Connecting will automatically set the desired mute.
      await this.connect();
    } else if (this.isConnected()) {
      this._setDesiredMuteOnStream();
      this._setState();
    }
  }

  public isConnected(): boolean {
    return !!this._stream;
  }

  public isForbidden(): boolean {
    return this._stream === null;
  }

  public isMuted(): boolean {
    // For safety, this function always returns the stream mute status directly
    // (rather the desired internal state).
    return !this._stream || this._stream.getTracks().every((track) => !track.enabled);
  }

  protected _setDesiredMuteOnStream(): void {
    this._stream?.getTracks().forEach((track) => {
      track.enabled = !this._desireMute;
    });

    this._startDisconnectTimer();
  }

  protected _startDisconnectTimer(): void {
    // Any state change must cancel the previous timer. In particular, pressing
    // PTT (unmuting) must cancel a release timer that may already be running.
    this._timer.stop();

    const microphoneConfig = this._api.getConfigManager().getConfig()?.live.microphone;

    // disconnect_seconds is an idle/release timeout. Never tear down the
    // microphone while the user is actively holding PTT.
    if (!this._desireMute || microphoneConfig?.always_connected) {
      return;
    }

    const disconnectSeconds = microphoneConfig?.disconnect_seconds ?? 0;

    if (disconnectSeconds) {
      this._timer.start(disconnectSeconds, () => {
        this.disconnect();
      });
    }
  }

  protected _setState(): void {
    this.refreshPTTRegistration();
    this._state = {
      stream: this._stream,
      connected: this.isConnected(),
      muted: this.isMuted(),
      forbidden: this.isForbidden(),
    };
    this._api.getConditionStateManager().setState({
      microphone: this._state,
    });
    this._api.getCardElementManager().update();
  }
}
