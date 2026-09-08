// 执行日志 — 展示最近 100 条 Agent 运行 trace
import { useEffect, useState } from 'react';
import { listRuns, getRun, type AgentRun, type AgentRunStep } from '../lib/api';

export function RunHistoryPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentRunStep[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await listRuns();
      setRuns(r.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function showDetail(id: string) {
    setSelectedId(id);
    setSteps([]);
    setSelectedRun(null);
    try {
      const r = await getRun(id);
      setSelectedRun(r.data.run);
      setSteps(r.data.steps);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>执行日志</h2>
      {error && <div style={errBox}>{error}</div>}

      {runs.length === 0 ? (
        <div style={empty}>还没有运行记录。去 Playground 发起一次运行。</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
          <div>
            {runs.map((r) => (
              <div
                key={r.id}
                onClick={() => showDetail(r.id)}
                style={{
                  ...card,
                  cursor: 'pointer',
                  borderColor: selectedId === r.id ? '#1a1a1a' : '#eaeaea',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#888' }}>{r.id.slice(0, 8)}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div style={{ fontSize: 14, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.input}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
                  {new Date(r.createdAt).toLocaleString()} | {r.durationMs}ms | {r.tokenCount} tokens
                </div>
              </div>
            ))}
          </div>
          <div>
            {selectedRun ? (
              <div style={{ ...card, padding: 20 }}>
                <h3 style={{ marginTop: 0 }}>运行详情</h3>
                <Section title="输入">
                  <pre style={preBox}>{selectedRun.input}</pre>
                </Section>
                <Section title="输出">
                  {selectedRun.status === 'success' ? (
                    <pre style={preBox}>{selectedRun.output}</pre>
                  ) : (
                    <pre style={{ ...preBox, color: '#c00' }}>{selectedRun.errorMessage}</pre>
                  )}
                </Section>
                <Section title={`执行步骤 (${steps.length})`}>
                  {steps.map((s, i) => (
                    <div key={s.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #eee' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
                        <span>{i + 1}. {s.stepType}</span>
                        <span>{s.durationMs}ms</span>
                      </div>
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 12 }}>input</summary>
                        <pre style={{ ...preBox, fontSize: 11 }}>{JSON.stringify(s.stepInput, null, 2)}</pre>
                      </details>
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 12 }}>output</summary>
                        <pre style={{ ...preBox, fontSize: 11 }}>{JSON.stringify(s.stepOutput, null, 2)}</pre>
                      </details>
                    </div>
                  ))}
                </Section>
              </div>
            ) : (
              <div style={{ ...empty, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                选择左侧任一运行查看详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'success' ? '#0a0' : status === 'failed' ? '#c00' : status === 'running' ? '#08c' : '#888';
  return <span style={{ color, fontWeight: 600, fontSize: 12 }}>{status}</span>;
}

const card: React.CSSProperties = { background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #eaeaea', marginBottom: 8 };
const empty: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#999', background: '#fff', borderRadius: 6, border: '1px dashed #ddd' };
const errBox: React.CSSProperties = { padding: 12, background: '#fee', color: '#c00', borderRadius: 4, marginBottom: 12, fontSize: 14 };
const preBox: React.CSSProperties = { background: '#f7f7f7', padding: 12, borderRadius: 4, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' };
