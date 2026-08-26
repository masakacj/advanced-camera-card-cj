import {
  CSSResultGroup,
  html,
  LitElement,
  PropertyValues,
  TemplateResult,
  unsafeCSS,
} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Camera } from '../../../../camera-manager/camera.js';
import { CameraEndpoints } from '../../../../camera-manager/types.js';
import { MicrophoneState } from '../../../../card-controller/types.js';
import { dispatchLiveErrorEvent } from '../../../../components-lib/live/utils/dispatch-live-error.js';
import { VideoMediaPlayerController } from '../../../../components-lib/media-player/video.js';
import { MicrophoneConfig } from '../../../../config/schema/live.js';
import { homeAssistantSignPath } from '../../../../ha/sign-path.js';
import { HomeAssistant } from '../../../../ha/types.js';
import { createProxiedEndpointIfNecessary } from '../../../../ha/web-proxy.js';
import { localize } from '../../../../localize/localize.js';
import { registerPTTSender, unregisterPTTSender } from '../../../../ptt-registry.js';
import liveGo2RTCStyle from '../../../../scss/live-go2rtc.scss';
import { MediaPlayer, MediaPlayerController, Message } from '../../../../types.js';
import { errorToConsole } from '../../../../utils/basic.js';
import { renderMessage } from '../../../message.js';
import {
  findMicrophoneTransceiver,
  replaceMicrophoneTrack,
  reserveMicrophoneTransceiver,
} from './microphone-transceiver.js';
import { VideoRTC } from './video-rtc.js';

customElements.define('advanced-camera-card-live-go2rtc-player', VideoRTC);

// Note (2023-02-18): Depending on the behavior of the player / browser is
// possible this URL will need to be re-signed in order to avoid HA spamming
// logs after the expiry time, but this complexity is not added for now until
// there are verified cases of this being an issue (see equivalent in the JSMPEG
// provider).
const GO2RTC_URL_SIGN_EXPIRY_SECONDS = 24 * 60 * 60;

@customElement('advanced-camera-card-live-go2rtc')
export class AdvancedCameraCardGo2RTC extends LitElement implements MediaPlayer {
  // Not an reactive property to avoid resetting the video.
  public hass?: HomeAssistant;

  @property({ attribute: false })
  public camera?: Camera;

  @property({ attribute: false })
  public cameraEndpoints?: CameraEndpoints;

  @property({ attribute: false })
  public microphoneState?: MicrophoneState;

  @property({ attribute: false })
  public microphoneConfig?: MicrophoneConfig;

  @property({ attribute: false })
  public pttCardID?: string;

  @property({ attribute: true, type: Boolean })
  public controls = false;

  @state()
  protected _message: Message | null = null;

  protected _player?: VideoRTC;
  protected _microphoneTransceiver: RTCRtpTransceiver | null = null;
  protected _registeredPTTCardID?: string;
  protected _registeredPTTSender?: RTCRtpSender;

  protected _mediaPlayerController = new VideoMediaPlayerController(
    this,
    () => this._player?.video ?? null,
    () => this.controls,
  );

  public async getMediaPlayerController(): Promise<MediaPlayerController | null> {
    return this._mediaPlayerController;
  }

  disconnectedCallback(): void {
    this._clearPTTSenderRegistration();
    this._player = undefined;
    this._microphoneTransceiver = null;
    this._message = null;
    super.disconnectedCallback();
  }

  connectedCallback(): void {
    super.connectedCallback();

    // Reset the player when reconnected to the DOM.
    // https://github.com/dermotduffy/advanced-camera-card/issues/996
    this.requestUpdate();
  }

  protected _handleError(message: Message, e?: Error): void {
    if (e) {
      errorToConsole(e as Error);
    }

    this._message = {
      type: 'error',
      ...message,
    };
    dispatchLiveErrorEvent(this);
    return;
  }

  protected async _getPlayerSource(): Promise<string | null> {
    const cameraConfig = this.camera?.getConfig();
    const proxyConfig = this.camera?.getProxyConfig();
    if (!this.hass || !cameraConfig) {
      return null;
    }

    const streamEndpoint = this.cameraEndpoints?.go2rtc;
    if (!streamEndpoint) {
      this._handleError({
        message: localize('error.live_camera_no_endpoint'),
        context: cameraConfig,
      });
      return null;
    }

    let result: string | null = null;

    try {
      const endpoint = await createProxiedEndpointIfNecessary(
        this.hass,
        streamEndpoint,
        proxyConfig,
        {
          context: 'live',
          ttl: GO2RTC_URL_SIGN_EXPIRY_SECONDS,
          websocket: true,

          // The link may need to be opened multiple times.
          openLimit: 0,
        },
      );

      if (endpoint.sign) {
        result = await homeAssistantSignPath(
          this.hass,
          endpoint.endpoint,
          GO2RTC_URL_SIGN_EXPIRY_SECONDS,
        );
        if (!result) {
          this._handleError({
            message: localize('error.failed_sign'),
            context: cameraConfig,
          });
        }
      } else {
        result = endpoint.endpoint;
      }
    } catch (e) {
      this._handleError(
        {
          message: localize('error.failed_proxy'),
          context: cameraConfig,
        },
        e as Error,
      );
    }

    return result;
  }

