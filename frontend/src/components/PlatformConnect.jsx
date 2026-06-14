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