import { useEffect, useState } from 'react';
import { BookOpen, Plus, RefreshCw, Archive } from 'lucide-react';
import { api } from '../services/api';
import MessageContent from './MessageContent';

export default function ForumChannelView({ channelId, channelName, topic }: { channelId: string; channelName: string; topic?: string }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setBusy(true);
    const response = await api.getForumPosts(channelId);
    if (response.success) setPosts(response.data || []);
    else setError(response.error || 'Could not load forum posts.');
    setBusy(false);
  };
  useEffect(() => { void load(); }, [channelId]);

  const create = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true); setError('');
    const response = await api.createForumPost(channelId, {
      title: title.trim(), content: content.trim(),
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 5),
    });
    setBusy(false);
    if (!response.success) return setError(response.error || 'Could not create forum post.');
    setTitle(''); setContent(''); setTags(''); setCreating(false); void load();
  };

  const archive = async (id: string) => {
    const response = await api.updateForumPost(id, { isArchived: true });
    if (!response.success) setError(response.error || 'Could not archive post.');
    else void load();
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-dc-chat">
      <header className="h-12 px-4 flex items-center gap-2 border-b border-dc-divider/30 shrink-0">
        <BookOpen className="w-5 h-5 text-dc-text-muted" />
        <h2 className="font-bold text-white">{channelName}</h2>
        {topic && <span className="text-xs text-dc-text-muted truncate ml-2">{topic}</span>}
        <button onClick={() => void load()} className="ml-auto p-2 rounded hover:bg-dc-hover" title="Refresh"><RefreshCw size={15} /></button>
        <button onClick={() => setCreating((value) => !value)} className="rounded-lg bg-dc-brand px-3 py-1.5 text-xs font-semibold text-white flex items-center gap-1"><Plus size={14} /> New post</button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-5xl w-full mx-auto">
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {creating && <section className="rounded-xl border border-dc-divider bg-dc-sidebar p-4 space-y-3">
          <h3 className="font-semibold">Create a forum post</h3>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" className="w-full rounded-lg bg-dc-input p-3 text-sm" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Start the discussion…" className="w-full min-h-32 rounded-lg bg-dc-input p-3 text-sm" />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, separated by commas" className="w-full rounded-lg bg-dc-input p-3 text-sm" />
          <div className="flex gap-2"><button disabled={busy || !title.trim() || !content.trim()} onClick={() => void create()} className="rounded-lg bg-dc-brand px-4 py-2 text-sm text-white disabled:opacity-50">Publish</button><button onClick={() => setCreating(false)} className="rounded-lg bg-dc-hover px-4 py-2 text-sm">Cancel</button></div>
        </section>}
        {posts.map((post) => <article key={post.id} className="rounded-xl border border-dc-divider bg-dc-sidebar/60 p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{post.title}</h3><p className="text-[11px] text-dc-text-muted mt-1">{new Date(post.createdAt).toLocaleString()} {post.isPinned ? '· Pinned' : ''} {post.isLocked ? '· Locked' : ''}</p></div><button onClick={() => void archive(post.id)} title="Archive post" className="p-2 text-dc-text-muted hover:text-dc-text"><Archive size={15} /></button></div>
          {post.tags?.length > 0 && <div className="flex gap-1 flex-wrap mt-2">{post.tags.map((tag: string) => <span key={tag} className="rounded-full bg-dc-hover px-2 py-1 text-[10px] text-dc-text-muted">{tag}</span>)}</div>}
          <div className="text-sm text-dc-text mt-3 whitespace-pre-wrap"><MessageContent content={post.content} /></div>
        </article>)}
        {!busy && posts.length === 0 && <div className="text-center py-16 text-sm text-dc-text-muted">No discussions yet. Start the first one.</div>}
        {busy && <p className="text-xs text-dc-text-muted">Loading forum…</p>}
      </div>
    </div>
  );
}