  protected _clearPTTSenderRegistration(): void {
    if (this._registeredPTTCardID && this._registeredPTTSender) {
      unregisterPTTSender(this._registeredPTTCardID, this._registeredPTTSender);
    }
    this._registeredPTTCardID = undefined;
    this._registeredPTTSender = undefined;
  }

  protected _syncPTTSenderRegistration(): void {
    const sender = this._microphoneTransceiver?.sender;
    if (
      this._registeredPTTCardID === this.pttCardID &&
      this._registeredPTTSender === sender
    ) {
      return;
    }

    this._clearPTTSenderRegistration();

    if (this.pttCardID && sender) {
      registerPTTSender(this.pttCardID, sender);
      this._registeredPTTCardID = this.pttCardID;
      this._registeredPTTSender = sender;
    }
  }

  protected _prepareMicrophoneHotAttach(player: VideoRTC): void {
    const createOffer = player.createOffer.bind(player);

    player.createOffer = (pc: RTCPeerConnection) => {
      // A new PeerConnection is a provider/network lifecycle event, not a PTT
      // action. Move the PTT transport registration to the newly negotiated
      // sender while keeping any already-acquired physical microphone track in
      // the PersistentPTTManager.
      this._clearPTTSenderRegistration();
      this._microphoneTransceiver = null;

      // Negotiate an outbound audio m-line up front without attaching a real
      // microphone track. This does not request microphone permission, but it
      // lets a later user-initiated PTT press use RTCRtpSender.replaceTrack()
      // instead of rebuilding the whole WebRTC connection/video element.
      try {
        this._microphoneTransceiver = reserveMicrophoneTransceiver(
          pc,
          player.microphoneStream,
        );
        this._syncPTTSenderRegistration();
      } catch (e) {
        // Keep the original WebRTC offer working on browsers that cannot reserve
        // the transceiver. Standalone PTT remains unavailable rather than
        // reconnecting the player when pressed.
        errorToConsole(e as Error);
      }

      const offer = createOffer(pc);

      // createOffer() synchronously adds any real microphone track before its
      // first await, so capture that transceiver immediately when a microphone
      // was already connected before initial negotiation.
      if (!this._microphoneTransceiver) {
        this._microphoneTransceiver = findMicrophoneTransceiver(
          pc,
          player.microphoneStream,
        );
        this._syncPTTSenderRegistration();
      }

      return offer;
    };
  }

  protected _setMicrophoneStream(stream: MediaStream | null): void {
    const player = this._player;
    if (!player) {
      return;
    }

    player.microphoneStream = stream;

    // If WebRTC negotiation has not started yet, createOffer() will pick up the
    // latest microphone stream when it does start.
    if (!player.pc) {
      return;
    }

    const transceiver =
      this._microphoneTransceiver ?? findMicrophoneTransceiver(player.pc, null);
    this._microphoneTransceiver = transceiver;

    if (!transceiver) {
      // This fallback belongs only to the original ACC microphone path. The CJ
      // standalone PTT path never calls this method and therefore never causes a
      // reconnect/renegotiation on PTT press.
      player.reconnect();
      return;
    }

    void replaceMicrophoneTrack(transceiver, stream).catch((e: unknown) => {
      errorToConsole(e as Error);

      // The player may have been replaced while replaceTrack() was pending.
      if (this._player === player) {
        this._microphoneTransceiver = null;
        this._clearPTTSenderRegistration();
        player.reconnect();
      }
    });
  }

  protected async _createPlayer(): Promise<void> {
    const src = await this._getPlayerSource();
    if (!src) {
      return;
    }

    const player = new VideoRTC();
    player.mediaPlayerController = this._mediaPlayerController;
    player.microphoneStream = this.microphoneState?.stream ?? null;
    this._prepareMicrophoneHotAttach(player);
    player.src = src;
    player.visibilityCheck = false;
    player.setControls(this.controls);

    const cameraConfig = this.camera?.getConfig();
    if (cameraConfig?.go2rtc?.modes && cameraConfig.go2rtc.modes.length) {
      player.mode = cameraConfig.go2rtc.modes.join(',');
    }

    this._player = player;
    this.requestUpdate();
  }

  protected willUpdate(changedProps: PropertyValues): void {
    if (changedProps.has('cameraEndpoints')) {
      this._message = null;
    }

    if (!this._message && (!this._player || changedProps.has('cameraEndpoints'))) {
      this._createPlayer();
    }

    if (changedProps.has('controls') && this._player) {
      this._player.setControls(this.controls);
    }

    if (changedProps.has('pttCardID')) {
      this._syncPTTSenderRegistration();
    }

    if (
      this._player &&
      changedProps.has('microphoneState') &&
      this._player.microphoneStream !== (this.microphoneState?.stream ?? null)
    ) {
      this._setMicrophoneStream(this.microphoneState?.stream ?? null);
    }
  }

  protected render(): TemplateResult | void {
    if (this._message) {
      return renderMessage(this._message);
    }
    return html`${this._player}`;
  }

  static get styles(): CSSResultGroup {
    return unsafeCSS(liveGo2RTCStyle);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'advanced-camera-card-live-go2rtc': AdvancedCameraCardGo2RTC;
  }
}
