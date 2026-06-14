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