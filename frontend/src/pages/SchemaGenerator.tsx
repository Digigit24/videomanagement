import { useState, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api';
import {
  Code2,
  FileCode,
  Copy,
  Check,
  Sparkles,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronRight,
  Zap,
  Search,
  FileText,
  Shield,
  Puzzle,
  Braces,
} from 'lucide-react';

// ──────────────────────────────────────
// Types
// ──────────────────────────────────────
interface Detection {
  pageType: string;
  contentSummary: string;
  schemaTypes: string[];
  primaryKeywords: string[];
  aiSeoFocus: string;
}

interface Stats {
  originalSize: number;
  minifiedSize: number;
  chunks: number;
  schemaTypes: string[];
  pageType: string;
}

interface Result {
  schema: string;
  htmlWithSchema: string;
  detection: Detection;
  stats: Stats;
}

type StepKey = 'minify' | 'chunk' | 'detect' | 'extract' | 'schema' | 'validate' | 'inject';
type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface StepState {
  status: StepStatus;
  message: string;
}

const PIPELINE_STEPS: { key: StepKey; label: string; icon: React.ReactNode }[] = [
  { key: 'minify', label: 'Clean', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { key: 'chunk', label: 'Chunk', icon: <Puzzle className="w-3.5 h-3.5" /> },
  { key: 'detect', label: 'Recognize', icon: <Search className="w-3.5 h-3.5" /> },
  { key: 'extract', label: 'Extract', icon: <FileText className="w-3.5 h-3.5" /> },
  { key: 'schema', label: 'Schema', icon: <Braces className="w-3.5 h-3.5" /> },
  { key: 'validate', label: 'Validate', icon: <Shield className="w-3.5 h-3.5" /> },
  { key: 'inject', label: 'Inject', icon: <Code2 className="w-3.5 h-3.5" /> },
];

const INITIAL_STEPS: Record<StepKey, StepState> = {
  minify: { status: 'pending', message: '' },
  chunk: { status: 'pending', message: '' },
  detect: { status: 'pending', message: '' },
  extract: { status: 'pending', message: '' },
  schema: { status: 'pending', message: '' },
  validate: { status: 'pending', message: '' },
  inject: { status: 'pending', message: '' },
};

// ──────────────────────────────────────
// Main Component
// ──────────────────────────────────────
export default function SchemaGenerator() {
  const [htmlContent, setHtmlContent] = useState('');
  const [url, setUrl] = useState('');
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({ ...INITIAL_STEPS });
  const [detection, setDetection] = useState<Detection | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'schema' | 'html'>('schema');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Ready — paste your HTML and click Generate');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleCopy = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  const handleClear = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setHtmlContent('');
    setUrl('');
    setSteps({ ...INITIAL_STEPS });
    setDetection(null);
    setResult(null);
    setError(null);
    setIsGenerating(false);
    setActiveTab('schema');
    setProgress(null);
    setStatusMessage('Ready — paste your HTML and click Generate');
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!htmlContent.trim() || htmlContent.trim().length < 50) {
      setError('Please paste valid HTML content (at least 50 characters).');
      return;
    }

    // Reset state
    setSteps({ ...INITIAL_STEPS });
    setDetection(null);
    setResult(null);
    setError(null);
    setIsGenerating(true);
    setProgress(null);
    setStatusMessage('Processing...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Use absolute path to the production backend
      const apiUrl = `${API_BASE_URL}/schema-generator/generate-stream`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContent, url: url.trim() || undefined }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Server error: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (currentEvent) {
                case 'step': {
                  const stepKey = data.step as StepKey;
                  setSteps(prev => ({
                    ...prev,
                    [stepKey]: { status: data.status, message: data.message },
                  }));
                  if (data.status === 'active') {
                    setStatusMessage(data.message);
                  }
                  if (data.detection) {
                    setDetection(data.detection);
                  }
                  break;
                }
                case 'progress':
                  setProgress({ current: data.current, total: data.total });
                  setStatusMessage(data.message);
                  break;
                case 'result':
                  setResult(data);
                  setStatusMessage('✨ Schema generated! Switch tabs to view JSON Schema or HTML with schema injected.');
                  break;
                case 'error':
                  setError(data.message);
                  setStatusMessage(`Error: ${data.message}`);
                  break;
                case 'done':
                  break;
              }
            } catch {
              // Ignore JSON parse errors for partial data
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'An unexpected error occurred');
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [htmlContent, url]);

  const charCount = htmlContent.length;
  const currentStepMessage = Object.values(steps).find(s => s.status === 'active')?.message || '';

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      {/* Background gradient effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-violet-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-8 sm:py-12">
        {/* ──── HEADER ──── */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-medium mb-4 tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Optimization
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-3">
            Digi Schema Generator
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Instant SEO structured data generation. Paste your page source and let 
            our intelligent engine build a complete, search-optimized JSON-LD schema for you.
          </p>
        </header>

        {/* ──── INPUT SECTION ──── */}
        <section className="mb-6">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 text-sm text-gray-400">
              <Code2 className="w-4 h-4 text-purple-400" />
              <span className="font-medium text-gray-300">Paste Your HTML Code</span>
              {charCount > 0 && (
                <span className="ml-auto text-xs text-gray-500">
                  {charCount.toLocaleString()} chars
                </span>
              )}
            </div>
            <textarea
              id="htmlInput"
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              placeholder={`Paste your full HTML page code here...\n\nThe AI will automatically:\n  • Detect page type (Blog, Product, About, etc.)\n  • Choose the best schema types\n  • Extract all links, images & data\n  • Generate copy-paste ready JSON-LD`}
              className="w-full bg-transparent text-gray-200 text-sm font-mono p-4 resize-y outline-none placeholder:text-gray-600 min-h-[180px] max-h-[400px] scrollbar-thin"
              spellCheck={false}
            />
            <div className="px-4 py-3 border-t border-white/[0.06] flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <input
                  id="urlInput"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Base URL (optional — helps make relative URLs absolute)"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-purple-500/40 transition-colors"
                />
              </div>
              <div className="flex gap-2 sm:gap-3">
                <button
                  id="generateBtn"
                  onClick={handleGenerate}
                  disabled={isGenerating || !htmlContent.trim()}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm text-white bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Generate Schema
                    </>
                  )}
                </button>
                <button
                  onClick={handleClear}
                  className="px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.08] transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ──── PIPELINE PROGRESS ──── */}
        {(isGenerating || result || error) && (
          <section className="mb-6 animate-fade-in">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="font-medium text-gray-300">AI Pipeline</span>
              </div>

              {/* Step indicators */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-3">
                {PIPELINE_STEPS.map(({ key, label, icon }) => {
                  const step = steps[key];
                  const statusColors: Record<StepStatus, string> = {
                    pending: 'bg-white/[0.04] border-white/[0.06] text-gray-500',
                    active: 'bg-purple-500/15 border-purple-500/40 text-purple-300 shadow-sm shadow-purple-500/10',
                    done: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                    error: 'bg-red-500/10 border-red-500/30 text-red-400',
                  };
                  return (
                    <div
                      key={key}
                      className={`flex flex-col items-center gap-1 px-1 py-2.5 rounded-lg border text-center transition-all duration-300 ${statusColors[step.status]} ${step.status === 'active' ? 'animate-pulse' : ''}`}
                    >
                      <div className="flex items-center gap-1">
                        {step.status === 'done' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : step.status === 'active' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          icon
                        )}
                      </div>
                      <span className="text-[10px] sm:text-xs font-medium leading-tight">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Current message / progress */}
              {(currentStepMessage || (progress && isGenerating)) && (
                <div className="text-xs text-gray-400 text-center mt-1">
                  {currentStepMessage}
                  {progress && isGenerating && (
                    <span className="ml-2 text-purple-300">
                      (chunk {progress.current}/{progress.total})
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ──── AI DETECTION RESULTS ──── */}
        {detection && (
          <section className="mb-6 animate-fade-in-up">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                <Search className="w-4 h-4 text-emerald-400" />
                <span className="font-medium text-gray-300">AI Detection Results</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Page Type</div>
                  <div className="text-lg font-semibold text-white">{detection.pageType}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Content Summary</div>
                  <div className="text-sm text-gray-300 leading-relaxed">{detection.contentSummary}</div>
                </div>
              </div>

              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Auto-Selected Schema Types</div>
                <div className="flex flex-wrap gap-1.5">
                  {detection.schemaTypes.map((type) => (
                    <span
                      key={type}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Primary Keywords</div>
                <div className="flex flex-wrap gap-1.5">
                  {detection.primaryKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ──── ERROR ──── */}
        {error && (
          <section className="mb-6 animate-fade-in">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-red-300 mb-1">Error</div>
                <div className="text-sm text-red-200/70">{error}</div>
              </div>
            </div>
          </section>
        )}

        {/* ──── STATUS BAR ──── */}
        {(isGenerating || result || error) && (
          <div className={`mb-6 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-all ${
            result
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              : error
                ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                : 'bg-purple-500/10 border border-purple-500/20 text-purple-300'
          }`}>
            {result ? (
              <Check className="w-4 h-4" />
            ) : error ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* ──── OUTPUT SECTION ──── */}
        {result && (
          <section className="mb-6 animate-fade-in-up">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center border-b border-white/[0.06]">
                <button
                  onClick={() => setActiveTab('schema')}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 ${
                    activeTab === 'schema'
                      ? 'border-purple-500 text-purple-300 bg-purple-500/5'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Braces className="w-4 h-4" />
                  Schema Code
                </button>
                <button
                  onClick={() => setActiveTab('html')}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 ${
                    activeTab === 'html'
                      ? 'border-purple-500 text-purple-300 bg-purple-500/5'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  HTML + Schema
                </button>
                <div className="ml-auto pr-3">
                  <button
                    onClick={() =>
                      handleCopy(
                        activeTab === 'schema' ? result.schema : result.htmlWithSchema,
                        activeTab
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 transition-all border border-white/[0.08]"
                  >
                    {copiedField === activeTab ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        {activeTab === 'schema' ? 'Copy Schema' : 'Copy HTML'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Helper text */}
              <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.04] text-xs text-gray-500">
                {activeTab === 'schema' ? (
                  <span className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    Copy-paste this schema into your HTML &lt;head&gt; section
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    Your original HTML with schema already injected — replace your entire file with this
                  </span>
                )}
              </div>

              {/* Code block */}
              <div className="relative">
                <pre className="p-4 text-sm font-mono text-gray-300 bg-[#0d0d20] overflow-auto max-h-[500px] scrollbar-thin whitespace-pre-wrap break-words leading-relaxed">
                  {activeTab === 'schema' ? result.schema : result.htmlWithSchema}
                </pre>
              </div>
            </div>
          </section>
        )}

        {/* ──── STATS FOOTER ──── */}
        {result && (
          <section className="animate-fade-in">
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                📄 Original: {result.stats.originalSize.toLocaleString()} chars
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                🧹 Cleaned: {result.stats.minifiedSize.toLocaleString()} chars
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                🧩 Chunks: {result.stats.chunks}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                📄 Page: {result.stats.pageType}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                🏷️ Schemas: {result.stats.schemaTypes.join(', ')}
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
