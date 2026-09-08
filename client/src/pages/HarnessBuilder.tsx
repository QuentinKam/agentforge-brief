// Harness Builder — PRD §3.6：可视化编辑 Agent 的「工作环境配置」
// 组成：系统 prompt + 规则文件（多段 Markdown）+ 约束（JSON）
// 右侧实时预览最终发给 LLM 的完整上下文 + token 计数
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  type HarnessConfig,
  type Skill,
  getHarness,
  updateHarness,
  previewContext,
  listSkills,
  exportHarness,
  importHarness,
} from '../lib/api';

export function HarnessBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [harness, setHarness] = useState<HarnessConfig | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  // harness 状态用于跟踪是否已加载初始值；UI 字段独立于 harness
  void harness;
  const [systemPrompt, setSystemPrompt] = useState('');
  const [rules, setRules] = useState<string[]>(['']);
  const [constraints, setConstraints] = useState('{}');
  const [userMessage, setUserMessage] = useState('');
  const [preview, setPreview] = useState<{
    sections: Array<{ label: string; content: string; tokens: number }>;
    totalTokens: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [h, s] = await Promise.all([getHarness(id), listSkills(id)]);
      setHarness(h.data);
      setSkills(s.data);
      setSystemPrompt(h.data.systemPrompt ?? '');
      setRules((h.data.rulesJson ?? []).length > 0 ? (h.data.rulesJson as string[]) : ['']);
      setConstraints(JSON.stringify(h.data.constraintsJson ?? {}, null, 2));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // 防抖预览：input 变化 500ms 后触发
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!id) return;
      let constraintsObj: Record<string, unknown> = {};
      try {
        constraintsObj = JSON.parse(constraints || '{}');
      } catch {
        // 解析失败时仍预览，但 constraints 跳过
      }
      try {
        const r = await previewContext(id, {
          systemPrompt: systemPrompt || null,
          rules: rules.filter((r) => r.length > 0),
          constraints: constraintsObj,
          userMessage,
        });
        setPreview(r.data);
      } catch {
        // 预览失败不阻断 UI
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [id, systemPrompt, rules, constraints, userMessage]);

  async function save() {
    if (!id) return;
    setSaving(true);
    setError(null);
    let constraintsObj: Record<string, unknown> = {};
    try {
      constraintsObj = JSON.parse(constraints || '{}');
    } catch (err) {
      setError(`Constraints JSON 解析失败: ${(err as Error).message}`);
      setSaving(false);
      return;
    }
    try {
      const r = await updateHarness(id, {
        systemPrompt: systemPrompt || null,
        rules: rules.filter((r) => r.length > 0),
        constraints: constraintsObj,
      });
      setHarness(r.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addRule() {
    setRules((rs) => [...rs, '']);
  }
  function updateRule(i: number, v: string) {
    setRules((rs) => rs.map((r, idx) => (idx === i ? v : r)));
  }
  function deleteRule(i: number) {
    setRules((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function handleExport() {
    if (!id) return;
    try {
      const r = await exportHarness(id);
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `harness-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const obj = JSON.parse(reader.result as string);
        const r = await importHarness(id!, obj);
        setHarness(r.data);
        setSystemPrompt(r.data.systemPrompt ?? '');
        setRules((r.data.rulesJson ?? []).length > 0 ? (r.data.rulesJson as string[]) : ['']);
        setConstraints(JSON.stringify(r.data.constraintsJson ?? {}, null, 2));
      } catch (err) {
        setError((err as Error).message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/projects" style={{ color: '#1a1a1a', fontSize: 14 }}>← 返回项目</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Harness Builder</h2>
      {error && <div style={errBox}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
        {/* 左：编辑区 */}
        <div>
          {/* 工具栏 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={save} disabled={saving} style={primaryBtn}>
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={handleExport} style={smallBtn}>导出 JSON</button>
            <label style={{ ...smallBtn, cursor: 'pointer' }}>
              导入 JSON
              <input type="file" accept=".json,application/json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          </div>

          {/* System Prompt */}
          <Section title="System Prompt（系统指令）">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              placeholder="例如：你是一个代码审查 Agent，专注于 TypeScript/React 项目的质量..."
              style={{ ...textareaStyle, fontFamily: 'monospace' }}
            />
          </Section>

          {/* Rules */}
          <Section title={`规则文件（Markdown，${rules.length} 段）`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rules.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 4 }}>
                  <textarea
                    value={r}
                    onChange={(e) => updateRule(i, e.target.value)}
                    rows={4}
                    placeholder={`## Rule ${i + 1}\n例如：所有 commit 必须 `}
                    style={{ ...textareaStyle, fontFamily: 'monospace', flex: 1 }}
                  />
                  <button onClick={() => deleteRule(i)} style={{ ...smallBtn, alignSelf: 'flex-start' }}>删除</button>
                </div>
              ))}
              <button onClick={addRule} style={{ ...smallBtn, alignSelf: 'flex-start' }}>+ 新增规则</button>
            </div>
          </Section>

          {/* Constraints */}
          <Section title="约束条件（JSON Schema）">
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={8}
              style={{ ...textareaStyle, fontFamily: 'monospace' }}
            />
          </Section>

          {/* 挂载概览 */}
          <Section title="挂载概览">
            <div style={{ background: '#f7f7f7', padding: 12, borderRadius: 4, fontSize: 13 }}>
              <div>已挂载 Skills: <strong>{skills.length}</strong></div>
              <ul style={{ margin: '8px 0 0 16px', color: '#555' }}>
                {skills.map((s) => (
                  <li key={s.id}>{s.name}{s.isTemplate ? '（模板）' : ''}</li>
                ))}
              </ul>
            </div>
          </Section>
        </div>

        {/* 右：上下文预览 */}
        <div>
          <div style={{ ...card, position: 'sticky', top: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>上下文预览</h3>
              <span style={{ ...tokenBadge, fontSize: 14 }}>
                {preview?.totalTokens ?? 0} tokens
              </span>
            </div>
            <input
              placeholder="模拟用户消息（可选）"
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12, width: '100%' }}
            />
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {preview?.sections.map((s, i) => (
                <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 4 }}>
                    <strong>{s.label}</strong>
                    <span>{s.tokens} tokens</span>
                  </div>
                  <pre style={preBox}>{s.content}</pre>
                </div>
              ))}
              {(!preview || preview.sections.length === 0) && (
                <div style={{ color: '#999', fontSize: 13, padding: 12, textAlign: 'center' }}>
                  填写左侧字段后，预览会自动渲染
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, textTransform: 'uppercase' as const }}>{title}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 };
const textareaStyle: React.CSSProperties = { ...inputStyle, width: '100%', resize: 'vertical' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const smallBtn: React.CSSProperties = { padding: '6px 12px', background: 'transparent', color: '#1a1a1a', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, cursor: 'pointer' };
const card: React.CSSProperties = { background: '#fff', padding: 16, borderRadius: 6, border: '1px solid #eaeaea' };
const errBox: React.CSSProperties = { padding: 12, background: '#fee', color: '#c00', borderRadius: 4, marginBottom: 12, fontSize: 14 };
const preBox: React.CSSProperties = { background: '#f7f7f7', padding: 8, borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace', maxHeight: 200, overflow: 'auto' };
const tokenBadge: React.CSSProperties = { background: '#1a1a1a', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 600 };
