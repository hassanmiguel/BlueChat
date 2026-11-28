import { useEffect, useState } from 'react';
import { CalendarDays, Bookmark, Clock3, Bot, X, Plus, RefreshCw, Trash2, Copy } from 'lucide-react';
import { api } from '../services/api';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';

type Tab = 'events' | 'saved' | 'scheduled' | 'developers';

export default function CommunityHubPage() {
  const activeServerId = useChatStore((s) => s.activeServerId);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const servers = useChatStore((s) => s.servers);
  const setShowCommunityHub = useUIStore((s) => s.setShowCommunityHub);
  const [tab, setTab] = useState<Tab>('events');
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [appName, setAppName] = useState('');
  const [token, setToken] = useState('');
  const [installAppId, setInstallAppId] = useState('');
  const [installations, setInstallations] = useState<any[]>([]);
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  const activeServer = servers.find((server) => server.id === activeServerId);

  const load = async () => {
    setBusy(true);
    setError('');
    let response: any;
    if (tab === 'events') {
      if (!activeServerId) { setItems([]); setBusy(false); return; }
      response = await api.getServerEvents(activeServerId);
    } else if (tab === 'saved') {
      response = await api.getSavedMessages();
    } else if (tab === 'scheduled') {
      response = await api.getScheduledMessages();
    } else {
      const [applications, installed] = await Promise.all([
        api.getBotApplications(),
        activeServerId ? api.getBotInstallations(activeServerId) : Promise.resolve({ success: true, data: [] } as any),
      ]);
      response = applications;
      if (installed.success) setInstallations(Array.isArray(installed.data) ? installed.data : []);
    }
    if (response.success) {
      setItems(Array.isArray(response.data) ? response.data : []);
    } else {
      setError(response.error || 'Unable to load this section.');
      setItems([]);
    }
    setBusy(false);
  };

  useEffect(() => { void load(); }, [tab, activeServerId]);

  const summarizeActiveChannel = async () => {
    if (!activeServerId || !activeChannelId) return;
    setSummarizing(true); setError(''); setSummary('');
    const response = await api.summarizeChannel(activeServerId, activeChannelId);
    setSummarizing(false);
    if (!response.success) setError(response.error || 'AI summary is unavailable. Enable it in server settings and configure a provider.');
    else setSummary(response.data?.summary || '');
  };

  const createEvent = async () => {
    if (!activeServerId || !title.trim() || !startsAt) return;
    setBusy(true);
    const response = await api.createServerEvent(activeServerId, {
      title: title.trim(), description: description.trim() || undefined,
      startsAt: new Date(startsAt).toISOString(),
    });
    setBusy(false);
    if (!response.success) return setError(response.error || 'Could not create event. Check Manage Events permission.');
    setTitle(''); setDescription(''); setStartsAt(''); setNotice('Event created.'); void load();
  };

  const createApplication = async () => {
    if (!appName.trim()) return;
    setBusy(true);
    const response = await api.createBotApplication({ name: appName.trim() });
    setBusy(false);
    if (!response.success) return setError(response.error || 'Could not create application.');
    setAppName(''); setNotice('Developer application created.'); void load();
  };

  const installApplication = async () => {
    if (!activeServerId || !installAppId.trim()) return;
    setBusy(true);
    const response = await api.installBot(activeServerId, installAppId.trim());
    setBusy(false);
    if (!response.success) return setError(response.error || 'Could not install application. Check Manage Server permission and application visibility.');
    setInstallAppId(''); setNotice('Bot installed in this server.'); void load();
  };

  const issueToken = async (applicationId: string) => {
    setBusy(true);
    const response = await api.createBotToken(applicationId, ['read_messages', 'send_messages']);
    setBusy(false);
    if (!response.success) return setError(response.error || 'Could not issue token.');
    setToken(response.data?.token || '');
    setNotice('Token created. Copy it now; it is only shown once.');
    void load();
  };

  const cancelSchedule = async (id: string) => {
    const response = await api.cancelScheduledMessage(id);
    if (!response.success) setError(response.error || 'Could not cancel scheduled message.');
    else { setNotice('Scheduled message cancelled.'); void load(); }
  };

  const rsvp = async (eventId: string, status: 'GOING' | 'INTERESTED' | 'NOT_GOING') => {
    const response = await api.rsvpEvent(eventId, status);
    if (!response.success) setError(response.error || 'Could not update RSVP.');
    else void load();
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'events', label: 'Events', icon: CalendarDays },
    { id: 'saved', label: 'Saved', icon: Bookmark },
    { id: 'scheduled', label: 'Scheduled', icon: Clock3 },
    { id: 'developers', label: 'Developer apps', icon: Bot },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCommunityHub(false); }}>
      <section className="w-full max-w-5xl h-[min(760px,92vh)] bg-dc-dark border border-dc-divider rounded-2xl shadow-2xl overflow-hidden flex flex-col text-dc-text">
        <header className="flex items-center justify-between px-5 py-4 border-b border-dc-divider">
          <div>
            <h1 className="text-lg font-bold">Community Hub</h1>
            <p className="text-xs text-dc-text-muted">{activeServer?.name || 'Personal tools and developer workspace'}</p>
          </div>
          <div className="flex items-center gap-2">
            {activeServerId && activeChannelId && <button disabled={summarizing} onClick={() => void summarizeActiveChannel()} className="rounded-lg bg-dc-hover px-3 py-2 text-xs disabled:opacity-50">{summarizing ? 'Summarizing…' : 'Summarize channel'}</button>}
            <button onClick={() => void load()} className="p-2 rounded-lg hover:bg-dc-hover" title="Refresh"><RefreshCw size={17} /></button>
            <button onClick={() => setShowCommunityHub(false)} className="p-2 rounded-lg hover:bg-dc-hover" title="Close"><X size={19} /></button>
          </div>
        </header>
        <nav className="flex gap-1 px-4 py-3 border-b border-dc-divider overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setTab(id); setError(''); setNotice(''); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${tab === id ? 'bg-dc-brand text-white' : 'text-dc-text-muted hover:bg-dc-hover'}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
          {notice && <div role="status" className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">{notice}</div>}
          {summary && <section className="rounded-xl border border-dc-brand/40 bg-dc-brand/10 p-4"><h3 className="font-semibold text-sm mb-2">Channel summary</h3><p className="text-sm whitespace-pre-wrap">{summary}</p></section>}
          {token && (
            <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 space-y-2">
              <p className="text-sm font-semibold">New bot token — shown once</p>
              <code className="block break-all text-xs">{token}</code>
              <button onClick={() => navigator.clipboard.writeText(token)} className="inline-flex items-center gap-2 rounded-lg bg-dc-hover px-3 py-2 text-sm"><Copy size={14} /> Copy token</button>
              <button onClick={() => setToken('')} className="ml-2 text-sm text-dc-text-muted">Dismiss</button>
            </div>
          )}
          {tab === 'events' && (
            <>
              {activeServerId ? (
                <div className="rounded-xl border border-dc-divider p-4 space-y-3">
                  <h2 className="font-semibold">Create a server event</h2>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" className="w-full rounded-lg bg-dc-channel border border-dc-divider p-3 text-sm" />
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full rounded-lg bg-dc-channel border border-dc-divider p-3 text-sm min-h-20" />
                  <label className="block text-xs text-dc-text-muted">Start time</label>
                  <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="rounded-lg bg-dc-channel border border-dc-divider p-3 text-sm" />
                  <button disabled={busy || !title.trim() || !startsAt} onClick={() => void createEvent()} className="inline-flex items-center gap-2 rounded-lg bg-dc-brand px-4 py-2 text-sm text-white disabled:opacity-50"><Plus size={15} /> Create event</button>
                </div>
              ) : <p className="text-sm text-dc-text-muted">Select a server to view and create its events.</p>}
              {items.map((event) => (
                <article key={event.id} className="rounded-xl border border-dc-divider p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{event.title}</h3><p className="text-xs text-dc-text-muted mt-1">{new Date(event.startsAt).toLocaleString()}</p>{event.description && <p className="text-sm mt-2 whitespace-pre-wrap">{event.description}</p>}</div><span className="text-xs text-dc-text-muted">{event.rsvps?.length || 0} responses</span></div>
                  <div className="flex gap-2 mt-3">{(['GOING', 'INTERESTED', 'NOT_GOING'] as const).map((status) => <button key={status} onClick={() => void rsvp(event.id, status)} className={`px-3 py-1.5 rounded-lg text-xs ${event.myRsvp === status ? 'bg-dc-brand text-white' : 'bg-dc-hover text-dc-text-muted'}`}>{status.replace('_', ' ')}</button>)}</div>
                </article>
              ))}
            </>
          )}
          {tab === 'saved' && items.map((item) => (
            <article key={item.id} className="rounded-xl border border-dc-divider p-4"><p className="text-xs text-dc-text-muted">#{item.message?.channel?.name || 'channel'} · {item.message?.author?.username || 'Unknown'}</p><p className="text-sm mt-2 whitespace-pre-wrap">{item.message?.content || 'Message unavailable'}</p><button onClick={async () => { const response = await api.unsaveMessage(item.messageId); if (response.success) void load(); }} className="mt-3 text-xs text-red-300">Remove saved message</button></article>
          ))}
          {tab === 'scheduled' && items.map((item) => (
            <article key={item.id} className="rounded-xl border border-dc-divider p-4 flex justify-between gap-3"><div><p className="text-xs text-dc-text-muted">{new Date(item.scheduledAt).toLocaleString()}</p><p className="text-sm mt-1 whitespace-pre-wrap">{item.content}</p><p className="text-xs text-dc-text-muted mt-1">Channel: {item.channelId}</p></div><button onClick={() => void cancelSchedule(item.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-red-300" title="Cancel scheduled message"><Trash2 size={16} /></button></article>
          ))}
          {tab === 'developers' && (
            <>
              <div className="rounded-xl border border-dc-divider p-4 space-y-3"><h2 className="font-semibold">Create a bot application</h2><div className="flex gap-2"><input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Application name" className="flex-1 min-w-0 rounded-lg bg-dc-channel border border-dc-divider p-3 text-sm" /><button disabled={busy || !appName.trim()} onClick={() => void createApplication()} className="rounded-lg bg-dc-brand text-white px-4 text-sm disabled:opacity-50">Create</button></div><p className="text-xs text-dc-text-muted">Tokens are stored as hashes and displayed only once. Never share them.</p></div>
              {activeServerId && <div className="rounded-xl border border-dc-divider p-4 space-y-2"><h3 className="font-semibold text-sm">Install an application in this server</h3><div className="flex gap-2"><input value={installAppId} onChange={(e) => setInstallAppId(e.target.value)} placeholder="Application ID" className="flex-1 min-w-0 rounded-lg bg-dc-channel border border-dc-divider p-2 text-xs" /><button disabled={busy || !installAppId.trim()} onClick={() => void installApplication()} className="rounded-lg bg-dc-brand px-3 py-2 text-xs text-white disabled:opacity-50">Install</button></div>{installations.map((installation) => <div key={installation.id} className="flex items-center justify-between text-xs"><span>{installation.applicationId} · {installation.permissions.join(', ')}</span><button onClick={async () => { const response = await api.uninstallBot(activeServerId, installation.applicationId); if (response.success) void load(); }} className="text-red-300">Uninstall</button></div>)}</div>}
              {items.map((app) => <article key={app.id} className="rounded-xl border border-dc-divider p-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold">{app.name}</h3><p className="text-xs text-dc-text-muted">{app.tokens?.filter((t: any) => !t.revokedAt).length || 0} active tokens</p></div><button disabled={busy} onClick={() => void issueToken(app.id)} className="rounded-lg bg-dc-hover px-3 py-2 text-xs">Issue token</button></article>)}
            </>
          )}
          {!busy && items.length === 0 && tab !== 'events' && tab !== 'developers' && <p className="text-sm text-dc-text-muted text-center py-12">Nothing here yet.</p>}
          {busy && <p className="text-xs text-dc-text-muted">Loading…</p>}
        </main>
      </section>
    </div>
  );
}
