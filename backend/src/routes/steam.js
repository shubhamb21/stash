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