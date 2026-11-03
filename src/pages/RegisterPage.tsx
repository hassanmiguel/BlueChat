import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { MessageCircle, Eye, EyeOff, Check, X } from 'lucide-react';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

export default function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { register, isLoading } = useAuthStore();

  const passwordChecks = [
    { label: 'At least 8 characters', valid: password.length >= 8 },
    { label: 'Contains a number', valid: /\d/.test(password) },
    { label: 'Contains a letter', valid: /[a-zA-Z]/.test(password) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    const result = await register(username, email, password);
    if (!result) {
      setError('An account with this email already exists');
    } else {
      setSuccess(true);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1b1e 0%, #2b2d31 50%, #1e1f22 100%)' }}>
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full opacity-10"
            style={{
              width: Math.random() * 250 + 50,
              height: Math.random() * 250 + 50,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `radial-gradient(circle, ${['#5865f2', '#23a559', '#00a8fc'][i % 3]} 0%, transparent 70%)`,
            }}
            animate={{
              x: [0, Math.random() * 80 - 40],
              y: [0, Math.random() * 80 - 40],
              scale: [1, 1.3, 1],
            }}
            transition={{
              duration: Math.random() * 8 + 8,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-dc-dark rounded-2xl shadow-2xl p-8 border border-dc-divider/30">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="w-16 h-16 bg-dc-brand rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-dc-brand/30"
            >
              <MessageCircle className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white">Create an account</h1>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-dc-red/10 border border-dc-red/30 rounded-lg p-3 mb-4 text-dc-red text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Success */}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-dc-green/10 border border-dc-green/30 rounded-lg p-3 mb-4 text-dc-green text-sm"
            >
              Account created successfully! Logging you in...
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-dc-text-muted uppercase mb-2 tracking-wide">
                Username <span className="text-dc-red">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-dc-darker border border-dc-divider/50 rounded-lg px-4 py-2.5 text-dc-text placeholder-dc-text-muted/50 focus:border-dc-brand transition-colors"
                placeholder="Choose a username"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-dc-text-muted uppercase mb-2 tracking-wide">
                Email <span className="text-dc-red">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-dc-darker border border-dc-divider/50 rounded-lg px-4 py-2.5 text-dc-text placeholder-dc-text-muted/50 focus:border-dc-brand transition-colors"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-dc-text-muted uppercase mb-2 tracking-wide">
                Password <span className="text-dc-red">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-dc-darker border border-dc-divider/50 rounded-lg px-4 py-2.5 pr-10 text-dc-text placeholder-dc-text-muted/50 focus:border-dc-brand transition-colors"
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dc-text-muted hover:text-dc-text transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {/* Password strength indicators */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  {passwordChecks.map((check, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      {check.valid ? (
                        <Check className="w-3.5 h-3.5 text-dc-green" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-dc-text-muted" />
                      )}
                      <span className={check.valid ? 'text-dc-green' : 'text-dc-text-muted'}>{check.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-dc-text-muted uppercase mb-2 tracking-wide">
                Confirm Password <span className="text-dc-red">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full bg-dc-darker border rounded-lg px-4 py-2.5 text-dc-text placeholder-dc-text-muted/50 focus:border-dc-brand transition-colors ${
                  confirmPassword && confirmPassword !== password ? 'border-dc-red' : 'border-dc-divider/50'
                }`}
                placeholder="Confirm your password"
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="text-dc-red text-xs mt-1">Passwords do not match</p>
              )}
            </div>

            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-dc-brand hover:bg-dc-brand-hover text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Continue'
              )}
            </motion.button>
          </form>

          {/* Login link */}
          <p className="text-sm text-dc-text-muted mt-6 text-center">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-dc-text-link hover:underline font-medium"
            >
              Log In
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
