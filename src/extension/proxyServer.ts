// ==========================================
// VANTINEL LOCAL PROXY SERVER
// Intercepts IDE AI agent LLM requests,
// checks policy, blocks dangerous tool calls
// ==========================================

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import * as secretManager from './secretManager';

// ---- Types ----

interface ProxyConfig {
    port: number;
    collectorUrl: string;
    agentName: string;
}

interface ProxyStatus {
    running: boolean;
    port: number;
    requestsIntercepted: number;
    blocked: number;
}

interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

interface PolicyDecision {
    decision: 'allow' | 'block' | 'require_approval';
    message?: string;
    violations?: string[];
}

type Provider = 'anthropic' | 'openai' | 'gemini';

export interface ProxyInterceptEvent {
    id: string;
    timestamp: number;
    eventType: 'REQUEST' | 'TOOL_CALL' | 'BLOCKED';
    model: string;
    toolName?: string;
    blocked: boolean;
    reason?: string;
    sessionId: string;
    latencyMs: number;
    provider: Provider;
}

// Subscribers receive each intercepted event
type EventCallback = (event: ProxyInterceptEvent) => void;
const eventCallbacks: EventCallback[] = [];

export function onProxyEvent(cb: EventCallback): () => void {
    eventCallbacks.push(cb);
    return () => {
        const idx = eventCallbacks.indexOf(cb);
        if (idx !== -1) { eventCallbacks.splice(idx, 1); }
    };
}

function emitProxyEvent(event: ProxyInterceptEvent) {
    for (const cb of eventCallbacks) { try { cb(event); } catch { /* ignore */ } }
}

// ---- Token cost estimation (per 1M tokens, in USD) ----

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'claude-opus-4':       { input: 15,  output: 75 },
    'claude-sonnet-4':     { input: 3,   output: 15 },
    'claude-haiku-4':      { input: 0.8, output: 4  },
    'claude-3-5-sonnet':   { input: 3,   output: 15 },
    'claude-3-5-haiku':    { input: 0.8, output: 4  },
    'claude-3-opus':       { input: 15,  output: 75 },
    'gpt-4o':              { input: 5,   output: 15 },
    'gpt-4o-mini':         { input: 0.15,output: 0.6 },
    'gpt-4-turbo':         { input: 10,  output: 30 },
    'gpt-4':               { input: 30,  output: 60 },
    'gpt-3.5-turbo':       { input: 0.5, output: 1.5 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const modelKey = Object.keys(MODEL_PRICING).find(k => model.includes(k)) ?? 'gpt-4o';
    const pricing = MODEL_PRICING[modelKey];
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// ---- Session tracking ----

// Maps a conversation key → stable session_id, capped at SESSION_CACHE_MAX entries
const SESSION_CACHE_MAX = 1000;
const sessionCache = new Map<string, string>();

function getSessionId(model: string, firstUserMessage: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'unknown';
    const key = `${workspaceFolder}:${model}:${firstUserMessage.slice(0, 100)}`;
    if (sessionCache.has(key)) {
        return sessionCache.get(key)!;
    }
    // Evict oldest entry when at capacity
    if (sessionCache.size >= SESSION_CACHE_MAX) {
        const firstKey = sessionCache.keys().next().value;
        if (firstKey !== undefined) { sessionCache.delete(firstKey); }
    }
    const id = `ide-${crypto.randomUUID()}`;
    sessionCache.set(key, id);
    return id;
}

// ---- Gateway communication ----

async function checkPolicyWithGateway(
    collectorUrl: string,
    apiKey: string,
    sessionId: string,
    agentName: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    latencyMs: number,
    estimatedCost: number,
    model: string
): Promise<PolicyDecision> {
    const toolArgsHash = crypto.createHash('md5').update(JSON.stringify(toolInput)).digest('hex');

    const body = JSON.stringify({
        session_id: sessionId,
        agent_id: agentName,
        tool_name: toolName,
        tool_args_hash: `md5:${toolArgsHash}`,
        latency_ms: latencyMs,
        estimated_cost: estimatedCost,
        metadata: { model, ide_agent: 'vscode-extension', workspace: vscode.workspace.workspaceFolders?.[0]?.name ?? 'unknown' },
    });

    return new Promise((resolve) => {
        const url = new URL(`${collectorUrl}/v1/events`);
        const isHttps = url.protocol === 'https:';
        const transport = isHttps ? https : http;

        const req = transport.request(
            {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'X-Vantinel-API-Key': apiKey,
                },
                timeout: 3000,
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data) as PolicyDecision;
                        resolve(parsed);
                    } catch {
                        resolve({ decision: 'allow' });
                    }
                });
            }
        );

        req.on('error', () => resolve({ decision: 'allow' }));
        req.on('timeout', () => { req.destroy(); resolve({ decision: 'allow' }); });
        req.write(body);
        req.end();
    });
}

