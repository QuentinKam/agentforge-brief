// Agent Playground — 输入消息 → 调用 Agent → 返回结果
// M1 用同步 POST（轮询模式留接口，M5 可选加 SSE）
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProject, runAgent, type AgentProject, type AgentRun } from '../lib/api';

export function PlaygroundPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<AgentProject | null>(null);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getProject(id).then((r) => setProject(r.data)).catch((e) => setError((e as Error).message));
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setRunning(true);
    setError(null);
    setLastRun(null);
    try {
      const result = await runAgent(id, input);
      setLastRun(result.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (error && !project) return <div style={errBox}>{error}</div>;
  if (!project) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/projects" style={{ color: '#1a1a1a', fontSize: 14 }}>
          ← 返回项目列表
        </Link>
      </div>
      <h2 style={{ marginTop: 0 }}>{project.name}</h2>
      <div style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        Provider: <strong>{project.provider}</strong> | Model: <strong>{project.model}</strong>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        <textarea
          placeholder="输入任务消息，按 Enter 或点击「运行」提交"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          style={{ padding: 12, border: '1px solid #ccc', borderRadius: 4, fontSize: 14, fontFamily: 'monospace' }}
        />
        <div>
          <button type="submit" disabled={running || !input.trim()} style={primaryBtn}>
            {running ? '运行中...' : '运行'}
          </button>
        </div>
      </form>

      {error && <div style={errBox}>{error}</div>}

      {lastRun && (
        <div style={{ background: '#fff', border: '1px solid #eaeaea', borderRadius: 6, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>运行结果</h3>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#666' }}>
              <span>状态: <StatusBadge status={lastRun.status} /></span>
              <span>耗时: {lastRun.durationMs}ms</span>
              <span>tokens: {lastRun.tokenCount}</span>
            </div>
          </div>
          {lastRun.status === 'success' ? (
            <pre style={preBox}>{lastRun.output}</pre>
          ) : (
            <pre style={{ ...preBox, color: '#c00' }}>{lastRun.errorMessage}</pre>
          )}
          <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
            Run ID: {lastRun.id} | 创建于 {new Date(lastRun.createdAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'success' ? '#0a0' : status === 'failed' ? '#c00' : '#888';
  return <span style={{ color, fontWeight: 600 }}>{status}</span>;
}

const primaryBtn: React.CSSProperties = { padding: '10px 24px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const errBox: React.CSSProperties = { padding: 12, background: '#fee', color: '#c00', borderRadius: 4, marginBottom: 12, fontSize: 14 };
const preBox: React.CSSProperties = { background: '#f7f7f7', padding: 12, borderRadius: 4, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' };
