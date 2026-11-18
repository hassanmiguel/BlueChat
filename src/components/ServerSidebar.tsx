import { motion } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { Plus, Compass, MessageCircle, PhoneCall } from 'lucide-react';

export default function ServerSidebar() {
  const { servers, activeServerId, setActiveServer, setView, view } = useChatStore();
  const { toggleCreateServer, toggleDiscovery, showCalls, setShowCalls } = useUIStore();
  const user = useAuthStore(s => s.user);

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const getServerColor = (id: string) => {
    const colors = ['#5865f2', '#23a559', '#eb459e', '#f0b232', '#da373c', '#00a8fc'];
    const index = id.charCodeAt(id.length - 1) % colors.length;
    return colors[index];
  };

  return (
    <div className="w-[72px] bg-dc-server-bg flex flex-col items-center py-3 gap-2 overflow-y-auto shrink-0">
      {/* Home / DMs button */}
      <div className="server-icon-wrapper relative group">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 bg-white rounded-r-full server-pill" style={{ height: view === 'friends' ? '40px' : '0px' }}></div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setView('friends')}
          className={`server-icon w-12 h-12 rounded-[50%] flex items-center justify-center transition-all ${
            view === 'friends' ? 'rounded-[35%] bg-dc-brand' : 'bg-dc-sidebar hover:bg-dc-brand hover:rounded-[35%]'
          }`}
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </motion.button>
        {/* Tooltip */}
        <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-dc-popout text-white text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none">
          Direct Messages
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-dc-popout rotate-45"></div>
        </div>
      </div>

      {/* Calls */}
      <div className="server-icon-wrapper relative group">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 bg-white rounded-r-full server-pill" style={{ height: showCalls ? '40px' : '0px' }}></div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCalls(!showCalls)}
          className={`server-icon w-12 h-12 rounded-[50%] flex items-center justify-center transition-all ${
            showCalls ? 'rounded-[35%] bg-dc-brand' : 'bg-dc-sidebar hover:bg-dc-brand hover:rounded-[35%]'
          }`}
        >
          <PhoneCall className="w-5 h-5 text-white" />
        </motion.button>
        <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-dc-popout text-white text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none">
          Calls
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-dc-popout rotate-45"></div>
        </div>
      </div>

      {/* Separator */}
      <div className="w-8 h-0.5 bg-dc-divider rounded-full mx-auto"></div>

      {/* Server icons */}
      {servers.map((server) => (
        <div key={server.id} className="server-icon-wrapper relative group">
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 bg-white rounded-r-full server-pill transition-all"
            style={{ height: activeServerId === server.id ? '40px' : '0px' }}
          ></div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveServer(server.id)}
            className={`server-icon w-12 h-12 flex items-center justify-center text-white font-bold text-sm transition-all ${
              activeServerId === server.id ? 'rounded-[35%]' : 'rounded-[50%] hover:rounded-[35%]'
            }`}
            style={{ 
              backgroundColor: activeServerId === server.id ? getServerColor(server.id) : '#313338',
            }}
            onMouseEnter={(e) => {
              if (activeServerId !== server.id) {
                (e.currentTarget as HTMLElement).style.backgroundColor = getServerColor(server.id);
              }
            }}
            onMouseLeave={(e) => {
              if (activeServerId !== server.id) {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#313338';
              }
            }}
          >
            {server.icon ? (
              <img src={server.icon} alt={server.name} className="w-full h-full rounded-[inherit] object-cover" />
            ) : (
              getInitials(server.name)
            )}
          </motion.button>
          {/* Tooltip */}
          <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-dc-popout text-white text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none">
            {server.name}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-dc-popout rotate-45"></div>
          </div>
        </div>
      ))}

      {/* Separator */}
      <div className="w-8 h-0.5 bg-dc-divider rounded-full mx-auto"></div>

      {/* Add Server */}
      <div className="server-icon-wrapper relative group">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleCreateServer}
          className="server-icon w-12 h-12 rounded-[50%] bg-dc-sidebar flex items-center justify-center text-dc-green hover:bg-dc-green hover:text-white hover:rounded-[35%] transition-all"
        >
          <Plus className="w-6 h-6" />
        </motion.button>
        <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-dc-popout text-white text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none">
          Add a Server
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-dc-popout rotate-45"></div>
        </div>
      </div>

      {/* Explore */}
      <div className="server-icon-wrapper relative group">
        <motion.button
          whileHover={{ scale: 1.1, borderRadius: '16px' }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleDiscovery}
          title="Explore servers"
          className="server-icon w-12 h-12 rounded-[50%] bg-dc-sidebar flex items-center justify-center text-dc-green cursor-pointer"
        >
          <Compass className="w-6 h-6" />
        </motion.button>
        <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-dc-popout text-white text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none">
          Explore Servers
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-dc-popout rotate-45"></div>
        </div>
      </div>
    </div>
  );
}