// ---- Parsing helpers ----

function extractToolUseFromAnthropicResponse(body: Record<string, unknown>): ToolUseBlock[] {
    const content = body.content as unknown[];
    if (!Array.isArray(content)) { return []; }
    return content.filter((c): c is ToolUseBlock =>
        typeof c === 'object' && c !== null && (c as ToolUseBlock).type === 'tool_use'
    );
}

function extractToolUseFromOpenAIResponse(body: Record<string, unknown>): ToolUseBlock[] {
    const choices = body.choices as Array<{ message?: { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
    if (!Array.isArray(choices)) { return []; }
    const toolCalls: ToolUseBlock[] = [];
    for (const choice of choices) {
        for (const tc of (choice.message?.tool_calls ?? [])) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
            toolCalls.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
    }
    return toolCalls;
}

// Parse Anthropic SSE stream — returns extracted tool_use blocks keyed by content block index
function parseAnthropicSseStream(sseText: string): ToolUseBlock[] {
    // Use a Map keyed by content block index so text blocks (index 0) don't collide with
    // tool_use blocks (index 1+) — fixes the tools[idx] array-position bug.
    const toolsByIndex = new Map<number, ToolUseBlock>();
    const partialInputs = new Map<number, string>();

    for (const line of sseText.split('\n')) {
        if (!line.startsWith('data: ')) { continue; }
        const json = line.slice(6).trim();
        if (json === '[DONE]') { continue; }
        try {
            const event = JSON.parse(json) as Record<string, unknown>;
            if (event.type === 'content_block_start') {
                const block = event.content_block as Record<string, unknown>;
                if (block?.type === 'tool_use') {
                    const idx = event.index as number;
                    partialInputs.set(idx, '');
                    toolsByIndex.set(idx, { type: 'tool_use', id: block.id as string, name: block.name as string, input: {} });
                }
            } else if (event.type === 'content_block_delta') {
                const delta = event.delta as Record<string, unknown>;
                if (delta?.type === 'input_json_delta') {
                    const idx = event.index as number;
                    partialInputs.set(idx, (partialInputs.get(idx) ?? '') + (delta.partial_json as string));
                }
            } else if (event.type === 'content_block_stop') {
                const idx = event.index as number;
                const partial = partialInputs.get(idx);
                const tool = toolsByIndex.get(idx);
                if (partial !== undefined && tool) {
                    try { tool.input = JSON.parse(partial); } catch { /* ignore */ }
                }
            }
        } catch { /* ignore malformed lines */ }
    }

    return Array.from(toolsByIndex.values());
}

function parseOpenAISseStream(sseText: string): ToolUseBlock[] {
    const partials = new Map<number, { id: string; name: string; args: string }>();

    for (const line of sseText.split('\n')) {
        if (!line.startsWith('data: ')) { continue; }
        const json = line.slice(6).trim();
        if (json === '[DONE]') { continue; }
        try {
            const event = JSON.parse(json) as Record<string, unknown>;
            const choices = event.choices as Array<{ delta?: { tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }>;
            for (const choice of (choices ?? [])) {
                for (const tc of (choice.delta?.tool_calls ?? [])) {
                    const idx = tc.index;
                    if (!partials.has(idx)) {
                        partials.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' });
                    }
                    const p = partials.get(idx)!;
                    if (tc.id) { p.id = tc.id; }
                    if (tc.function?.name) { p.name += tc.function.name; }
                    if (tc.function?.arguments) { p.args += tc.function.arguments; }
                }
            }
        } catch { /* ignore */ }
    }

    return Array.from(partials.values()).map(p => {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(p.args); } catch { /* ignore */ }
        return { type: 'tool_use' as const, id: p.id, name: p.name, input };
    });
}

// ---- Gemini helpers ----

function extractToolUseFromGeminiResponse(body: Record<string, unknown>): ToolUseBlock[] {
    const candidates = body.candidates as Array<{ content?: { parts?: Array<{ functionCall?: { name: string; args: Record<string, unknown> } }> } }>;
    if (!Array.isArray(candidates)) { return []; }
    const tools: ToolUseBlock[] = [];
    for (const candidate of candidates) {
        for (const part of (candidate.content?.parts ?? [])) {
            if (part.functionCall) {
                tools.push({ type: 'tool_use', id: crypto.randomUUID(), name: part.functionCall.name, input: part.functionCall.args ?? {} });
            }
        }
    }
    return tools;
}

function parseGeminiSseStream(sseText: string): ToolUseBlock[] {
    const tools: ToolUseBlock[] = [];
    for (const line of sseText.split('\n')) {
        if (!line.startsWith('data: ')) { continue; }
        const json = line.slice(6).trim();
        try {
            const event = JSON.parse(json) as Record<string, unknown>;
            tools.push(...extractToolUseFromGeminiResponse(event));
        } catch { /* ignore */ }
    }
    return tools;
}

function buildGeminiBlockedResponse(original: Record<string, unknown>, blockedTools: Map<string, string>): Record<string, unknown> {
    const candidates = (original.candidates as Array<Record<string, unknown>> ?? []).map((candidate) => {
        const content = candidate.content as { parts?: Array<{ functionCall?: { name: string } }> } | undefined;
        if (!content?.parts) { return candidate; }
        const newParts = content.parts.map((part) => {
            if (part.functionCall && blockedTools.has(part.functionCall.name)) {
                return { text: `[VANTINEL BLOCKED: ${part.functionCall.name} — ${blockedTools.get(part.functionCall.name)}]` };
            }
            return part;
        });
        return { ...candidate, content: { ...content, parts: newParts }, finishReason: 'STOP' };
    });
    return { ...original, candidates };
}

function buildGeminiBlockedSse(originalSse: string, blockedTools: Map<string, string>): string {
    const lines: string[] = [];
    for (const line of originalSse.split('\n')) {
        if (!line.startsWith('data: ')) { lines.push(line); continue; }
        const json = line.slice(6).trim();
        try {
            const event = JSON.parse(json) as Record<string, unknown>;
            const tools = extractToolUseFromGeminiResponse(event);
            const hasBlocked = tools.some(t => blockedTools.has(t.name));
            if (hasBlocked) {
                lines.push(`data: ${JSON.stringify(buildGeminiBlockedResponse(event, blockedTools))}`, '');
            } else {
                lines.push(line);
            }
        } catch { lines.push(line); }
    }
    return lines.join('\n');
}

// ---- Response modification ----

function buildAnthropicBlockedResponse(original: Record<string, unknown>, blockedTools: Map<string, string>): Record<string, unknown> {
    const content = (original.content as unknown[] ?? []).map((block) => {
        const b = block as ToolUseBlock;
        if (b.type === 'tool_use' && blockedTools.has(b.name)) {
            return {
                type: 'text',
                text: `[VANTINEL BLOCKED: ${b.name} — ${blockedTools.get(b.name)}]`,
            };
        }
        return block;
    });
    return { ...original, content, stop_reason: 'end_turn' };
}

function buildOpenAIBlockedResponse(original: Record<string, unknown>, blockedTools: Map<string, string>): Record<string, unknown> {
    const choices = (original.choices as Array<{ message?: { tool_calls?: Array<{ function: { name: string } }> }; finish_reason?: string }> ?? []).map((choice) => {
        const toolCalls = choice.message?.tool_calls ?? [];
        const hasBlocked = toolCalls.some(tc => blockedTools.has(tc.function.name));
        if (!hasBlocked) { return choice; }
        const blockedNames = toolCalls.filter(tc => blockedTools.has(tc.function.name)).map(tc => tc.function.name);
        const messages = blockedNames.map(n => `[VANTINEL BLOCKED: ${n} — ${blockedTools.get(n)}]`).join(' ');
        return {
            ...choice,
            message: { role: 'assistant', content: messages, tool_calls: undefined },
            finish_reason: 'stop',
        };
    });
    return { ...original, choices };
}

// ---- HTTP forwarding ----

function forwardRequest(
    targetHostname: string,
    targetPort: number,
    isHttps: boolean,
    path: string,
    method: string,
    headers: http.IncomingHttpHeaders,
    body: Buffer
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
    return new Promise((resolve, reject) => {
        const transport = isHttps ? https : http;

        // Strip hop-by-hop headers
        const forwardHeaders = { ...headers };
        delete forwardHeaders['host'];
        delete forwardHeaders['transfer-encoding'];
        forwardHeaders['content-length'] = String(body.length);

        const req = transport.request(
            {
                hostname: targetHostname,
                port: targetPort,
                path,
                method,
                headers: forwardHeaders,
                timeout: 120_000,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => resolve({
                    statusCode: res.statusCode ?? 200,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                }));
                res.on('error', reject);
            }
        );

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ---- Main proxy logic ----

function detectProvider(url: string, headers?: http.IncomingHttpHeaders): Provider {
    if (url.includes('anthropic.com') || url.startsWith('/v1/messages')) { return 'anthropic'; }
    if (url.includes('googleapis.com') || url.includes('generativelanguage') || url.startsWith('/v1beta/models/')) { return 'gemini'; }
    if (url.includes('api.openai.com') || url.startsWith('/v1/chat/completions') || url.startsWith('/v1/completions') || url.startsWith('/v1/embeddings')) { return 'openai'; }
    
    // Check headers as fallback
    if (headers) {
        if (headers['anthropic-version'] || headers['x-api-key']) return 'anthropic';
        if (headers['authorization']?.toString().startsWith('Bearer sk-')) return 'openai';
    }
    return 'openai'; // Default
}

function upstreamHostForProvider(provider: Provider): string {
    if (provider === 'anthropic') { return 'api.anthropic.com'; }
    if (provider === 'gemini') { return 'generativelanguage.googleapis.com'; }
    return 'api.openai.com';
}

async function handleProxiedRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    config: ProxyConfig,
    apiKey: string,
    stats: { requestsIntercepted: number; blocked: number }
): Promise<void> {
    const startTime = Date.now();
    const provider = detectProvider(req.url ?? '/', req.headers);

    const targetHostname = upstreamHostForProvider(provider);
    const targetPort = 443;
    const isHttps = true;

    // Read request body
    const bodyChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
        req.on('end', resolve);
        req.on('error', reject);
    });
    const requestBody = Buffer.concat(bodyChunks);

    let parsedRequest: Record<string, unknown> = {};
    try { parsedRequest = JSON.parse(requestBody.toString()); } catch { /* pass through as-is */ }

    stats.requestsIntercepted++;

    // Forward to real API
    let upstream: { statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer };
    try {
        upstream = await forwardRequest(
            targetHostname, targetPort, isHttps,
            req.url ?? '/', req.method ?? 'POST',
            req.headers, requestBody
        );
    } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Vantinel proxy: upstream request failed', details: String(err) }));
        return;
    }

    const latencyMs = Date.now() - startTime;
    const contentType = String(upstream.headers['content-type'] ?? '');
    const isStreaming = contentType.includes('text/event-stream');

    // Derive model name across all provider formats
    const model = (parsedRequest.model as string)
        ?? (req.url?.match(/\/models\/([^/:]+)/)?.[1] ?? '');

    // Extract session ID from messages / contents
    const messages = (parsedRequest.messages as Array<{ role: string; content: string }>)
        ?? (parsedRequest.contents as Array<{ role: string; parts: Array<{ text: string }> }>)
        ?? [];
    const firstUserMsg = (messages as Array<{ role: string; content?: string; parts?: Array<{ text: string }> }>)
        .find(m => m.role === 'user')?.content
        ?? (messages as Array<{ role: string; parts?: Array<{ text: string }> }>)
           .find(m => m.role === 'user')?.parts?.[0]?.text
        ?? '';
    const sessionId = getSessionId(model, typeof firstUserMsg === 'string' ? firstUserMsg : JSON.stringify(firstUserMsg));

    let responseBody: Record<string, unknown> = {};
    let sseText = '';
    let toolUseBlocks: ToolUseBlock[] = [];

    if (isStreaming) {
        sseText = upstream.body.toString();
        if (provider === 'anthropic') { toolUseBlocks = parseAnthropicSseStream(sseText); }
        else if (provider === 'gemini') { toolUseBlocks = parseGeminiSseStream(sseText); }
        else { toolUseBlocks = parseOpenAISseStream(sseText); }
    } else {
        try { responseBody = JSON.parse(upstream.body.toString()); } catch { /* pass through */ }
        if (provider === 'anthropic') { toolUseBlocks = extractToolUseFromAnthropicResponse(responseBody); }
        else if (provider === 'gemini') { toolUseBlocks = extractToolUseFromGeminiResponse(responseBody); }
        else { toolUseBlocks = extractToolUseFromOpenAIResponse(responseBody); }
    }

    if (toolUseBlocks.length === 0) {
        // No tool calls — emit REQUEST event and pass through
        emitProxyEvent({ id: crypto.randomUUID(), timestamp: Date.now(), eventType: 'REQUEST', model, blocked: false, sessionId, latencyMs, provider });
        sendUpstreamResponse(res, upstream);
        return;
    }

    // Estimate cost
    const usage = (responseBody.usage ?? responseBody.usageMetadata ?? {}) as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number; promptTokenCount?: number; candidatesTokenCount?: number };
    const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount ?? 0;
    const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount ?? 0;
    const cost = estimateCost(model, inputTokens, outputTokens);

    // Check each tool call with gateway
    const blockedTools = new Map<string, string>();
    for (const tool of toolUseBlocks) {
        const decision = await checkPolicyWithGateway(
            config.collectorUrl, apiKey, sessionId, config.agentName,
            tool.name, tool.input, latencyMs, cost / toolUseBlocks.length, model
        );

        if (decision.decision === 'block' || decision.decision === 'require_approval') {
            const reason = decision.violations?.join(', ') ?? decision.message ?? 'Policy violation';
            blockedTools.set(tool.name, reason);
            stats.blocked++;
            emitProxyEvent({ id: crypto.randomUUID(), timestamp: Date.now(), eventType: 'BLOCKED', model, toolName: tool.name, blocked: true, reason, sessionId, latencyMs, provider });
        } else {
            emitProxyEvent({ id: crypto.randomUUID(), timestamp: Date.now(), eventType: 'TOOL_CALL', model, toolName: tool.name, blocked: false, sessionId, latencyMs, provider });
        }
    }

    if (blockedTools.size === 0) {
        sendUpstreamResponse(res, upstream);
        return;
    }

    // Build modified response with blocked tool calls replaced
    if (isStreaming) {
        const modifiedSse = provider === 'gemini'
            ? buildGeminiBlockedSse(sseText, blockedTools)
            : buildBlockedSseResponse(sseText, blockedTools, provider === 'anthropic');
        const modifiedBuf = Buffer.from(modifiedSse);
        res.writeHead(upstream.statusCode, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'connection': 'keep-alive' });
        res.end(modifiedBuf);
    } else {
        let modified: Record<string, unknown>;
        if (provider === 'anthropic') { modified = buildAnthropicBlockedResponse(responseBody, blockedTools); }
        else if (provider === 'gemini') { modified = buildGeminiBlockedResponse(responseBody, blockedTools); }
        else { modified = buildOpenAIBlockedResponse(responseBody, blockedTools); }
        const modifiedBuf = Buffer.from(JSON.stringify(modified));
        res.writeHead(upstream.statusCode, { 'content-type': 'application/json', 'content-length': String(modifiedBuf.length) });
        res.end(modifiedBuf);
    }
}

