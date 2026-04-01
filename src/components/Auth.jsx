import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  User as UserIcon, 
  Lock, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Compass,
  Loader2,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Auth = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { data, error: loginErr } = await supabase
          .from('app_users')
          .select('*')
          .eq('username', username)
          .eq('password', password)
          .single();

        if (loginErr || !data) throw new Error('Invalid username or password');
        onAuthSuccess(data);
      } else {
        const { error: signUpErr } = await supabase
          .from('app_users')
          .insert([{ username, password }]);

        if (signUpErr) throw new Error('Username already taken or database error');
        
        const { data: newUser } = await supabase
          .from('app_users')
          .select('*')
          .eq('username', username)
          .single();
        
        onAuthSuccess(newUser);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background Decorative Blobs */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)', zIndex: 0 }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, transparent 70%)', zIndex: 0 }} />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card" 
        style={{ width: '100%', maxWidth: '440px', padding: '3rem 2.5rem', zIndex: 1, position: 'relative' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '24px', marginBottom: '1.5rem' }}>
             <Compass size={40} color="#8b5cf6" className="animate-pulse" />
          </div>
          <h1 className="gradient-text" style={{ fontSize: '2.8rem', margin: 0, letterSpacing: '-1px' }}>
            Travel with Me
          </h1>
          <p style={{ opacity: 0.5, fontSize: '0.95rem', marginTop: '8px', fontWeight: 500 }}>
            {isLogin ? "Welcome back, traveler!" : "Join your campus ride network"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="auth-form">
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', opacity: 0.7, marginBottom: '10px' }}>
               <UserIcon size={14} /> Username
            </label>
            <input
              type="text"
              placeholder="Your unique ID"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="input-group" style={{ marginTop: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', opacity: 0.7, marginBottom: '10px' }}>
               <Lock size={14} /> Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="error-message" 
                style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <AlertTriangle size={16} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              marginTop: '2.5rem', 
              width: '100%', 
              padding: '1.2rem', 
              fontSize: '1.1rem', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '12px',
              borderRadius: '18px'
            }}
          >
            {loading ? <Loader2 className="animate-spin" /> : (
              <>
                {isLogin ? "Sign In" : "Create Account"} 
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <p style={{ opacity: 0.5, fontSize: '0.9rem', margin: 0 }}>
            {isLogin ? "New to the campus network?" : "Already have an account?"}
          </p>
          <button 
            className="auth-toggle" 
            onClick={() => setIsLogin(!isLogin)}
            style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '1rem', marginTop: '4px' }}
          >
            {isLogin ? "Register Now" : "Back to Login"}
          </button>
        </div>

        <div style={{ marginTop: '3rem', paddingTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
           <div style={{ textAlign: 'center' }}>
              <Zap size={20} color="#fbbf24" style={{ marginBottom: '8px', margin: '0 auto' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>LIVE TRACK</div>
           </div>
           <div style={{ textAlign: 'center' }}>
              <ShieldCheck size={20} color="#22c55e" style={{ marginBottom: '8px', margin: '0 auto' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>STUDENT ONLY</div>
           </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
