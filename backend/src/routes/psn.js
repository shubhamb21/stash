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