function buildBlockedSseResponse(
    originalSse: string,
    blockedTools: Map<string, string>,
    isAnthropic: boolean
): string {
    const blockedList = Array.from(blockedTools.entries())
        .map(([name, reason]) => `${name} (${reason})`)
        .join(', ');
    const blockedMsg = `[VANTINEL BLOCKED: ${blockedList}]`;

    if (isAnthropic) {
        return buildAnthropicBlockedSse(originalSse, blockedMsg);
    } else {
        return buildOpenAIBlockedSse(originalSse, blockedMsg);
    }
}

// Rebuild Anthropic SSE: preserve text content blocks, replace blocked tool_use blocks
function buildAnthropicBlockedSse(
    originalSse: string,
    blockedMsg: string
): string {
    const lines: string[] = [];

    // Pass through message_start as-is
    for (const line of originalSse.split('\n')) {
        if (!line.startsWith('data: ')) { continue; }
        const json = line.slice(6).trim();
        try {
            const event = JSON.parse(json) as Record<string, unknown>;
            if (event.type === 'message_start') {
                lines.push(line, '');
                break;
            }
        } catch { /* skip */ }
    }

    // Collect text content blocks from original stream (preserve them)
    let textBlockIndex = 0;
    const textBlocks: string[] = [];
    const textPartials = new Map<number, string>();

    for (const line of originalSse.split('\n')) {
        if (!line.startsWith('data: ')) { continue; }
        const json = line.slice(6).trim();
        try {
            const event = JSON.parse(json) as Record<string, unknown>;
            if (event.type === 'content_block_start') {
                const block = event.content_block as Record<string, unknown>;
                if (block?.type === 'text') {
                    textPartials.set(event.index as number, '');
                }
            } else if (event.type === 'content_block_delta') {
                const delta = event.delta as Record<string, unknown>;
                if (delta?.type === 'text_delta') {
                    const idx = event.index as number;
                    textPartials.set(idx, (textPartials.get(idx) ?? '') + (delta.text as string));
                }
            } else if (event.type === 'content_block_stop') {
                const idx = event.index as number;
                const text = textPartials.get(idx);
                if (text !== undefined) {
                    textBlocks.push(text);
                }
            }
        } catch { /* skip */ }
    }

    // Emit preserved text blocks
    for (const text of textBlocks) {
        lines.push(`data: ${JSON.stringify({ type: 'content_block_start', index: textBlockIndex, content_block: { type: 'text', text: '' } })}`, '');
        lines.push(`data: ${JSON.stringify({ type: 'content_block_delta', index: textBlockIndex, delta: { type: 'text_delta', text } })}`, '');
        lines.push(`data: ${JSON.stringify({ type: 'content_block_stop', index: textBlockIndex })}`, '');
        textBlockIndex++;
    }

    // Emit blocked tool message as a text block
    lines.push(`data: ${JSON.stringify({ type: 'content_block_start', index: textBlockIndex, content_block: { type: 'text', text: '' } })}`, '');
    lines.push(`data: ${JSON.stringify({ type: 'content_block_delta', index: textBlockIndex, delta: { type: 'text_delta', text: blockedMsg } })}`, '');
    lines.push(`data: ${JSON.stringify({ type: 'content_block_stop', index: textBlockIndex })}`, '');

    lines.push(`data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } })}`, '');
    lines.push(`data: ${JSON.stringify({ type: 'message_stop' })}`, '');

    return lines.join('\n');
}

