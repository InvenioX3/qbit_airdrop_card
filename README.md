<!--
  PROJECT HEADER
-->
<p align="center">
  <a href="https://github.com/InvenioX3/qbit_airdrop_card">
    <!-- PROJECT ICON PLACEHOLDER -->
    <img src="dist/magnet.png" alt="Qbit Airdrop Card" width="120" />
  </a>
</p>

<p align="center">
  <!-- BADGES: COLORS & LINKS -->
  <a href="https://hacs.xyz/">
    <img
      alt="HACS Dashboard Plugin"
      src="https://img.shields.io/badge/HACS-Dashboard%20Plugin-41BDF5?style=for-the-badge&logo=homeassistantcommunitystore&logoColor=white"
    />
  </a>
  <a href="https://github.com/InvenioX3/qbit_airdrop_card/commits/main">
    <img
      alt="Version (HACS hash)"
      src="https://img.shields.io/badge/version-HACS%20hash-0A84FF?style=for-the-badge"
    />
  </a>
  <a href="https://github.com/InvenioX3">
    <img
      alt="Author"
      src="https://img.shields.io/badge/author-JosephBrandenburg-9A4DFF?style=for-the-badge"
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

## Overview

**Qbit Airdrop Submit Card** is a custom Lovelace card (HACS Dashboard plugin) for Home Assistant.

It provides a streamlined UI for:

- Pasting or auto-detecting magnet links (especially on Android / Google TV).
- Submitting them to qBittorrent through the **Qbit Airdrop integration**.
- Viewing active torrents and managing them directly from a dashboard.

This repository contains the **frontend only**: the JavaScript card and its static assets. All backend functionality (services and HTTP endpoints) comes from the Qbit Airdrop **integration**.

> Integration repository:  
> `https://github.com/InvenioX3/qbit-airdrop`

---

## Features

- **Magnet input optimized for touch and TV UIs**
  - Click/tap into the field and paste a `magnet:?` URL.
  - On Android / Google TV, the card can auto-submit when it detects a magnet link in the input.

- **Category inference**
  - Reads the `dn` (display name) parameter from the magnet.
  - Cleans up common naming patterns (dots, underscores, etc.).
  - Infers a category from TV-style names (e.g., `Item.Name.F01U03...` ⇒ `Item Name`).
  - Sends the infered category to the `qbit_airdrop.add_magnet` service.

- **Cleaned titles**
  - Trims the visible title to the useful part:
    - Show name.
    - Season/episode.
    - Year (where possible).
  - Hides noisy codec/source tags when appropriate.

- **Active torrent list**
  - Uses the integration’s `/api/qbit_airdrop/active` endpoint to render:
    - **State** with progress.
    - **Download speed** in a green `↓` column.
    - **Size** column.
    - **Cleaned title**, with special coloring when availability is 0.

- **One-click delete / remove**
  - Click **state** to delete torrent **and files**.
  - Click **size** to remove torrent but keep files.
  - Refresh button to re-query the integration and update the list.

- **Backend-agnostic UI**
  - The card only talks to Home Assistant:
    - `qbit_airdrop.add_magnet`
    - `qbit_airdrop.reload_entry`
    - `/api/qbit_airdrop/active`
    - `/api/qbit_airdrop/delete`
  - It never talks directly to qBittorrent.

---

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
3. Locate **Qbit Airdrop Submit Card** in HACS → Frontend and install it.
4. HACS will:
   - Install `qbit-airdrop-submit-card.js` into the appropriate location (e.g. `/www/...`).
   - Register it as a dashboard resource.

> Note: Because this is a Dashboard plugin, HACS manages the resource registration for you. You should not need to add the resource manually, and using HACS vs manual install makes applying updates easier.

5. Restart Home Assistant if prompted.

### Manual (non-HACS) installation

If you prefer not to use HACS:

1. Copy `qbit-airdrop-submit-card.js` into:
   ```text
   <config>/www/community/qbit_airdrop_card/qbit-airdrop-submit-card.js
