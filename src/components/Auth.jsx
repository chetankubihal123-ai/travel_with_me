import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, User, Loader2, LogIn, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

function Auth({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        // Direct table query for login
        const { data, error: signInError } = await supabase
          .from('app_users')
          .select('*')
          .eq('username', username)
          .eq('password', password) // Simplified for the demo
          .single();

        if (signInError || !data) throw new Error('Invalid username or password');
        
        onAuthSuccess(data);
      } else {
        // Direct table insert for sign up
        const { data, error: signUpError } = await supabase
          .from('app_users')
          .insert([{ username, password }])
          .select()
          .single();

        if (signUpError) {
          if (signUpError.code === '23505') throw new Error('Username already exists');
          throw signUpError;
        }

        alert('Account created! You can now log in.');
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message || 'An authentication error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card auth-form"
      >
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h2 className="gradient-text" style={{ fontSize: '2rem', margin: 0 }}>
            {isLogin ? 'Travel with Me' : 'Join the Route'}
          </h2>
          <p style={{ opacity: 0.7 }}>{isLogin ? 'Pure Username Login' : 'Create your student account'}</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div className="input-group">
            <label><User size={16} /> Username</label>
            <input 
              type="text" 
              placeholder="Nickname" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label><Lock size={16} /> Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              isLogin ? <><LogIn size={20} /> Entrar</> : <><UserPlus size={20} /> Registrar</>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button 
              className="auth-toggle" 
              onClick={() => setIsLogin(!isLogin)}
              style={{ marginLeft: '5px' }}
            >
              {isLogin ? 'Sign Up' : 'Log In'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default Auth;
