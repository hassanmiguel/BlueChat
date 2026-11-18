import { useMemo, useState } from 'react';
import {
  ArrowRight, Check, Compass, Hash, Plus, Search, Server as ServerIcon,
  Sparkles, UserPlus, X,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import type { Server } from '../types';
import './discovery.css';

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase() || '?';

function ServerGlyph({ server, size = 'normal' }: { server: Server; size?: 'normal' | 'large' }) {
  const icon = (server.icon || '').trim();
  const isImage = /^(https?:|data:|blob:)/.test(icon);
  const isEmoji = icon.length > 0 && icon.length <= 4 && !/^[a-z0-9]+$/i.test(icon);
  return (
    <span className={`disc-glyph ${size === 'large' ? 'large' : ''}`}>
      {isImage ? (
        <img src={icon} alt="" />
      ) : (
        <span>{isEmoji ? icon : initials(server.name)}</span>
      )}
    </span>
  );
}

export default function DiscoveryPage() {
  const close = useUIStore((s) => s.toggleDiscovery);
  const notify = useUIStore((s) => s.addNotification);
  const toggleCreateServer = useUIStore((s) => s.toggleCreateServer);
  const { servers, setActiveServer, joinServer } = useChatStore();

  const [query, setQuery] = useState('');
  const [invite, setInvite] = useState('');
  const [joining, setJoining] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return servers;
    return servers.filter((server) =>
      `${server.name} ${server.channels.map((c) => c.name).join(' ')}`.toLowerCase().includes(text)
    );
  }, [servers, query]);

  const totalMembers = servers.reduce((sum, server) => sum + (server.memberCount || 0), 0);
  const totalChannels = servers.reduce((sum, server) => sum + (server.channels?.length || 0), 0);

  const openServer = (server: Server) => {
    setActiveServer(server.id);
    close();
  };

  const handleJoin = async () => {
    const code = invite.trim();
    if (!code) {
      notify('Invite needed', 'Paste an invite code or link first.', 'error');
      return;
    }
    setJoining(true);
    const ok = await joinServer(code);
    setJoining(false);
    if (ok) {
      setInvite('');
      notify('You are in', 'The server was added to your list.', 'success');
    } else {
      notify('Could not join', 'Check the invite code and try again.', 'error');
    }
  };

  return (
    <div className="discovery-root">
      <header className="discovery-topbar">
        <div className="discovery-brand"><Compass size={20} /><strong>Discover</strong></div>
        <div className="discovery-topbar-note">Your communities, all in one place.</div>
        <button className="discovery-close" onClick={close} aria-label="Close discovery"><X size={20} /></button>
      </header>

      <div className="discovery-scroll">
        <section className="hero">
          <div className="hero-glow hero-glow-one" />
          <div className="hero-glow hero-glow-two" />
          <div className="hero-inner">
            <span className="hero-kicker"><Sparkles size={14} /> your corner of blueChat</span>
            <h1>Find your people</h1>
            <p>Jump back into a server, follow an invite, or start something new. Everything here is yours.</p>
            <div className="hero-search">
              <Search size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your servers and channels"
                aria-label="Search your servers"
              />
              {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
            </div>
            <div className="hero-actions">
              <button onClick={toggleCreateServer}><Plus size={16} /> Create a server</button>
              <a href="#join-community"><UserPlus size={16} /> Join with an invite</a>
            </div>
          </div>
        </section>

        <div className="discovery-body">
          <div className="stats-strip">
            <div><strong>{servers.length}</strong><span>servers</span></div>
            <div><strong>{totalChannels}</strong><span>channels</span></div>
            <div><strong>{totalMembers}</strong><span>members</span></div>
          </div>

          <section className="section">
            <div className="section-head">
              <div>
                <h2>Your servers</h2>
                <p>{servers.length === 0 ? 'Nothing here yet — that changes today.' : `${filtered.length} ${filtered.length === 1 ? 'server' : 'servers'} ready for you`}</p>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="no-results">
                <ServerIcon size={30} />
                <h3>{servers.length === 0 ? 'No servers yet' : 'Nothing matched that'}</h3>
                <p>{servers.length === 0 ? 'Create one, or join a friend with an invite code.' : 'Try a different name or channel.'}</p>
                {servers.length === 0 && (
                  <button className="primary" onClick={toggleCreateServer}>Create your first server <ArrowRight size={15} /></button>
                )}
              </div>
            ) : (
              <div className="server-grid">
                {filtered.map((server) => (
                  <article className="server-card" key={server.id}>
                    <div className="card-top">
                      <ServerGlyph server={server} />
                      <div className="card-menu-wrap">
                        <button className="card-menu" onClick={() => setOpenMenu(openMenu === server.id ? null : server.id)} aria-label={`Options for ${server.name}`}>···</button>
                        {openMenu === server.id && (
                          <div className="card-menu-pop">
                            <button onClick={() => { openServer(server); setOpenMenu(null); }}>Open server</button>
                            <button onClick={() => { navigator.clipboard?.writeText(server.inviteCode || server.name); setOpenMenu(null); notify('Copied', 'Invite details copied to your clipboard.', 'success'); }}>Copy invite</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <h3>{server.name}</h3>
                    <p className="server-description">
                      {server.channels?.length
                        ? `${server.channels.slice(0, 3).map((c) => `#${c.name}`).join('  ')}${server.channels.length > 3 ? `  +${server.channels.length - 3}` : ''}`
                        : 'No channels yet'}
                    </p>
                    <div className="stats"><span className="dot online" />{server.memberCount || 1} members<span className="dot" />{server.channels?.length || 0} channels</div>
                    <button className="card-open" onClick={() => openServer(server)}>Open <ArrowRight size={14} /></button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="discovery-columns" id="join-community">
            <section className="join-card">
              <div className="join-card-icon"><UserPlus size={21} /></div>
              <h2>Join a community</h2>
              <p>Got an invite? Paste the code or link below and it will show up in your server list.</p>
              <div className="invite-row">
                <input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                  placeholder="Invite code or link"
                  aria-label="Invite code or link"
                />
                <button onClick={handleJoin} disabled={joining || !invite.trim()}>
                  {joining ? 'Joining...' : <><Check size={15} /> Join</>}
                </button>
              </div>
            </section>

            <section className="create-card">
              <div className="create-card-glow" />
              <div className="create-card-content">
                <span className="create-kicker">MAKE IT YOURS</span>
                <h2>Start a new server</h2>
                <p>Pick a name, invite a few friends, and shape the channels however you like.</p>
                <button onClick={toggleCreateServer}><Plus size={16} /> Create a server</button>
              </div>
              <div className="create-card-art"><Hash size={72} /></div>
            </section>
          </div>

          <footer className="discovery-foot">
            <Compass size={15} /> blueChat discover · no demos, just your communities
          </footer>
        </div>
      </div>
    </div>
  );
}
