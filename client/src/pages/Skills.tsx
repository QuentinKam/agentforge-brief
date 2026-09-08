// Skill 管理 — 列表 + 新建/编辑（含 Zod Schema JSON 编辑）+ 模板种子
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  type Skill,
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  seedSkillTemplates,
} from '../lib/api';

export function SkillsPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const r = await listSkills(id);
      setItems(r.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleDelete(skillId: string) {
    if (!id) return;
    if (!confirm('确认删除该 Skill？')) return;
    try {
      await deleteSkill(id, skillId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSeedTemplates() {
    if (!id) return;
    try {
      const r = await seedSkillTemplates(id);
      alert(`已导入 ${r.data.inserted} 个 Skill 模板`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/projects" style={{ color: '#1a1a1a', fontSize: 14 }}>← 返回项目</Link>
        <span style={{ margin: '0 12px', color: '#ccc' }}>|</span>
        <Link to={`/harness/${id}`} style={{ color: '#1a1a1a', fontSize: 14 }}>Harness Builder →</Link>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Skills</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSeedTemplates} style={smallBtn}>+ 导入 4 个预置模板</button>
          <button onClick={() => setCreating(true)} style={primaryBtn}>+ 新建 Skill</button>
        </div>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {items.length === 0 ? (
        <div style={empty}>
          还没有 Skill。可点击右上角「导入 4 个预置模板」快速开始。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((s) => (
            <div key={s.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {s.name}
                    {s.isTemplate && (
                      <span style={{ ...badge, marginLeft: 8, background: '#eee', color: '#666' }}>模板</span>
                    )}
                  </div>
                  {s.description && (
                    <div style={{ color: '#555', fontSize: 14, marginTop: 4 }}>{s.description}</div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                    <div>触发关键词: {s.triggerJson?.keywords?.join(', ') ?? '无'}</div>
                    <div>工具链: {s.toolChainJson?.map((t) => t.tool).join(' → ') ?? '无'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setEditing(s)} style={smallBtn}>编辑</button>
                  {!s.isTemplate && (
                    <button onClick={() => handleDelete(s.id)} style={{ ...smallBtn, color: '#c00' }}>删除</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <SkillForm
          agentId={id!}
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

function SkillForm({
  agentId,
  initial,
  onClose,
  onSaved,
}: {
  agentId: string;
  initial?: Skill;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [keywords, setKeywords] = useState(initial?.triggerJson?.keywords?.join(', ') ?? '');
  const [semantic, setSemantic] = useState(initial?.triggerJson?.semantic ?? '');
  const [toolChain, setToolChain] = useState(
    initial?.toolChainJson?.map((t) => `${t.tool}:${t.description}`).join('\n') ?? '',
  );
  const [inputSchema, setInputSchema] = useState(
    initial?.inputSchema ? JSON.stringify(initial.inputSchema, null, 2) : '',
  );
  const [outputSchema, setOutputSchema] = useState(
    initial?.outputSchema ? JSON.stringify(initial.outputSchema, null, 2) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name,
        description: description || undefined,
        trigger: {
          ...(keywords ? { keywords: keywords.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
          ...(semantic ? { semantic } : {}),
        },
        toolChain: toolChain
          .split('\n')
          .map((line) => {
            const [tool, ...desc] = line.split(':');
            return { tool: tool.trim(), description: desc.join(':').trim() };
          })
          .filter((t) => t.tool),
        inputSchema: inputSchema ? JSON.parse(inputSchema) : undefined,
        outputSchema: outputSchema ? JSON.parse(outputSchema) : undefined,
      };
      if (initial) {
        await updateSkill(agentId, initial.id, body);
      } else {
        await createSkill(agentId, body);
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
      <div style={{ ...modal, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{initial ? '编辑 Skill' : '新建 Skill'}</h3>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="名称（如：代码搜索）" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          <textarea placeholder="描述（可选）" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={textareaStyle} />
          <input placeholder="触发关键词（逗号分隔）" value={keywords} onChange={(e) => setKeywords(e.target.value)} style={inputStyle} />
          <input placeholder="语义描述（可选，M2 不实现）" value={semantic} onChange={(e) => setSemantic(e.target.value)} style={inputStyle} />
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>工具链（每行 tool:description）</div>
            <textarea
              placeholder={'code_search:递归搜索文件内容\nfile_io:文件读/写'}
              value={toolChain}
              onChange={(e) => setToolChain(e.target.value)}
              rows={3}
              style={{ ...textareaStyle, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>输入 Schema（JSON Schema，可选）</div>
            <textarea
              placeholder='{"type":"object","properties":{"pattern":{"type":"string"}},"required":["pattern"]}'
              value={inputSchema}
              onChange={(e) => setInputSchema(e.target.value)}
              rows={4}
              style={{ ...textareaStyle, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>输出 Schema（JSON Schema，可选）</div>
            <textarea
              placeholder='{"type":"object","properties":{"ok":{"type":"boolean"}}}'
              value={outputSchema}
              onChange={(e) => setOutputSchema(e.target.value)}
              rows={4}
              style={{ ...textareaStyle, fontFamily: 'monospace' }}
            />
          </div>
          {error && <div style={{ color: '#c00', fontSize: 14 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={smallBtn}>取消</button>
            <button type="submit" disabled={saving} style={primaryBtn}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, width: '100%' };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical', fontFamily: 'inherit' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const smallBtn: React.CSSProperties = { padding: '6px 12px', background: 'transparent', color: '#1a1a1a', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, cursor: 'pointer' };
const card: React.CSSProperties = { background: '#fff', padding: 16, borderRadius: 6, border: '1px solid #eaeaea' };
const empty: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#999', background: '#fff', borderRadius: 6, border: '1px dashed #ddd' };
const errBox: React.CSSProperties = { padding: 12, background: '#fee', color: '#c00', borderRadius: 4, marginBottom: 12, fontSize: 14 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: '#fff', padding: 24, borderRadius: 8, minWidth: 420, maxWidth: 500, maxHeight: '90vh', overflow: 'auto' };
const badge: React.CSSProperties = { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 };
