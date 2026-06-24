import { Bookmark, GitCompare, Search, Sparkles, Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

type PreviewRepo = {
  owner: string;
  name: string;
  description: string;
  language: string;
  languageColor: string;
  stars: string;
  similarity: number;
  topics: string[];
  saved: boolean;
  compared: boolean;
};

const PREVIEW_QUERY = 'vector database for embeddings';

const PREVIEW_REPOS: PreviewRepo[] = [
  {
    owner: 'qdrant',
    name: 'qdrant',
    description:
      'High-performance vector similarity search engine with extended filtering support.',
    language: 'Rust',
    languageColor: '#dea584',
    stars: '22.5k',
    similarity: 0.94,
    topics: ['vector-search', 'embeddings', 'rust'],
    saved: true,
    compared: true,
  },
  {
    owner: 'chroma-core',
    name: 'chroma',
    description: 'AI-native open-source embedding database for building LLM apps with memory.',
    language: 'Python',
    languageColor: '#3572A5',
    stars: '18.2k',
    similarity: 0.91,
    topics: ['llm', 'embeddings', 'database'],
    saved: false,
    compared: true,
  },
  {
    owner: 'pgvector',
    name: 'pgvector',
    description: 'Open-source vector similarity search for Postgres — fast ANN with HNSW indexes.',
    language: 'C',
    languageColor: '#555555',
    stars: '12.4k',
    similarity: 0.89,
    topics: ['postgres', 'ann', 'embeddings'],
    saved: true,
    compared: false,
  },
];

export function LandingHeroPreview() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative w-full select-none overflow-hidden rounded-2xl border bg-card/80 p-3 shadow-xl shadow-black/5 backdrop-blur sm:p-4 dark:bg-card/50 dark:shadow-black/30"
    >
      <div className="mb-3 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="size-2.5 rounded-full bg-rose-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-2 truncate font-mono">starboard.app/discover</span>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2 text-sm">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-foreground">{PREVIEW_QUERY}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          <Sparkles className="size-3" />
          Semantic
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>3 of 1,284 results · ranked by cosine similarity</span>
        <span className="hidden items-center gap-1 sm:inline-flex">
          <GitCompare className="size-3" />2 selected to compare
        </span>
      </div>

      <ul className="mt-2 space-y-2">
        {PREVIEW_REPOS.map((repo) => (
          <li key={`${repo.owner}/${repo.name}`} className="rounded-lg border bg-background/60 p-3">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <span
                  className={`flex size-5 items-center justify-center rounded border text-[10px] ${
                    repo.compared
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground/70'
                  }`}
                >
                  {repo.compared ? '✓' : ''}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium">
                    <span className="text-muted-foreground">{repo.owner}/</span>
                    {repo.name}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground/80">
                    {repo.similarity.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {repo.description}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: repo.languageColor }}
                    />
                    {repo.language}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="size-3 fill-current" />
                    {repo.stars}
                  </span>
                  {repo.topics.slice(0, 2).map((topic) => (
                    <Badge key={topic} variant="secondary" className="text-[10px] font-normal">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
              <Bookmark
                className={`size-4 shrink-0 ${
                  repo.saved ? 'fill-primary text-primary' : 'text-muted-foreground/60'
                }`}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5 text-foreground/80">
          <GitCompare className="size-3 text-primary" />
          Compare qdrant vs chroma →
        </span>
        <span className="hidden sm:inline">stars · activity · stack · license</span>
      </div>
    </div>
  );
}
