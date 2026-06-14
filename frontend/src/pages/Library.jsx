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