// Rebuild OpenAI SSE: preserve non-tool-call content, append blocked message
function buildOpenAIBlockedSse(
    originalSse: string,
    blockedMsg: string
): string {
    const lines: string[] = [];
    let chunkId = 'chatcmpl-vntl-blocked';
    let hasContent = false;

    // Pass through non-tool-call content chunks
    for (const line of originalSse.split('\n')) {
        if (!line.startsWith('data: ')) { continue; }
        const json = line.slice(6).trim();
        if (json === '[DONE]') { continue; }
        try {
            const event = JSON.parse(json) as Record<string, unknown>;
            if (event.id) { chunkId = event.id as string; }
            const choices = event.choices as Array<{ delta?: { tool_calls?: unknown; content?: string } }>;
            const hasToolCall = choices?.some(c => c.delta?.tool_calls);
            const hasTextContent = choices?.some(c => c.delta?.content);
            if (hasTextContent && !hasToolCall) {
                lines.push(line, '');
                hasContent = true;
            }
        } catch { /* skip */ }
    }

    // Emit blocked message chunk
    lines.push(`data: ${JSON.stringify({ id: chunkId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: hasContent ? undefined : 'assistant', content: blockedMsg }, finish_reason: null }] })}`, '');
    lines.push(`data: ${JSON.stringify({ id: chunkId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}`, '');
    lines.push('data: [DONE]', '');

    return lines.join('\n');
}

