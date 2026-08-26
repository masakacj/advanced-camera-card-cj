<!-- markdownlint-disable first-line-heading -->
<!-- markdownlint-disable fenced-code-language -->
<!-- markdownlint-disable no-inline-html -->

[![Build Status](https://img.shields.io/github/actions/workflow/status/masakacj/advanced-camera-card-cj/hacs-dist.yml?branch=main&style=flat-square)](https://github.com/masakacj/advanced-camera-card-cj/actions/workflows/hacs-dist.yml)
[![License](https://img.shields.io/github/license/masakacj/advanced-camera-card-cj.svg?style=flat-square)](LICENSE)
[![HACS Custom](https://img.shields.io/badge/HACS-custom-orange.svg?style=flat-square)](https://hacs.xyz)

<img src="https://raw.githubusercontent.com/dermotduffy/advanced-camera-card/main/docs/images/advanced-camera-card.png" alt="Advanced Camera Card" width="500px">

# Advanced Camera Card CJ

Personal fork of [Advanced Camera Card](https://github.com/dermotduffy/advanced-camera-card) for Home Assistant.

This fork keeps the upstream card type and configuration compatibility, while adding custom changes used in this repository. Current additions include a standalone push-to-talk card for two-way audio.

## Install with HACS

Add this repository as a HACS custom repository with category **Dashboard**:

`https://github.com/masakacj/advanced-camera-card-cj`

The main card type remains unchanged:

```yaml
 type: custom:advanced-camera-card
```

## Standalone push-to-talk card

Give the main Advanced Camera Card a stable `card_id`:

```yaml
 type: custom:advanced-camera-card
 card_id: front-door

 live:
   microphone:
     always_connected: false
     disconnect_seconds: 10
```

Then add the companion PTT card:

```yaml
 type: custom:advanced-camera-card-ptt
 target: front-door
 name: 对讲
 icon: mdi:microphone-off
 active_icon: mdi:microphone
```

The PTT card does not create another camera player or another WebRTC video stream. It controls the microphone manager of the existing Advanced Camera Card target.

## Upstream features

- Live viewing of multiple cameras.
- Clips and snapshot browsing via mini-gallery.
- Automatic updating to continually show latest clip / snapshot.
- Support for filtering events by zone and label.
- Arbitrary entity access via menu (e.g. motion sensor access).
- Fullscreen mode.
- Grid or carousel/swipeable media, thumbnails and cameras.
- Direct media downloads.
- Lovelace visual editing.
- Full [Picture Elements](https://www.home-assistant.io/lovelace/picture-elements/) support.
- Theme friendly.

See the [upstream documentation](https://card.camera) for the standard Advanced Camera Card configuration and features.
