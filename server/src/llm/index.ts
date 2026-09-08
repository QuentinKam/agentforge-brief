// Provider 工厂入口 — 启动时注册默认 OpenAI / Anthropic provider
import { createProviderFactory, type ProviderFactory } from './provider';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';

let _factory: ProviderFactory | undefined;

/** 单例工厂：M1 阶段固定注册两个 provider；M2+ 可按 Agent 配置动态切换 */
export function getProviderFactory(): ProviderFactory {
  if (_factory) return _factory;
  _factory = createProviderFactory();
  _factory.register('openai', new OpenAIProvider());
  _factory.register('anthropic', new AnthropicProvider());
  return _factory;
}
