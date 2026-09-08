// 通用布局 + 导航
import { Link, useNavigate } from 'react-router-dom';
import { clearToken, getToken } from '../lib/api';

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const isAuthed = !!getToken();

  function logout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <header
        style={{
          background: '#1a1a1a',
          color: '#fff',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
          AgentForge
        </Link>
        <nav style={{ display: 'flex', gap: 16 }}>
          <Link to="/projects" style={{ color: '#ccc', textDecoration: 'none' }}>
            Agent 项目
          </Link>
          <Link to="/runs" style={{ color: '#ccc', textDecoration: 'none' }}>
            执行日志
          </Link>
        </nav>
        <div style={{ marginLeft: 'auto' }}>
          {isAuthed ? (
            <button
              onClick={logout}
              style={{
                background: 'transparent',
                color: '#fff',
                border: '1px solid #555',
                padding: '6px 14px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              登出
            </button>
          ) : (
            <Link to="/login" style={{ color: '#fff', textDecoration: 'none' }}>
              登录
            </Link>
          )}
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>{children}</main>
    </div>
  );
}
