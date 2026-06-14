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