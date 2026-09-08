// Agent 项目列表 + 新建/编辑/删除
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type AgentProject,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../lib/api';

export function ProjectsPage() {
  const [items, setItems] = useState<AgentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentProject | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await listProjects();
      setItems(result.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('确认删除该项目？此操作不可恢复。')) return;
    try {
      await deleteProject(id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Agent 项目</h2>
        <button onClick={() => setCreating(true)} style={primaryBtn}>
          + 新建
        </button>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {items.length === 0 ? (
        <div style={empty}>
          还没有 Agent 项目。点击右上角「新建」创建第一个 Agent。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((p) => (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {p.name}{' '}
                    <span style={{ color: '#888', fontSize: 12, fontWeight: 400 }}>
                      {p.provider} / {p.model}
                    </span>
                  </div>
                  {p.description && (
                    <div style={{ color: '#555', fontSize: 14, marginTop: 4 }}>
                      {p.description}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/playground/${p.id}`} style={linkBtn}>
                    Playground →
                  </Link>
                  <Link to={`/harness/${p.id}`} style={linkBtn}>
                    Harness →
                  </Link>
                  <Link to={`/skills/${p.id}`} style={linkBtn}>
                    Skills →
                  </Link>
                  <button onClick={() => setEditing(p)} style={smallBtn}>
                    编辑
                  </button>
                  <button onClick={() => handleDelete(p.id)} style={{ ...smallBtn, color: '#c00' }}>
                    删除
                  </button>
                </div>
              </div>
              <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                创建于 {new Date(p.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ProjectForm
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ProjectForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: AgentProject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [provider, setProvider] = useState<'openai' | 'anthropic'>(initial?.provider === 'anthropic' ? 'anthropic' : 'openai');
  const [model, setModel] = useState(initial?.model ?? 'gpt-4o-mini');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateProject(initial.id, { name, description, provider, model });
      } else {
        await createProject({ name, description, provider, model });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{initial ? '编辑 Agent' : '新建 Agent'}</h3>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          <textarea
            placeholder="描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <select value={provider} onChange={(e) => setProvider(e.target.value as 'openai' | 'anthropic')} style={inputStyle}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <input placeholder="model" value={model} onChange={(e) => setModel(e.target.value)} required style={inputStyle} />
          </div>
          {error && <div style={{ color: '#c00' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={smallBtn}>
              取消
            </button>
            <button type="submit" disabled={saving} style={primaryBtn}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, flex: 1 };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const smallBtn: React.CSSProperties = { padding: '4px 10px', background: 'transparent', color: '#1a1a1a', border: '1px solid #ccc', borderRadius: 4, fontSize: 12, cursor: 'pointer' };
const linkBtn: React.CSSProperties = { padding: '4px 10px', background: '#eee', color: '#1a1a1a', border: '1px solid #ccc', borderRadius: 4, fontSize: 12, textDecoration: 'none' };
const card: React.CSSProperties = { background: '#fff', padding: 16, borderRadius: 6, border: '1px solid #eaeaea' };
const empty: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#999', background: '#fff', borderRadius: 6, border: '1px dashed #ddd' };
const errBox: React.CSSProperties = { padding: 12, background: '#fee', color: '#c00', borderRadius: 4, marginBottom: 12, fontSize: 14 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: '#fff', padding: 24, borderRadius: 8, minWidth: 420, maxWidth: 500 };
