# Stash — End-to-End Build Guide
### Steam + PlayStation game library tracker, installable on Android and iPhone

---

## Table of Contents

1. [What We're Building](#1-what-were-building)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Prerequisites](#3-prerequisites)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [Backend Setup](#6-backend-setup)
7. [Auth System](#7-auth-system)
8. [Steam Integration](#8-steam-integration)
9. [PlayStation Integration](#9-playstation-integration)
10. [Game Library API](#10-game-library-api)
11. [Frontend Setup](#11-frontend-setup)
12. [PWA Configuration](#12-pwa-configuration)
13. [Core UI Components](#13-core-ui-components)
14. [Platform Connection Flows](#14-platform-connection-flows)
15. [Deployment](#15-deployment)
16. [Mobile Installation](#16-mobile-installation)
17. [Keeping Things in Sync](#17-keeping-things-in-sync)
18. [What to Build Next](#18-what-to-build-next)

---

## 1. What We're Building

A personal game library tracker with:

- **Auto-sync from Steam and PlayStation** — your library, wishlist, and play status pulled automatically
- **Status tracking** — Playing, Finished, Abandoned, Backlog, Wishlist, On Hold
- **Ratings** — rate any game out of 10
- **Smart auto-categorization** — recently played goes to Playing, never launched goes to Backlog
- **Installable on Android and iPhone** — works like a native app via PWA (no App Store needed)
- **Persistent across devices** — single account, cloud-backed database

---

## 2. Architecture Decisions

### Why a PWA and not React Native?

A Progressive Web App (PWA) is a website that can be "installed" from the browser and behaves like a native app — offline support, home screen icon, no browser chrome. The reason to choose this over React Native:

- You write standard React — no new framework to learn
- No App Store submission. You deploy to a URL and install from there
- Android support is excellent (Chrome handles it natively). iOS is good enough (Safari supports it since iOS 16.4)
- One codebase, zero build toolchain complexity

The tradeoff: push notifications are limited on iOS, and you can't access some native device APIs. For a game tracker, neither matters.

### Why Railway for the backend?

Railway provisions a PostgreSQL database and a Node.js server together, gives you a shared domain, and has a free starter tier that's more than enough for personal use. It's the least-friction option for this stack.

### Why not just a frontend-only app?

Your Steam API key and PSN tokens need to live server-side — if they're in frontend code, anyone can extract them from the browser. The backend also handles the PSN OAuth exchange (NPSSO → access token), which requires server-side secrets.

### Stack summary

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| PWA | vite-plugin-pwa |
| Backend | Node.js + Express |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT + bcrypt |
| Steam API | Official Steam Web API (direct fetch) |
| PSN API | psn-api (npm library, NPSSO approach) |
| Backend hosting | Railway |
| Frontend hosting | Vercel |

---

## 3. Prerequisites

### Software to install

```bash
# Node.js (v20 or later)
# Download from https://nodejs.org — use the LTS version

# Verify installation
node --version   # should show v20.x.x
npm --version    # should show 10.x.x

# Git
# Download from https://git-scm.com if not already installed
git --version
```

### Accounts to create (all free)

| Service | URL | Purpose |
|---|---|---|
| GitHub | github.com | Code hosting |
| Railway | railway.app | Backend + database hosting |
| Vercel | vercel.com | Frontend hosting |

### Keys and tokens to gather

You'll set these up during the relevant sections, but flag them now:

- **Steam Web API key** — from steamcommunity.com/dev/apikey (requires a Steam account)
- **Steam ID** — your 17-digit Steam profile ID
- **PSN NPSSO token** — a session token from PlayStation's website (explained in section 9)

---

## 4. Project Structure

Create this folder layout from the start. It keeps backend and frontend clearly separated:

```
stash/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js            # Login, register, JWT
│   │   │   ├── games.js           # Library CRUD
│   │   │   ├── steam.js           # Steam sync endpoint
│   │   │   └── psn.js             # PSN sync endpoint
│   │   ├── lib/
│   │   │   ├── steam.js           # Steam API helper functions
│   │   │   └── psn.js             # PSN API helper functions
│   │   ├── middleware/
│   │   │   └── auth.js            # JWT verification middleware
│   │   └── server.js              # Express app entry point
│   ├── .env                       # Secrets (never commit this)
│   └── package.json
│
└── frontend/
    ├── public/
    │   ├── icons/                 # PWA icons (192px and 512px)
    │   └── manifest.json          # PWA manifest (auto-generated)
    ├── src/
    │   ├── api/
    │   │   └── client.js          # Axios instance + all API calls
    │   ├── components/
    │   │   ├── GameCard.jsx
    │   │   ├── StatusTabs.jsx
    │   │   └── PlatformConnect.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   └── Library.jsx
    │   ├── App.jsx
    │   └── main.jsx
    ├── vite.config.js
    └── package.json
```

Initialize both projects:

```bash
mkdir stash && cd stash

# Backend
mkdir backend && cd backend
npm init -y
cd ..

# Frontend
npm create vite@latest frontend -- --template react
```

---

## 5. Database Schema

Navigate to the backend folder and set up Prisma:

```bash
cd backend
npm install prisma @prisma/client
npx prisma init
```

This creates `prisma/schema.prisma`. Replace its contents entirely:

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())

  platforms PlatformConnection[]
  games     UserGame[]
}

model PlatformConnection {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  platform  String   // "steam" | "playstation"

  // Steam fields
  steamId      String?
  steamApiKey  String?

  // PlayStation fields
  psnAccountId   String?
  psnAccessToken String?
  psnRefreshToken String?
  psnTokenExpiresAt DateTime?

  lastSyncedAt DateTime?
  createdAt    DateTime @default(now())

  @@unique([userId, platform])
}

model Game {
  id          String  @id @default(cuid())
  platform    String  // "steam" | "playstation"
  platformId  String  // Steam appid or PSN titleId
  name        String
  coverUrl    String?
  genre       String?
  releaseYear Int?

  userGames UserGame[]

  @@unique([platform, platformId])
}

model UserGame {
  id     String @id @default(cuid())
  userId String
  gameId String

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  game Game @relation(fields: [gameId], references: [id])

  // User-controlled fields
  status    String   @default("backlog") // playing | finished | abandoned | backlog | wishlist | hold
  rating    Float?   // 0.0 to 10.0
  notes     String?
  isManual  Boolean  @default(false)

  // Synced from platform
  playtimeMinutes Int?
  lastPlayedAt    DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, gameId])
}
```

---

## 6. Backend Setup

### Install all backend dependencies

```bash
cd backend
npm install express cors dotenv bcryptjs jsonwebtoken
npm install axios
npm install psn-api
npm install --save-dev nodemon
```

### Create the Express server

```javascript
// backend/src/server.js

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const gamesRoutes = require('./routes/games');
const steamRoutes = require('./routes/steam');
const psnRoutes = require('./routes/psn');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/sync/steam', steamRoutes);
app.use('/api/sync/psn', psnRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

### Environment variables

Create `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/stash"
JWT_SECRET="replace-this-with-a-long-random-string-minimum-32-chars"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

Generate a proper JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the output as `JWT_SECRET`.

### Add scripts to package.json

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "db:push": "npx prisma db push",
    "db:studio": "npx prisma studio"
  }
}
```

---

## 7. Auth System

### Middleware

```javascript
// backend/src/middleware/auth.js

const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
```

### Auth routes

```javascript
// backend/src/routes/auth.js

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, password: hashed } });
    res.json({ token: signToken(user.id), email: user.email });
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Email already in use' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ token: signToken(user.id), email: user.email });
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { platforms: { select: { platform: true, lastSyncedAt: true } } },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ email: user.email, platforms: user.platforms });
});

module.exports = router;
```

---

## 8. Steam Integration

### How it works

Steam has a well-documented, free public API. You need:

1. **Steam Web API key** — get yours at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). It's instant and free.
2. **Steam ID** — your 17-digit account ID. Find it by going to your Steam profile, copying the URL. If it's `steamcommunity.com/profiles/76561198XXXXXXXXX`, that number is your Steam ID. If it's a custom URL like `/id/username`, visit [steamid.io](https://steamid.io) and paste your URL to find the numeric ID.

### What we pull from Steam

| API endpoint | Data | How we use it |
|---|---|---|
| `GetOwnedGames` | All games you own, with total playtime | Base of your library |
| `GetRecentlyPlayedGames` | Games played in the last 2 weeks | Auto-set status to "Playing" |
| `wishlistdata` | Your Steam wishlist | Auto-set status to "Wishlist" |

### Auto-categorization rules

```
If game is in wishlist              → status = "wishlist"
If game was played in last 2 weeks  → status = "playing"
If game has any playtime > 0        → status = "backlog"  (user can promote to finished/abandoned)
If game has 0 playtime              → status = "backlog"  (not started)
```

Games you've personally moved to "Finished", "Abandoned", or "On Hold" will never be overwritten by a sync — only "Playing" and "Backlog" auto-update.

### Steam API helper

```javascript
// backend/src/lib/steam.js

const axios = require('axios');

const BASE = 'https://api.steampowered.com';

async function getOwnedGames(apiKey, steamId) {
  const { data } = await axios.get(`${BASE}/IPlayerService/GetOwnedGames/v1/`, {
    params: {
      key: apiKey,
      steamid: steamId,
      include_appinfo: true,
      include_played_free_games: true,
      format: 'json',
    },
  });
  return data.response?.games || [];
}

async function getRecentlyPlayed(apiKey, steamId) {
  const { data } = await axios.get(`${BASE}/IPlayerService/GetRecentlyPlayedGames/v1/`, {
    params: { key: apiKey, steamid: steamId, count: 50, format: 'json' },
  });
  return data.response?.games || [];
}

async function getWishlist(steamId) {
  // This is an unofficial but stable endpoint — no API key required
  const { data } = await axios.get(
    `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/`,
    { params: { p: 0 } }
  );
  // Returns an object keyed by appid
  return Object.keys(data || {});
}

function coverUrl(appId) {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

// Determine status for a game during sync
// Only overrides "playing" and "backlog" — never touches user-set statuses
function autoStatus(appId, recentIds, wishlistIds, currentStatus) {
  const protectedStatuses = ['finished', 'abandoned', 'hold'];
  if (protectedStatuses.includes(currentStatus)) return currentStatus;

  if (wishlistIds.includes(String(appId))) return 'wishlist';
  if (recentIds.includes(appId)) return 'playing';
  return 'backlog';
}

module.exports = { getOwnedGames, getRecentlyPlayed, getWishlist, coverUrl, autoStatus };
```

### Steam sync route

```javascript
// backend/src/routes/steam.js

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');
const steam = require('../lib/steam');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/sync/steam/connect
// Save Steam credentials and run first sync
router.post('/connect', requireAuth, async (req, res) => {
  const { steamApiKey, steamId } = req.body;
  if (!steamApiKey || !steamId) {
    return res.status(400).json({ error: 'steamApiKey and steamId are required' });
  }

  // Test the credentials before saving
  try {
    const testGames = await steam.getOwnedGames(steamApiKey, steamId);
    if (!Array.isArray(testGames)) throw new Error('Invalid response');
  } catch {
    return res.status(400).json({ error: 'Could not connect to Steam. Check your API key and Steam ID, and make sure your Steam profile is set to Public.' });
  }

  // Save credentials
  await prisma.platformConnection.upsert({
    where: { userId_platform: { userId: req.user.userId, platform: 'steam' } },
    create: { userId: req.user.userId, platform: 'steam', steamApiKey, steamId },
    update: { steamApiKey, steamId },
  });

  // Run the sync immediately
  const result = await runSteamSync(req.user.userId);
  res.json(result);
});

// POST /api/sync/steam/sync
// Manually trigger a re-sync
router.post('/sync', requireAuth, async (req, res) => {
  const result = await runSteamSync(req.user.userId);
  res.json(result);
});

async function runSteamSync(userId) {
  const connection = await prisma.platformConnection.findUnique({
    where: { userId_platform: { userId, platform: 'steam' } },
  });
  if (!connection) throw new Error('Steam not connected');

  const { steamApiKey, steamId } = connection;

  // Fetch data from Steam
  const [owned, recent, wishlist] = await Promise.all([
    steam.getOwnedGames(steamApiKey, steamId),
    steam.getRecentlyPlayed(steamApiKey, steamId),
    steam.getWishlist(steamId),
  ]);

  const recentIds = recent.map(g => g.appid);
  let newCount = 0;
  let updatedCount = 0;

  for (const steamGame of owned) {
    // Upsert the Game record (master game data)
    const game = await prisma.game.upsert({
      where: { platform_platformId: { platform: 'steam', platformId: String(steamGame.appid) } },
      create: {
        platform: 'steam',
        platformId: String(steamGame.appid),
        name: steamGame.name,
        coverUrl: steam.coverUrl(steamGame.appid),
      },
      update: { name: steamGame.name },
    });

    // Check if user already has this game
    const existing = await prisma.userGame.findUnique({
      where: { userId_gameId: { userId, gameId: game.id } },
    });

    const recentEntry = recent.find(r => r.appid === steamGame.appid);
    const lastPlayed = recentEntry?.rtime_last_played
      ? new Date(recentEntry.rtime_last_played * 1000)
      : null;

    if (!existing) {
      const status = steam.autoStatus(steamGame.appid, recentIds, wishlist, null);
      await prisma.userGame.create({
        data: {
          userId,
          gameId: game.id,
          status,
          playtimeMinutes: steamGame.playtime_forever || 0,
          lastPlayedAt: lastPlayed,
        },
      });
      newCount++;
    } else {
      // Only update playtime, lastPlayed, and auto-statuses
      const newStatus = steam.autoStatus(steamGame.appid, recentIds, wishlist, existing.status);
      await prisma.userGame.update({
        where: { userId_gameId: { userId, gameId: game.id } },
        data: {
          playtimeMinutes: steamGame.playtime_forever || 0,
          lastPlayedAt: lastPlayed || existing.lastPlayedAt,
          status: newStatus,
        },
      });
      updatedCount++;
    }
  }

  // Handle wishlist items not already in library
  for (const appId of wishlist) {
    const game = await prisma.game.findUnique({
      where: { platform_platformId: { platform: 'steam', platformId: appId } },
    });
    if (!game) continue; // Skip if we don't have game info for it

    const existing = await prisma.userGame.findUnique({
      where: { userId_gameId: { userId, gameId: game.id } },
    });
    if (!existing) {
      await prisma.userGame.create({
        data: { userId, gameId: game.id, status: 'wishlist' },
      });
      newCount++;
    }
  }

  // Update last synced timestamp
  await prisma.platformConnection.update({
    where: { userId_platform: { userId, platform: 'steam' } },
    data: { lastSyncedAt: new Date() },
  });

  return {
    success: true,
    message: `Sync complete. ${newCount} new games added, ${updatedCount} updated.`,
    newCount,
    updatedCount,
  };
}

module.exports = router;
```

---

## 9. PlayStation Integration

### How it works (NPSSO approach)

Sony doesn't publish an official API, but the `psn-api` library reverse-engineers their endpoints cleanly. Authentication uses your PSN session cookie (NPSSO token) — no Sony developer account needed.

The NPSSO token is valid for 2 years. The library handles refreshing access tokens automatically.

### Getting your NPSSO token

Tell your users to follow these steps (you'll build this into the app's UI):

1. Log into [PlayStation.com](https://www.playstation.com) in any browser
2. Visit this URL in the same browser: `https://ca.account.sony.com/api/v1/ssocookie`
3. The page shows a JSON response. Copy the value of the `npsso` field
4. Paste it into the app

This is a ~64-character alphanumeric string. It needs to be done once.

### What we pull from PSN

| PSN API | Data | How we use it |
|---|---|---|
| `getUserTitles` | All games in your PSN library | Base of your library |
| Trophy metadata | When you last played, playtime | Auto-set Playing status |

PSN doesn't provide exact playtime like Steam does. We use "has trophies = played", and "recently earned trophies = currently playing" as the signal.

### PSN helper

```javascript
// backend/src/lib/psn.js

const {
  exchangeNpssoForCode,
  exchangeCodeForAccessToken,
  getUserTitles,
  makeUniversalSearch,
} = require('psn-api');

async function getAccessToken(npsso) {
  const code = await exchangeNpssoForCode(npsso);
  const auth = await exchangeCodeForAccessToken(code);
  return auth;
}

async function getLibrary(accessToken) {
  const allTitles = [];
  let offset = 0;
  const limit = 200;

  // PSN paginates — fetch all pages
  while (true) {
    const response = await getUserTitles(
      { accessToken },
      'me',
      { limit, offset }
    );

    const titles = response.trophyTitles || [];
    allTitles.push(...titles);

    if (titles.length < limit) break;
    offset += limit;
  }

  return allTitles;
}

// Map PSN title to our data shape
function mapTitle(title) {
  return {
    platformId: title.npCommunicationId || title.npTitleId,
    name: title.trophyTitleName,
    coverUrl: title.trophyTitleIconUrl,
    platform: 'playstation',
  };
}

module.exports = { getAccessToken, getLibrary, mapTitle };
```

### PSN sync route

```javascript
// backend/src/routes/psn.js

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');
const psn = require('../lib/psn');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/sync/psn/connect
router.post('/connect', requireAuth, async (req, res) => {
  const { npsso } = req.body;
  if (!npsso) return res.status(400).json({ error: 'NPSSO token is required' });

  let auth;
  try {
    auth = await psn.getAccessToken(npsso);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid NPSSO token. Make sure you are logged into PlayStation.com before copying it.' });
  }

  await prisma.platformConnection.upsert({
    where: { userId_platform: { userId: req.user.userId, platform: 'playstation' } },
    create: {
      userId: req.user.userId,
      platform: 'playstation',
      psnAccessToken: auth.accessToken,
      psnRefreshToken: auth.refreshToken,
      psnTokenExpiresAt: new Date(Date.now() + auth.expiresIn * 1000),
    },
    update: {
      psnAccessToken: auth.accessToken,
      psnRefreshToken: auth.refreshToken,
      psnTokenExpiresAt: new Date(Date.now() + auth.expiresIn * 1000),
    },
  });

  const result = await runPsnSync(req.user.userId);
  res.json(result);
});

// POST /api/sync/psn/sync
router.post('/sync', requireAuth, async (req, res) => {
  const result = await runPsnSync(req.user.userId);
  res.json(result);
});

async function runPsnSync(userId) {
  const connection = await prisma.platformConnection.findUnique({
    where: { userId_platform: { userId, platform: 'playstation' } },
  });
  if (!connection) throw new Error('PlayStation not connected');

  // Use stored access token (psn-api handles refresh internally in newer versions)
  const auth = { accessToken: connection.psnAccessToken };

  const titles = await psn.getLibrary(auth);
  let newCount = 0;
  let updatedCount = 0;

  for (const title of titles) {
    const mapped = psn.mapTitle(title);
    if (!mapped.platformId || !mapped.name) continue;

    const game = await prisma.game.upsert({
      where: { platform_platformId: { platform: 'playstation', platformId: mapped.platformId } },
      create: {
        platform: 'playstation',
        platformId: mapped.platformId,
        name: mapped.name,
        coverUrl: mapped.coverUrl,
      },
      update: { name: mapped.name, coverUrl: mapped.coverUrl },
    });

    const existing = await prisma.userGame.findUnique({
      where: { userId_gameId: { userId, gameId: game.id } },
    });

    // PSN doesn't give precise last-played dates, so we use earnedTrophies as a signal
    const hasTrophies = (title.earnedTrophies?.bronze + title.earnedTrophies?.silver +
      title.earnedTrophies?.gold + title.earnedTrophies?.platinum) > 0;

    if (!existing) {
      await prisma.userGame.create({
        data: {
          userId,
          gameId: game.id,
          // PSN library = owned games, treat as backlog unless has recent trophies
          status: hasTrophies ? 'backlog' : 'backlog',
        },
      });
      newCount++;
    } else {
      updatedCount++;
      // Don't override user-set statuses on existing games
    }
  }

  await prisma.platformConnection.update({
    where: { userId_platform: { userId, platform: 'playstation' } },
    data: { lastSyncedAt: new Date() },
  });

  return {
    success: true,
    message: `Sync complete. ${newCount} new PlayStation games added, ${updatedCount} updated.`,
    newCount,
    updatedCount,
  };
}

module.exports = router;
```

---

## 10. Game Library API

```javascript
// backend/src/routes/games.js

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const VALID_STATUSES = ['playing', 'finished', 'abandoned', 'backlog', 'wishlist', 'hold'];

// GET /api/games — fetch library, optionally filtered by status
router.get('/', requireAuth, async (req, res) => {
  const { status, platform } = req.query;

  const where = {
    userId: req.user.userId,
    ...(status ? { status } : {}),
  };

  const userGames = await prisma.userGame.findMany({
    where,
    include: { game: true },
    orderBy: { updatedAt: 'desc' },
  });

  // Filter by platform if requested
  const filtered = platform
    ? userGames.filter(ug => ug.game.platform === platform)
    : userGames;

  // Flatten for easier consumption by the frontend
  const result = filtered.map(ug => ({
    id: ug.id,
    gameId: ug.gameId,
    name: ug.game.name,
    platform: ug.game.platform,
    platformId: ug.game.platformId,
    coverUrl: ug.game.coverUrl,
    status: ug.status,
    rating: ug.rating,
    playtimeMinutes: ug.playtimeMinutes,
    lastPlayedAt: ug.lastPlayedAt,
    notes: ug.notes,
    isManual: ug.isManual,
    updatedAt: ug.updatedAt,
  }));

  res.json(result);
});

// GET /api/games/stats — summary counts
router.get('/stats', requireAuth, async (req, res) => {
  const userGames = await prisma.userGame.findMany({
    where: { userId: req.user.userId },
    select: { status: true, rating: true, playtimeMinutes: true },
  });

  const counts = VALID_STATUSES.reduce((acc, s) => {
    acc[s] = userGames.filter(g => g.status === s).length;
    return acc;
  }, {});

  const rated = userGames.filter(g => g.rating !== null);
  const avgRating = rated.length
    ? Math.round((rated.reduce((a, g) => a + g.rating, 0) / rated.length) * 10) / 10
    : null;

  const totalHours = Math.round(
    userGames.reduce((a, g) => a + (g.playtimeMinutes || 0), 0) / 60
  );

  res.json({ counts, totalGames: userGames.length, avgRating, totalHours });
});

// PATCH /api/games/:id — update status, rating, notes
router.patch('/:id', requireAuth, async (req, res) => {
  const { status, rating, notes } = req.body;

  const userGame = await prisma.userGame.findUnique({ where: { id: req.params.id } });
  if (!userGame || userGame.userId !== req.user.userId) {
    return res.status(404).json({ error: 'Game not found' });
  }

  const updates = {};
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    updates.status = status;
  }
  if (rating !== undefined) {
    if (rating !== null && (rating < 0 || rating > 10)) {
      return res.status(400).json({ error: 'Rating must be between 0 and 10' });
    }
    updates.rating = rating;
  }
  if (notes !== undefined) updates.notes = notes;

  const updated = await prisma.userGame.update({
    where: { id: req.params.id },
    data: updates,
    include: { game: true },
  });

  res.json(updated);
});

// POST /api/games — manually add a game
router.post('/', requireAuth, async (req, res) => {
  const { name, platform, status, coverUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  // Manual games use a generated platformId so they don't clash with real API data
  const platformId = `manual_${Date.now()}`;
  const game = await prisma.game.create({
    data: {
      platform: platform || 'other',
      platformId,
      name,
      coverUrl: coverUrl || null,
    },
  });

  const userGame = await prisma.userGame.create({
    data: {
      userId: req.user.userId,
      gameId: game.id,
      status: status || 'backlog',
      isManual: true,
    },
    include: { game: true },
  });

  res.json(userGame);
});

// DELETE /api/games/:id — remove from library
router.delete('/:id', requireAuth, async (req, res) => {
  const userGame = await prisma.userGame.findUnique({ where: { id: req.params.id } });
  if (!userGame || userGame.userId !== req.user.userId) {
    return res.status(404).json({ error: 'Game not found' });
  }
  await prisma.userGame.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
```

---

## 11. Frontend Setup

```bash
cd frontend
npm install axios react-router-dom
npm install -D vite-plugin-pwa
```

### API client

```javascript
// frontend/src/api/client.js

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE_URL });

// Attach JWT to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('stash_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  r => r,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('stash_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email, password) =>
  api.post('/api/auth/login', { email, password }).then(r => r.data);
export const register = (email, password) =>
  api.post('/api/auth/register', { email, password }).then(r => r.data);
export const getMe = () => api.get('/api/auth/me').then(r => r.data);

// Games
export const getGames = (params) => api.get('/api/games', { params }).then(r => r.data);
export const getStats = () => api.get('/api/games/stats').then(r => r.data);
export const updateGame = (id, data) => api.patch(`/api/games/${id}`, data).then(r => r.data);
export const addGame = (data) => api.post('/api/games', data).then(r => r.data);
export const deleteGame = (id) => api.delete(`/api/games/${id}`).then(r => r.data);

// Sync
export const connectSteam = (steamApiKey, steamId) =>
  api.post('/api/sync/steam/connect', { steamApiKey, steamId }).then(r => r.data);
export const syncSteam = () => api.post('/api/sync/steam/sync').then(r => r.data);
export const connectPsn = (npsso) =>
  api.post('/api/sync/psn/connect', { npsso }).then(r => r.data);
export const syncPsn = () => api.post('/api/sync/psn/sync').then(r => r.data);
```

### App.jsx with routing

```jsx
// frontend/src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Library from './pages/Library';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('stash_token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Library /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Login page

```jsx
// frontend/src/pages/Login.jsx

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/client';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fn = mode === 'login' ? login : register;
      const { token } = await fn(email, password);
      localStorage.setItem('stash_token', token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Stash</h1>
        <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '14px' }}>Your game library, synced.</p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '16px' }}
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required minLength={8}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '16px' }}
          />
          {error && <p style={{ color: '#ef4444', fontSize: '14px' }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ padding: '12px', background: '#111827', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>
            {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: '1rem', fontSize: '14px', color: '#6b7280', textAlign: 'center' }}>
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            style={{ background: 'none', border: 'none', color: '#111827', cursor: 'pointer', fontWeight: '500' }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
```

### Library page

This is the main app. Wire the prototype UI we built earlier to the real API:

```jsx
// frontend/src/pages/Library.jsx

import { useState, useEffect, useCallback } from 'react';
import { getGames, getStats, updateGame, addGame, syncSteam, syncPsn } from '../api/client';
import PlatformConnect from '../components/PlatformConnect';
import GameCard from '../components/GameCard';

const STATUSES = [
  { key: 'playing', label: 'Playing' },
  { key: 'finished', label: 'Finished' },
  { key: 'abandoned', label: 'Abandoned' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'wishlist', label: 'Wishlist' },
  { key: 'hold', label: 'On hold' },
];

export default function Library() {
  const [games, setGames] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeStatus, setActiveStatus] = useState('playing');
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [syncing, setSyncing] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [g, s] = await Promise.all([getGames(), getStats()]);
    setGames(g);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleStatusChange(gameId, status) {
    setGames(prev => prev.map(g => g.id === gameId ? { ...g, status } : g));
    await updateGame(gameId, { status });
  }

  async function handleRating(gameId, rating) {
    setGames(prev => prev.map(g => g.id === gameId ? { ...g, rating } : g));
    await updateGame(gameId, { rating });
  }

  async function handleSync(platform) {
    setSyncing(platform);
    try {
      if (platform === 'steam') await syncSteam();
      else await syncPsn();
      await loadData();
    } finally {
      setSyncing('');
    }
  }

  async function handleAddGame(name) {
    if (!name.trim()) return;
    const game = await addGame({ name, status: activeStatus });
    setGames(prev => [game, ...prev]);
  }

  function logout() {
    localStorage.removeItem('stash_token');
    window.location.href = '/login';
  }

  const filtered = games.filter(g => g.status === activeStatus);

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '600' }}>Stash</h1>
          <p style={{ color: '#6b7280', fontSize: '13px' }}>{stats?.totalGames || 0} games tracked</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowConnect(true)}
            style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px' }}>
            Platforms
          </button>
          <button onClick={logout}
            style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', color: '#6b7280' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total', val: stats.totalGames },
            { label: 'Finished', val: stats.counts.finished },
            { label: 'Avg rating', val: stats.avgRating ? `${stats.avgRating}/10` : '–' },
            { label: 'Hours', val: stats.totalHours ? `${stats.totalHours.toLocaleString()}h` : '0h' },
          ].map(m => (
            <div key={m.label} style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>{m.label}</div>
              <div style={{ fontSize: '20px', fontWeight: '600' }}>{m.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Status tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '1.25rem', overflowX: 'auto' }}>
        {STATUSES.map(s => (
          <button key={s.key} onClick={() => setActiveStatus(s.key)}
            style={{
              background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer',
              fontSize: '13px', whiteSpace: 'nowrap',
              borderBottom: activeStatus === s.key ? '2px solid #111827' : '2px solid transparent',
              color: activeStatus === s.key ? '#111827' : '#6b7280',
              fontWeight: activeStatus === s.key ? '600' : '400',
              marginBottom: '-1px',
            }}>
            {s.label}
            {stats?.counts[s.key] > 0 && (
              <span style={{ marginLeft: '5px', fontSize: '11px', color: '#9ca3af' }}>
                {stats.counts[s.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Game grid */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem 0' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#9ca3af' }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Nothing here yet</p>
          <p style={{ fontSize: '13px' }}>Connect a platform or add games manually</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
          {filtered.map(g => (
            <GameCard
              key={g.id}
              game={g}
              onStatusChange={handleStatusChange}
              onRate={handleRating}
            />
          ))}
        </div>
      )}

      {/* Platform connect modal */}
      {showConnect && (
        <PlatformConnect
          onClose={() => setShowConnect(false)}
          onSync={handleSync}
          syncing={syncing}
        />
      )}
    </div>
  );
}
```

### GameCard component

```jsx
// frontend/src/components/GameCard.jsx

import { useState } from 'react';

const STATUSES = ['playing', 'finished', 'abandoned', 'backlog', 'wishlist', 'hold'];
const STATUS_COLORS = {
  playing: '#10b981', finished: '#3b82f6', abandoned: '#ef4444',
  backlog: '#6b7280', wishlist: '#f59e0b', hold: '#8b5cf6',
};

export default function GameCard({ game, onStatusChange, onRate }) {
  const [showStatus, setShowStatus] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const [imgError, setImgError] = useState(false);

  const playtimeHours = game.playtimeMinutes ? Math.round(game.playtimeMinutes / 60) : null;

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
      {/* Cover image */}
      {game.coverUrl && !imgError ? (
        <img src={game.coverUrl} alt={game.name} onError={() => setImgError(true)}
          style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '2/3', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', padding: '8px' }}>{game.name}</span>
        </div>
      )}

      <div style={{ padding: '8px' }}>
        <p style={{ fontSize: '11px', fontWeight: '600', lineHeight: '1.3', marginBottom: '4px',
          overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {game.name}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af', marginBottom: '6px' }}>
          <span>{playtimeHours ? `${playtimeHours}h` : '–'}</span>
          <span style={{ textTransform: 'capitalize' }}>{game.platform}</span>
        </div>

        {/* Rating */}
        {showRating ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '6px' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n}
                onClick={() => { onRate(game.id, n); setShowRating(false); }}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '1px',
                  color: (hoverRating || game.rating || 0) >= n ? '#f59e0b' : '#d1d5db',
                }}>★</button>
            ))}
          </div>
        ) : (
          <button onClick={() => setShowRating(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px',
              color: game.rating ? '#f59e0b' : '#9ca3af', padding: 0, marginBottom: '6px', display: 'block' }}>
            {game.rating ? `★ ${game.rating}/10` : 'Rate'}
          </button>
        )}

        {/* Status dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowStatus(!showStatus)}
            style={{ width: '100%', padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: '6px',
              background: 'white', fontSize: '10px', cursor: 'pointer', textAlign: 'left',
              color: STATUS_COLORS[game.status] || '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ textTransform: 'capitalize' }}>{game.status}</span>
            <span>▾</span>
          </button>
          {showStatus && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'white',
              border: '1px solid #e5e7eb', borderRadius: '8px', zIndex: 10, overflow: 'hidden', marginBottom: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {STATUSES.map(s => (
                <button key={s} onClick={() => { onStatusChange(game.id, s); setShowStatus(false); }}
                  style={{ width: '100%', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: '11px', textAlign: 'left', color: STATUS_COLORS[s],
                    fontWeight: game.status === s ? '600' : '400' }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### PlatformConnect component

```jsx
// frontend/src/components/PlatformConnect.jsx

import { useState } from 'react';
import { connectSteam, connectPsn } from '../api/client';

export default function PlatformConnect({ onClose, onSync, syncing }) {
  const [activeTab, setActiveTab] = useState('steam');
  const [steamKey, setSteamKey] = useState('');
  const [steamId, setSteamId] = useState('');
  const [npsso, setNpsso] = useState('');
  const [connecting, setConnecting] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSteamConnect() {
    setConnecting('steam'); setMessage(''); setError('');
    try {
      const result = await connectSteam(steamKey, steamId);
      setMessage(result.message);
    } catch (e) {
      setError(e.response?.data?.error || 'Connection failed');
    } finally {
      setConnecting('');
    }
  }

  async function handlePsnConnect() {
    setConnecting('psn'); setMessage(''); setError('');
    try {
      const result = await connectPsn(npsso);
      setMessage(result.message);
    } catch (e) {
      setError(e.response?.data?.error || 'Connection failed');
    } finally {
      setConnecting('');
    }
  }

  const cardStyle = {
    background: 'white', borderRadius: '16px', padding: '1.5rem',
    width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '17px', fontWeight: '600' }}>Connect platforms</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9ca3af' }}>×</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
          {['steam', 'playstation'].map(p => (
            <button key={p} onClick={() => { setActiveTab(p); setMessage(''); setError(''); }}
              style={{ flex: 1, padding: '8px', border: '1px solid', borderColor: activeTab === p ? '#111827' : '#e5e7eb',
                borderRadius: '8px', background: activeTab === p ? '#111827' : 'white',
                color: activeTab === p ? 'white' : '#6b7280', cursor: 'pointer', fontSize: '13px',
                fontWeight: activeTab === p ? '600' : '400', textTransform: 'capitalize' }}>
              {p === 'playstation' ? 'PlayStation' : 'Steam'}
            </button>
          ))}
        </div>

        {activeTab === 'steam' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#374151', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                Steam Web API key
              </label>
              <input value={steamKey} onChange={e => setSteamKey(e.target.value)}
                placeholder="Get from steamcommunity.com/dev/apikey"
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#374151', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                Steam ID (17 digits)
              </label>
              <input value={steamId} onChange={e => setSteamId(e.target.value)}
                placeholder="76561198XXXXXXXXX"
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }} />
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                Find yours at steamid.io — paste your profile URL
              </p>
            </div>
            {message && <p style={{ fontSize: '13px', color: '#10b981', background: '#f0fdf4', padding: '10px', borderRadius: '8px' }}>{message}</p>}
            {error && <p style={{ fontSize: '13px', color: '#ef4444', background: '#fef2f2', padding: '10px', borderRadius: '8px' }}>{error}</p>}
            <button onClick={handleSteamConnect} disabled={!!connecting || !steamKey || !steamId}
              style={{ padding: '12px', background: '#1b2838', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', opacity: connecting ? 0.6 : 1 }}>
              {connecting === 'steam' ? 'Connecting...' : 'Connect Steam'}
            </button>
          </div>
        )}

        {activeTab === 'playstation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: '1.6', color: '#374151' }}>
              <strong>How to get your NPSSO token:</strong>
              <ol style={{ marginTop: '8px', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>Log into <a href="https://www.playstation.com" target="_blank" rel="noreferrer" style={{ color: '#003087' }}>playstation.com</a> in your browser</li>
                <li>Open a new tab and go to:<br/>
                  <code style={{ fontSize: '11px', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '2px', wordBreak: 'break-all' }}>
                    https://ca.account.sony.com/api/v1/ssocookie
                  </code>
                </li>
                <li>Copy the value next to <code style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: '3px' }}>npsso</code></li>
                <li>Paste it below</li>
              </ol>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#374151', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                NPSSO token
              </label>
              <input value={npsso} onChange={e => setNpsso(e.target.value)}
                type="password" placeholder="Paste your NPSSO token here"
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }} />
            </div>
            {message && <p style={{ fontSize: '13px', color: '#10b981', background: '#f0fdf4', padding: '10px', borderRadius: '8px' }}>{message}</p>}
            {error && <p style={{ fontSize: '13px', color: '#ef4444', background: '#fef2f2', padding: '10px', borderRadius: '8px' }}>{error}</p>}
            <button onClick={handlePsnConnect} disabled={!!connecting || !npsso}
              style={{ padding: '12px', background: '#003087', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', opacity: connecting ? 0.6 : 1 }}>
              {connecting === 'psn' ? 'Connecting...' : 'Connect PlayStation'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 12. PWA Configuration

This makes the app installable on mobile.

```javascript
// frontend/vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Stash — Game Library',
        short_name: 'Stash',
        description: 'Track your games across Steam and PlayStation',
        theme_color: '#111827',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cache the app shell so it loads offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.akamai\.steamstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'steam-covers',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
            },
          },
        ],
      },
    }),
  ],
});
```

### Create PWA icons

You need two icon files in `frontend/public/icons/`:

- `icon-192.png` (192×192 pixels)
- `icon-512.png` (512×512 pixels)

Use any image editor (or [realfavicongenerator.net](https://realfavicongenerator.net)) to create these from a logo or screenshot of the app. A simple dark square with a game controller icon works well.

---

## 13. Core UI Components

Your `frontend/src/main.jsx` should look like this to add some global base styles:

```jsx
// frontend/src/main.jsx

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Global reset
const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; -webkit-tap-highlight-color: transparent; }
  button { font-family: inherit; }
  input, textarea { font-family: inherit; outline: none; }
  input:focus { border-color: #111827 !important; }
  a { color: inherit; }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
);
```

### Frontend `.env`

```env
VITE_API_URL=http://localhost:3001
```

When deployed, you'll change this to your Railway backend URL.

---

## 14. Platform Connection Flows

Here's the complete user-facing flow for each platform, so you know what to build and test:

### Steam flow

```
User clicks "Platforms" → opens modal → clicks Steam tab
→ user visits steamcommunity.com/dev/apikey (gets key)
→ user visits steamid.io (gets their Steam ID)
→ enters both fields → clicks Connect Steam
→ backend validates credentials → pulls owned games + recent + wishlist
→ response shows "X new games added"
→ library auto-populates
```

### PlayStation flow

```
User clicks "Platforms" → opens modal → clicks PlayStation tab
→ user opens PlayStation.com in same browser, logs in
→ user opens: https://ca.account.sony.com/api/v1/ssocookie in same browser
→ JSON page shows: {"npsso":"XXXXXXXX..."}
→ user copies that value → pastes into app
→ backend exchanges NPSSO for access token
→ pulls PSN game library (trophy titles)
→ response shows "X new games added"
```

---

## 15. Deployment

### Step 1 — Push to GitHub

```bash
cd stash
git init
echo "node_modules\n.env\n.DS_Store\ndist" > .gitignore
git add .
git commit -m "Initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/stash.git
git push -u origin main
```

### Step 2 — Deploy backend on Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo → select your stash repo**
3. When it asks which folder, choose `backend`
4. Railway will auto-detect it's a Node app and deploy it
5. Click **Add Plugin → PostgreSQL** — Railway provisions a database and sets `DATABASE_URL` automatically

**Set environment variables on Railway** (Settings → Variables):

```
JWT_SECRET=your-generated-secret
FRONTEND_URL=https://your-vercel-app.vercel.app
NODE_ENV=production
```

6. After deployment, run the database migration. Go to your Railway service → **Shell** tab, and run:

```bash
npx prisma db push
```

7. Note your Railway backend URL — it looks like `https://stash-production-XXXX.up.railway.app`

### Step 3 — Deploy frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New → Project → Import your stash repo**
3. Set **Root Directory** to `frontend`
4. Set **Framework Preset** to Vite
5. Add environment variable:
   ```
   VITE_API_URL=https://stash-production-XXXX.up.railway.app
   ```
6. Click **Deploy**
7. Note your Vercel URL — go back to Railway and update `FRONTEND_URL` to this Vercel URL

### Step 4 — Update CORS

Once both are deployed, update your backend `.env` on Railway with the real Vercel URL. The CORS middleware in `server.js` reads from `FRONTEND_URL`, so this is all that's needed.

---

## 16. Mobile Installation

### Android (Chrome)

1. Open Chrome on your Android phone
2. Navigate to your Vercel URL
3. Log in and use the app briefly (Chrome waits until engagement)
4. A banner appears at the bottom: **"Add Stash to Home Screen"** — tap it
5. Or: tap the three-dot menu → **Add to Home Screen**
6. The app installs with your 192×192 icon and opens in standalone mode (no browser UI)

Android's PWA support is excellent — it behaves essentially like a native app, including working offline.

### iPhone (Safari)

iOS only supports PWA installation through Safari, not Chrome.

1. Open **Safari** on your iPhone (not Chrome, not Firefox)
2. Navigate to your Vercel URL
3. Log in
4. Tap the **Share button** (box with arrow pointing up, in the bottom toolbar)
5. Scroll down in the share sheet and tap **Add to Home Screen**
6. Edit the name if you want, then tap **Add**

The app appears on your home screen and opens full-screen without Safari's address bar.

**iOS notes:**
- Works great on iOS 16.4+ (which covers the vast majority of active iPhones as of 2024)
- The app icon uses your 512×512 PNG — make sure it looks good at small sizes
- Push notifications are supported on iOS 16.4+ for PWAs, though we haven't built that yet

---

## 17. Keeping Things in Sync

### Manual sync on demand

The current setup requires the user to tap a Sync button. In `Library.jsx`, call `syncSteam()` or `syncPsn()` whenever the user wants fresh data. Add a visible button:

```jsx
<button onClick={() => handleSync('steam')} disabled={syncing === 'steam'}
  style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px' }}>
  {syncing === 'steam' ? 'Syncing...' : '↻ Sync Steam'}
</button>
```

### Automatic background sync (optional enhancement)

Add a cron job on Railway to trigger sync every 24 hours. Install `node-cron`:

```bash
npm install node-cron
```

Add to `server.js`:

```javascript
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

// Run sync for all users at 3am every night
cron.schedule('0 3 * * *', async () => {
  const prisma = new PrismaClient();
  const steamConnections = await prisma.platformConnection.findMany({
    where: { platform: 'steam' },
  });

  for (const conn of steamConnections) {
    try {
      // Import and call your runSteamSync function
      await runSteamSync(conn.userId);
      console.log(`Auto-synced Steam for user ${conn.userId}`);
    } catch (e) {
      console.error(`Auto-sync failed for user ${conn.userId}:`, e.message);
    }
  }
});
```

To use this, extract `runSteamSync` from `routes/steam.js` into a separate `lib/steamSync.js` so both the route and the cron job can import it.

---

## 18. What to Build Next

Once the core is working, here are the most impactful additions in rough priority order:

**Auto-refresh on app open** — call sync when the user opens the app after a long gap (check `lastSyncedAt` vs now on `/api/auth/me`).

**Search and filter** — add a search bar and genre/platform filters to the library view.

**Notes per game** — the `notes` field is already in the DB. Add a tappable notes area on the game detail view.

**Game detail page** — a full-screen view with cover art, stats, and notes. Route it to `/game/:id`.

**Xbox integration** — use [OpenXBL](https://xbl.io) (free tier available) for Xbox library data. Same pattern as Steam.

**PC Game Pass tracking** — Game Pass doesn't expose an API, but you can let users paste their library manually.

**Push notifications** — remind yourself to play a wishlist game when it goes on sale (Steam price API) or nudge a game you haven't touched in 30 days.

**Export to CSV** — a single `GET /api/games/export` endpoint that returns a CSV. Useful for personal analytics.

**Stats page** — charts of games by genre, playtime distribution, rating histogram. Given your background, this is the most natural extension and the part that would make Stash genuinely different from Backloggd.

---

## Quick Reference — Local Development

```bash
# Terminal 1 — Start backend (from stash/backend)
npm run dev

# Terminal 2 — Start frontend (from stash/frontend)
npm run dev

# Backend runs at: http://localhost:3001
# Frontend runs at: http://localhost:5173

# If you change the DB schema:
npx prisma db push

# Browse your DB visually:
npx prisma studio

# Test the API without the frontend:
curl http://localhost:3001/api/health
```

---

*Built with: Node.js, Express, Prisma, PostgreSQL, React, Vite, vite-plugin-pwa*
*Deployed on: Railway (backend + DB) + Vercel (frontend)*
