import { pageHash, shortHash, splitAnnouncements, splitParagraphs, textOf } from "@/lib/dept/split";
import type { IngestResult } from "@/lib/pipeline/ingest-post";

export interface DeptPage {
  id: string;
  name: string;
  url: string;
  host: string;
}

export interface InboxMessage {
  id: string;
  messageId: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: string;
}

export interface DeptItem {
  text: string;
  /** Stable per item, so the same announcement is never ingested twice. */
  externalId: string;
  sourceUrl: string | null;
  host: string | null;
  postedAt: string;
}

export interface IngestDeptStore {
  getPageHash(pageId: string): Promise<string | null>;
  setPageHash(pageId: string, hash: string): Promise<void>;
  knownIds(ids: string[]): Promise<Set<string>>;
  record(row: {
    id: string;
    text: string;
    url: string | null;
    postedAt: string;
    result: IngestResult;
  }): Promise<void>;
  listUnprocessed(limit: number): Promise<InboxMessage[]>;
  markProcessed(id: string): Promise<void>;
}

export interface IngestDeptSummary {
  pages_checked: number;
  pages_unchanged: number;
  messages: number;
  items: number;
  new: number;
  published: number;
  errors: number;
  pages_failed: string[];
}

/**
 * Department pages and inbound newsletters become competitions. A page is only reprocessed when its text
 * changed; each announcement inside is processed at most once (ledger); a page that cannot be fetched is
 * skipped with an alert. Newsletters were stored by the webhook and are parsed here, off the request path.
 */
export async function runIngestDept(deps: {
  pages: DeptPage[];
  fetchPage(url: string): Promise<string>;
  store: IngestDeptStore;
  /** Extract + dedupe + publish one announcement. Throws on infrastructure failure so it is retried tomorrow. */
  process(item: DeptItem): Promise<IngestResult>;
  now?: Date;
  alert?: (message: string) => Promise<void>;
  log?: (e: string, d?: Record<string, unknown>) => void;
}): Promise<IngestDeptSummary> {
  const now = (deps.now ?? new Date()).toISOString();
  const s: IngestDeptSummary = {
    pages_checked: 0,
    pages_unchanged: 0,
    messages: 0,
    items: 0,
    new: 0,
    published: 0,
    errors: 0,
    pages_failed: [],
  };

  const handle = async (items: DeptItem[]): Promise<boolean> => {
    s.items += items.length;
    const known = await deps.store.knownIds(items.map((i) => i.externalId));
    let ok = true;
    for (const item of items) {
      if (known.has(item.externalId)) continue;
      s.new++;
      try {
        const result = await deps.process(item);
        if (result.outcome === "published" || result.outcome === "merged") s.published++;
        if (result.class === "error") s.errors++;
        else
          await deps.store.record({
            id: item.externalId,
            text: item.text,
            url: item.sourceUrl,
            postedAt: item.postedAt,
            result,
          });
      } catch (e) {
        ok = false;
        s.errors++;
        deps.log?.("item_failed", {
          id: item.externalId,
          error: String((e as Error).message ?? e),
        });
      }
    }
    return ok;
  };

  for (const page of deps.pages) {
    s.pages_checked++;
    let html: string;
    try {
      html = await deps.fetchPage(page.url);
    } catch (e) {
      s.pages_failed.push(page.id);
      deps.log?.("page_failed", { page: page.id, error: String((e as Error).message ?? e) });
      await deps.alert?.(
        `The department page "${page.name}" could not be read (${String((e as Error).message ?? e)}). It was skipped.`,
      );
      continue;
    }
    const hash = pageHash(textOf(html));
    if ((await deps.store.getPageHash(page.id)) === hash) {
      s.pages_unchanged++;
      continue;
    }
    const items = splitAnnouncements(html).map((text) => ({
      text,
      externalId: `page:${page.id}#${shortHash(text)}`,
      sourceUrl: page.url,
      host: page.host,
      postedAt: now,
    }));
    // Remember the page version only when every item was handled, so a failed one is retried tomorrow.
    if (await handle(items)) await deps.store.setPageHash(page.id, hash);
  }

  for (const m of await deps.store.listUnprocessed(50)) {
    s.messages++;
    const items = splitParagraphs(m.body).map((text) => ({
      text: `${m.subject}\n${text}`,
      externalId: `mail:${shortHash(m.messageId)}#${shortHash(text)}`,
      sourceUrl: null,
      host: null,
      postedAt: m.receivedAt,
    }));
    if (await handle(items)) await deps.store.markProcessed(m.id);
  }
  return s;
}
