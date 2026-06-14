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