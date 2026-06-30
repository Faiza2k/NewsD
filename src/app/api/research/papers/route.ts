import { getCached, setCache } from '@/lib/feeds/cache';
import type { ResearchPaper } from '@/types';

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const ARXIV_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV'];

function parseArxivXml(xml: string): ResearchPaper[] {
  const papers: ResearchPaper[] = [];

  // Parse entries from Atom XML
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const getId = (s: string) => {
      const m = s.match(/<id>(.*?)<\/id>/);
      return m ? m[1].trim() : '';
    };
    const getTitle = (s: string) => {
      const m = s.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      return m ? m[1].replace(/\s+/g, ' ').trim() : '';
    };
    const getAbstract = (s: string) => {
      const m = s.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
      return m ? m[1].replace(/\s+/g, ' ').trim() : '';
    };
    const getPublished = (s: string) => {
      const m = s.match(/<published>(.*?)<\/published>/);
      return m ? m[1].trim() : new Date().toISOString();
    };
    const getUpdated = (s: string) => {
      const m = s.match(/<updated>(.*?)<\/updated>/);
      return m ? m[1].trim() : undefined;
    };
    const getAuthors = (s: string) => {
      const authors: string[] = [];
      const authorRegex = /<author>\s*<name>(.*?)<\/name>/g;
      let am;
      while ((am = authorRegex.exec(s)) !== null) {
        authors.push(am[1].trim());
      }
      return authors;
    };
    const getCategories = (s: string) => {
      const cats: string[] = [];
      const catRegex = /<category[^>]+term="([^"]+)"/g;
      let cm;
      while ((cm = catRegex.exec(s)) !== null) {
        cats.push(cm[1]);
      }
      return cats;
    };
    const getLinks = (s: string) => {
      const pdfMatch = s.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/);
      const htmlMatch = s.match(/<link[^>]+type="text\/html"[^>]+href="([^"]+)"/);
      return {
        pdf: pdfMatch ? pdfMatch[1] : '',
        html: htmlMatch ? htmlMatch[1] : '',
      };
    };

    const id = getId(entry);
    const links = getLinks(entry);

    papers.push({
      id,
      title: getTitle(entry),
      authors: getAuthors(entry),
      abstract: getAbstract(entry).slice(0, 500),
      publishedAt: getPublished(entry),
      updatedAt: getUpdated(entry),
      categories: getCategories(entry),
      pdfUrl: links.pdf || `${id.replace('abs', 'pdf')}.pdf`,
      arxivUrl: links.html || id,
    });
  }

  return papers;
}

export async function GET() {
  const cacheKey = 'research:papers';
  const cached = getCached<ResearchPaper[]>(cacheKey);

  if (cached) {
    return Response.json({
      papers: cached,
      lastUpdated: new Date().toISOString(),
    });
  }

  try {
    // Fetch recent AI/ML papers from arXiv
    const query = 'cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL';
    const response = await fetch(
      `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=25`,
      {
        headers: {
          'User-Agent': 'NewsDash/1.0',
        },
        next: { revalidate: 1800 },
      }
    );

    if (!response.ok) {
      throw new Error(`arXiv API error: ${response.status}`);
    }

    const xml = await response.text();
    const papers = parseArxivXml(xml);

    setCache(cacheKey, papers, CACHE_TTL);

    return Response.json({
      papers,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Research API] Error:', error);
    return Response.json({
      papers: [],
      lastUpdated: new Date().toISOString(),
      error: 'Failed to fetch research papers',
    }, { status: 200 });
  }
}
