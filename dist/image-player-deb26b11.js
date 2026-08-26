import{_ as a,f3 as e,t,a4 as r,dj as o,x as i,dp as s,dq as d,dr as l,dn as n,r as c,f0 as h,f4 as m,n as y,a as u,d7 as v,d9 as p,df as g}from"./card-0e69d158.js";import{d as _}from"./dispatch-live-error-8d00ba1a.js";import{V as b,h as f,m as w,M as x}from"./audio-2df52817.js";var C="img,\nvideo {\n  object-fit: var(--advanced-camera-card-media-layout-fit, contain);\n  object-position: var(--advanced-camera-card-media-layout-position-x, 50%) var(--advanced-camera-card-media-layout-position-y, 50%);\n  object-view-box: inset(var(--advanced-camera-card-media-layout-view-box-top, 0%) var(--advanced-camera-card-media-layout-view-box-right, 0%) var(--advanced-camera-card-media-layout-view-box-bottom, 0%) var(--advanced-camera-card-media-layout-view-box-left, 0%));\n}";customElements.whenDefined("ha-hls-player").then((()=>{const m=customElements.get("ha-hls-player");let y=class extends m{constructor(){super(...arguments),this._mediaPlayerController=new b(this,(()=>this._video),(()=>this.controls))}async getMediaPlayerController(){return this._mediaPlayerController}render(){if(this._error){if(this._errorIsFatal)return _(this),r({type:"error",message:this._error,context:{entity_id:this.entityid}});o(this._error,console.error)}return i`
        <video
          id="video"
          .poster=${this.posterUrl}
          ?autoplay=${this.autoPlay}
          .muted=${this.muted}
          ?playsinline=${this.playsInline}
          ?controls=${this.controls}
          @loadedmetadata=${()=>{this.controls&&f(this._video,x)}}
          @loadeddata=${a=>this._loadedDataHandler(a)}
          @volumechange=${()=>s(this)}
          @play=${()=>d(this)}
          @pause=${()=>l(this)}
        ></video>
      `}_loadedDataHandler(a){super._loadedData(),n(this,a,{mediaPlayerController:this._mediaPlayerController,capabilities:{supportsPause:!0,hasAudio:w(this._video)},technology:["hls"]})}static get styles(){return[super.styles,c(C),h`
          :host {
            width: 100%;
            height: 100%;
          }
          video {
            width: 100%;
            height: 100%;
          }
        `]}};a([e("#video")],y.prototype,"_video",void 0),y=a([t("advanced-camera-card-ha-hls-player")],y)}));class P{constructor(a,e){this._host=a,this._getImageCallback=e}async play(){}async pause(){}async mute(){}async unmute(){}isMuted(){return!0}async seek(a){}async setControls(a){}isPaused(){return!1}async getScreenshotURL(){await this._host.updateComplete;const a=this._getImageCallback();return a?m(a):null}getFullscreenElement(){return this._getImageCallback()??null}}let $=class extends u{constructor(){super(...arguments),this._refImage=v(),this._mediaPlayerController=new P(this,(()=>this._refImage.value??null))}async getMediaPlayerController(){return this._mediaPlayerController}render(){return i`<img
      ${p(this._refImage)}
      src="${g(this.url)}"
      @load=${a=>{n(this,a,{...this._mediaPlayerController&&{mediaPlayerController:this._mediaPlayerController},technology:[this.technology??"jpg"]})}}
    />`}static get styles(){return c(":host {\n  width: 100%;\n  height: 100%;\n  display: block;\n}\n\nimg {\n  width: 100%;\n  height: 100%;\n  display: block;\n  object-fit: var(--advanced-camera-card-media-layout-fit, contain);\n  object-position: var(--advanced-camera-card-media-layout-position-x, 50%) var(--advanced-camera-card-media-layout-position-y, 50%);\n  object-view-box: inset(var(--advanced-camera-card-media-layout-view-box-top, 0%) var(--advanced-camera-card-media-layout-view-box-right, 0%) var(--advanced-camera-card-media-layout-view-box-bottom, 0%) var(--advanced-camera-card-media-layout-view-box-left, 0%));\n}")}};a([y()],$.prototype,"url",void 0),a([y()],$.prototype,"technology",void 0),$=a([t("advanced-camera-card-image-player")],$);export{C as c};