function sendUpstreamResponse(res: http.ServerResponse, upstream: { statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }): void {
    // Copy safe response headers
    const safeHeaders: http.OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(upstream.headers)) {
        if (['transfer-encoding', 'connection'].includes(key.toLowerCase())) { continue; }
        safeHeaders[key] = value as string;
    }
    res.writeHead(upstream.statusCode, safeHeaders);
    res.end(upstream.body);
}

// ---- Public API ----

let proxyServer: http.Server | null = null;
const proxyStats = { requestsIntercepted: 0, blocked: 0 };

export async function startProxyServer(_context: vscode.ExtensionContext): Promise<void> {
    if (proxyServer) { return; } // Already running

    const config = vscode.workspace.getConfiguration('vantinel');
    const port = config.get<number>('proxyPort') ?? 3099;
    const collectorUrl = config.get<string>('collectorUrl') ?? 'http://localhost:8000';
    const agentName = config.get<string>('agentName') ?? 'vscode-ai-agent';
    const proxyEnabled = config.get<boolean>('proxyEnabled') ?? true;

    if (proxyEnabled === false) { return; }

    proxyStats.requestsIntercepted = 0;
    proxyStats.blocked = 0;

    const proxyConfig: ProxyConfig = { port, collectorUrl, agentName };

    proxyServer = http.createServer(async (req, res) => {
        const url = req.url ?? '/';
        const provider = detectProvider(url, req.headers);
        const isLlmPath =
            url.startsWith('/v1/messages') ||
            url.startsWith('/v1/chat/completions') ||
            url.startsWith('/v1/completions') ||
            url.startsWith('/v1beta/models/') ||   // Gemini
            url.includes('api.openai.com') ||
            url.includes('api.anthropic.com') ||
            url.includes('generativelanguage.googleapis.com');

        if (!isLlmPath || req.method !== 'POST') {
            // Pass through non-LLM paths — detect upstream from headers
            const provider = detectProvider(url, req.headers);
            const targetHostname = upstreamHostForProvider(provider);
            const chunks: Buffer[] = [];
            req.on('data', (c: Buffer) => chunks.push(c));
            req.on('end', async () => {
                try {
                    const upstream = await forwardRequest(targetHostname, 443, true, url, req.method ?? 'GET', req.headers, Buffer.concat(chunks));
                    sendUpstreamResponse(res, upstream);
                } catch {
                    res.writeHead(502);
                    res.end('Vantinel proxy: upstream error');
                }
            });
            return;
        }

        const apiKey = await secretManager.getApiKey();
        if (!apiKey) {
            // No API key — pass through without policy check
            const provider = detectProvider(url, req.headers);
            const targetHostname = upstreamHostForProvider(provider);
            const chunks: Buffer[] = [];
            req.on('data', (c: Buffer) => chunks.push(c));
            req.on('end', async () => {
                try {
                    const upstream = await forwardRequest(targetHostname, 443, true, url, req.method ?? 'POST', req.headers, Buffer.concat(chunks));
                    sendUpstreamResponse(res, upstream);
                } catch { res.writeHead(502); res.end('proxy error'); }
            });
            return;
        }

        try {
            await handleProxiedRequest(req, res, proxyConfig, apiKey, proxyStats);
        } catch (err) {
            console.error('Vantinel proxy error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Vantinel proxy internal error' }));
        }
    });

    // Handle HTTPS CONNECT tunneling — required when clients use HTTP_PROXY/HTTPS_PROXY.
    // We tunnel the connection through and emit a REQUEST event so the dashboard
    // shows activity even for encrypted traffic we can't inspect.
    proxyServer.on('connect', (req, clientSocket, head) => {
        const [hostname, portStr] = (req.url ?? '').split(':');
        const port = parseInt(portStr, 10) || 443;

        const serverSocket = net.connect(port, hostname, () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-agent: Vantinel\r\n\r\n');
            serverSocket.write(head);
            serverSocket.pipe(clientSocket);
            clientSocket.pipe(serverSocket);

            // Emit a REQUEST event so dashboard shows Gemini / other HTTPS traffic
            const provider: Provider =
                hostname.includes('anthropic') ? 'anthropic' :
                hostname.includes('generativelanguage') || hostname.includes('googleapis') ? 'gemini' :
                'openai';
            proxyStats.requestsIntercepted++;
            emitProxyEvent({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                eventType: 'REQUEST',
                model: hostname,
                blocked: false,
                sessionId: `tunnel-${hostname}`,
                latencyMs: 0,
                provider,
            });
        });

        serverSocket.on('error', () => clientSocket.destroy());
        clientSocket.on('error', () => serverSocket.destroy());
    });

    proxyServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            vscode.window.showWarningMessage(`Vantinel proxy: port ${port} is in use. Change vantinel.proxyPort in settings.`);
        } else {
            console.error('Vantinel proxy server error:', err);
        }
        proxyServer = null;
    });

    await new Promise<void>((resolve, reject) => {
        proxyServer!.listen(port, '127.0.0.1', () => {
            console.log(`Vantinel proxy listening on http://localhost:${port}`);
            resolve();
        });
        proxyServer!.once('error', reject);
    }).catch(() => { proxyServer = null; });
}

export function stopProxyServer(): void {
    if (proxyServer) {
        proxyServer.close();
        proxyServer = null;
    }
}

export function getProxyStatus(): ProxyStatus {
    const config = vscode.workspace.getConfiguration('vantinel');
    const port = config.get<number>('proxyPort') ?? 3099;
    return {
        running: proxyServer !== null,
        port,
        requestsIntercepted: proxyStats.requestsIntercepted,
        blocked: proxyStats.blocked,
    };
}
