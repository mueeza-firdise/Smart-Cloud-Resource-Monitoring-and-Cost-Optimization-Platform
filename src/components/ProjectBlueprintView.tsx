import {useEffect, useMemo, useState} from 'react';
import {Check, Copy, FileCode2, Search} from 'lucide-react';

interface ProjectBlueprintViewProps {
  token: string;
}

const VIVA_QA = [
  {
    q: 'Why did you choose Linear Regression for CPU prediction?',
    a: 'Linear Regression provides fast, interpretable, low-latency forecasting with O(d) inference time and zero GPU overhead. It captures linear relationships between concurrent users, network load, memory pressure, and next-interval CPU utilization.',
  },
  {
    q: 'How does proactive auto-scaling differ from reactive auto-scaling?',
    a: 'Reactive scaling waits until CPU crosses 80% before provisioning servers, causing request latency during boot time. Proactive ML-based scaling predicts future CPU utilization ahead of time and provisions capacity before saturation occurs.',
  },
  {
    q: 'How do you prevent oscillation (thrashing) in server scaling?',
    a: 'We define a dead-band healthy zone between 30% and 80% predicted CPU where the cluster holds steady, plus hard floor/ceiling constraints (Minimum 2 servers for high availability, Maximum 20 servers for budget control).',
  },
  {
    q: 'How is cost optimization calculated in this project?',
    a: 'Each virtual server costs ₹10/hour. We compare the elastic auto-scaled fleet cost against static peak provisioning (9 servers provisioned 24/7 = ₹2,160/day). Maintaining 5 servers during moderate load costs ₹1,200/day, saving ₹960/day.',
  },
  {
    q: 'What are the core tables persisted in Cloud SQL PostgreSQL and Firestore?',
    a: 'Cloud SQL PostgreSQL (Drizzle ORM) stores users, resource_logs, predictions, scaling_history, cost_history, scaling_config, and grounded chat_messages. Firestore stores user profiles, saved scaling threshold presets, and bookmarked cluster snapshots across devices.',
  },
];

export function ProjectBlueprintView({token}: ProjectBlueprintViewProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<string>('app.py');
  const [fileContent, setFileContent] = useState<string>('');
  const [truncatedNote, setTruncatedNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/project-files', {
      headers: {Authorization: `Bearer ${token}`},
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.files)) {
          setFiles(data.files);
          if (data.files.includes('app.py')) {
            setSelectedFile('app.py');
          } else if (data.files.length > 0) {
            setSelectedFile(data.files[0]);
          }
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!selectedFile) return;
    fetch(`/api/project-file?path=${encodeURIComponent(selectedFile)}`, {
      headers: {Authorization: `Bearer ${token}`},
    })
      .then((res) => res.json())
      .then((data) => {
        setFileContent(data.content || '');
        setTruncatedNote(
          data.truncated
            ? `Showing first 60 of ${data.totalLines} lines for readability.`
            : null,
        );
      })
      .catch(() => {});
  }, [selectedFile, token]);

  const filteredFiles = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, filterQuery]);

  async function handleCopy() {
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const lineCount = fileContent ? fileContent.split('\n').length : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3">
          <div>
            <div className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Flask + Scikit-Learn Source (project/)
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
              {files.length} project artifacts
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter project files..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filteredFiles.length === 0 ? (
              <div className="py-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                No matching files found.
              </div>
            ) : (
              filteredFiles.map((file) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer ${
                    selectedFile === file
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{file}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                project/{selectedFile}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {lineCount} lines
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>
          {truncatedNote && (
            <div className="px-5 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              {truncatedNote}
            </div>
          )}
          <pre className="p-5 text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/60 overflow-x-auto max-h-[28rem] leading-relaxed">
            {fileContent}
          </pre>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 mb-4">
          Architecture &amp; Technical Interview Q&amp;A
        </h3>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {VIVA_QA.map((item, idx) => (
            <div key={item.q} className="py-4 first:pt-0 last:pb-0">
              <div className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                {String(idx + 1).padStart(2, '0')}. {item.q}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
