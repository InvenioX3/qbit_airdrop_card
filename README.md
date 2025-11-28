<!--
  PROJECT HEADER
-->
<p align="center">
  <a href="https://github.com/InvenioX3/qbit_airdrop_card">
    <img src="/dist/icon.png" alt="Qbit Airdrop Card for Home Assistant" width="256" />
  </a>
</p>

<h1 align="center">Qbit Airdrop Lovelace card</h1>

<p align="center">
  <a href="https://hacs.xyz/">
    <img
      alt="HACS Dashboard Plugin"
      src="https://img.shields.io/badge/HACS-Dashboard%20Plugin-41BDF5?style=for-the-badge&logo=homeassistantcommunitystore&logoColor=white"
    />
  </a>
  <a href="https://github.com/InvenioX3/qbit_Airdrop_card/commits/main">
    <img
      alt="Version (HACS hash)"
      src="https://img.shields.io/badge/version-HACS%20hash-0A84FF?style=for-the-badge"
    />
  </a>
  <a href="https://github.com/InvenioX3">
    <img
      alt="Author"
      src="https://img.shields.io/badge/author-Joseph Brandenburg-9A4DFF?style=for-the-badge"
    />
  </a>
  <a href="https://github.com/InvenioX3/qbit_airdrop_card/releases">
    <img
      alt="Downloads"
      src="https://img.shields.io/github/downloads/InvenioX3/qbit_airdrop_card/total?style=for-the-badge&color=34C759"
    />
  </a>
  <a href="https://github.com/InvenioX3/qbit_airdrop_card/issues">
    <img
      alt="Open Issues"
      src="https://img.shields.io/github/issues/InvenioX3/qbit_airdrop_card?style=for-the-badge&color=FF9500"
    />
  </a>
  <a href="https://github.com/InvenioX3/qbit_airdrop_card/stargazers">
    <img
      alt="Stars"
      src="https://img.shields.io/github/stars/InvenioX3/qbit_airdrop_card?style=for-the-badge&color=FFD60A"
    />
  </a>
</p>

<p align="center">
  <!-- QUICK META LINKS -->
  <a href="#overview"><strong>Overview</strong></a> ·
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#requirements"><strong>Requirements</strong></a> ·
  <a href="#installation"><strong>Installation</strong></a> ·
  <a href="#card-configuration"><strong>Card Configuration</strong></a> ·
  <a href="#related-repositories"><strong>Related Repos</strong></a>
</p>

---

## Overview & Features

**Qbit Card** is a custom Lovelace card (HACS Dashboard plugin) for Home Assistant.
Optimized for the Mobile Home Assistant app, it provides a streamlined UI for:

- Submitting magnet links to qBittorrent through the **Qbit Airdrop integration**
  - Tap the general area of the **logo** and paste a `magnet:?` URL
    - `magnet:?` is detected, parsed for show/movie title strings, and appends the cleaned title to the default save location for the Qbit integration
      -  e.g. `//NAS/TV-Shows/` for series
      -  Non-series items are saved in the default location set in the qBitorrent client
    - qBitorrent client automatically creates the category and directory based on the save location
- Managing torrents directly from this card
  - Tapping the `State` column (leftmost) deletes the selected torrent and all related files, with optional confirmation prompt
  - Tapping the `Size` field removes the selected torrent and retains all related files
- Refreshing the list
  - Tapping the "`Qbit Airdrop`" section of the logo triggers a refresh of the torrent list

This repository contains the **frontend only**: the JavaScript card and its static assets. All backend functionality (services and HTTP endpoints) comes from the Qbit Airdrop **integration** located here:
<a href="https://github.com/InvenioX3/qbit_airdrop"><strong>Qbit Airdrop</strong></a>




## Requirements

- Home Assistant with dashboards.
- HACS installed and configured.
- **Qbit Airdrop integration** installed and working:
  - Repository: `https://github.com/InvenioX3/qbit-airdrop`
  - Properly configured `host`, `port`, and optional `base_path`.
- qBittorrent instance reachable from Home Assistant.

---

## Installation

This repository is intended to be installed as a **HACS Dashboard plugin**.

### Install via HACS

1. In Home Assistant, open **HACS → Frontend**.
2. Add this repository as a **Custom Repository** if needed:
   - Repository: `https://github.com/InvenioX3/qbit_airdrop_card`
   - Category: `Dashboard`
3. Locate **Qbit Airdrop Card** in HACS → Frontend and install it.
4. HACS will:
   - Install `qbit-airdrop-submit-card.js` into the appropriate location (e.g. `/www/...`).
   - Register it as a dashboard resource.

> Note: Because this is a Dashboard plugin, HACS manages the resource registration for you. You should not need to add the resource manually.

5. Add the card to a dashboard:
   - `Edit Dashboard`->(Hover over elements to see their labels)`Create section`->`Add card`-> type 'q', then select `Manual`->
     -Replace `type: ""` with
```
type: custom:qbit-airdrop-submit-card
title: Qbit Airdrop
entity: sensor.time
```

---

## Technical Details

### Backend interaction

This card is a pure frontend component and never talks to qBittorrent directly. All operations go through Home Assistant and the `qbit_airdrop` integration:

- **Magnet submission**
  - The card invokes the Home Assistant service:
    - `qbit_airdrop.add_magnet`
  - Payload:
    - `magnet` – the raw `magnet:?` URI captured from user input.
  - The integration then:
    - Parses/normalizes the URI.
    - Derives category/save-path information.
    - Calls qBittorrent’s WebUI `torrents/add` endpoint on your configured qBittorrent instance.

- **Torrent listing**
  - To render the torrent table, the card calls an internal REST endpoint provided by the `qbit_airdrop` integration via Home Assistant’s HTTP API (e.g. through `this.hass.callApi`).
  - That endpoint proxies qBittorrent’s `torrents/info` WebUI API and returns a JSON payload that is mapped directly into the card’s rows (hash, name, state, size, progress, etc.).

- **Torrent deletion**
  - When the user requests deletion, the card calls another internal backend endpoint, providing:
    - The torrent identifier(s) to operate on.
    - A boolean flag indicating whether files on disk should also be removed.
  - The integration forwards this to qBittorrent’s `torrents/delete` WebUI API with the appropriate `deleteFiles=true/false` behavior.

All of these backend calls use the existing Home Assistant HTTP/WebSocket connection; the card never stores qBittorrent credentials and is not aware of the qBittorrent host/port.

---

### Automations and extensibility

- The card does **not** define any additional entities or services of its own; it is strictly a consumer of:
  - The `qbit_airdrop.add_magnet` service.
  - The internal REST endpoints exposed by the `qbit_airdrop` integration.
- For non-UI automation (scripts, blueprints, etc.), you should:
  - Call `qbit_airdrop.add_magnet` directly from Home Assistant automations.
  - Optionally use qBittorrent’s WebUI API directly from external tools for advanced control beyond what the card/integration currently exposes.

This keeps the card focused on presentation while the integration remains the single place where all qBittorrent WebUI API interaction is implemented.
