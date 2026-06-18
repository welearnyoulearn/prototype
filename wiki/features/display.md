# Display / Kiosk Mode

**Status:** 2 Built
**Last updated:** 2026-06-18

---

## Overview

Fullscreen kiosk mode at `/display` for lobby TVs and school displays. Token-based access with no login required.

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| TV Display | Built | Fullscreen kiosk: timetable summary, active announcements, attendance summary. Auto-refreshes |
| Display Tokens | Built | Generate named tokens (e.g., "Main Lobby", "Library"). Token-based access. Tracks last used time |

---

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/display-token` | Generate display token |
| `GET /api/display-data` | Fetch display content |
