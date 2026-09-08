// 登录 / 注册页 — M1 单页合一，根据 tab 切换
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login, register, setToken } from '../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = location.pathname === '/register';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = isRegister
        ? await register(email, password, name || undefined)
        : await login(email, password);
      setToken(result.token);
      navigate('/projects');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '60px auto', background: '#fff', padding: 32, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ marginTop: 0 }}>{isRegister ? '注册' : '登录'}</h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isRegister && (
          <input
            placeholder="显示名（可选）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        )}
        <input
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="密码（至少 8 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          style={inputStyle}
        />
        {error && <div style={{ color: '#c00', fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? '提交中...' : isRegister ? '注册' : '登录'}
        </button>
      </form>
      <div style={{ marginTop: 16, fontSize: 14 }}>
        {isRegister ? (
          <>
            已有账号？ <a href="/login">去登录</a>
          </>
        ) : (
          <>
            没有账号？ <a href="/register">去注册</a>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: 14,
};

const btnStyle: React.CSSProperties = {
  padding: '10px 16px',
  background: '#1a1a1a',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
};
