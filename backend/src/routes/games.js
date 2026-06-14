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