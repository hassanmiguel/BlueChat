import { useState, useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ServerSidebar from './components/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar';
import ChatArea from './components/ChatArea';
import MemberSidebar from './components/MemberSidebar';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const { isAuthenticated } = useAuthStore();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  // If authenticated, show the main app
  if (isAuthenticated) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="h-screen w-screen flex overflow-hidden bg-dc-channel"
      >
        {/* Far Left: Server icons */}
        <ServerSidebar />
        
        {/* Second Left: Channels/DMs */}
        <ChannelSidebar />
        
        {/* Center: Chat Area */}
        <ChatArea />
        
        {/* Far Right: Members */}
        <MemberSidebar />
      </motion.div>
    );
  }

  // If not authenticated, show login/register
  return (
    <AnimatePresence mode="wait">
      {authView === 'login' ? (
        <motion.div
          key="login"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <LoginPage onSwitchToRegister={() => setAuthView('register')} />
        </motion.div>
      ) : (
        <motion.div
          key="register"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
