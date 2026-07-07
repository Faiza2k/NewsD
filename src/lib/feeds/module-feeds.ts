import type { FeedSource } from '@/types';
import { FEED_SOURCES } from './registry';

export type IntelligenceModule = 'clouddevops' | 'forex' | 'gold' | 'cybersecurity';

const CLOUD_DEVOPS_IDS = new Set([
  'aws-news',
  'aws-devops',
  'azure-blog',
  'google-cloud',
  'cloudflare-blog',
  'docker-blog',
  'kubernetes-blog',
  'thenewstack',
  'hashicorp',
  'cncf',
  'grafana',
  'pulumi',
  'datadog',
  'linode-blog',
  'redhat-blog',
  'circleci-blog',
  'azure-devops-ms',
  'istio-blog',
  'newrelic-blog',
  'digitalocean-blog',
  'github-engineering',
  'reddit-devops',
]);

const FOREX_IDS = new Set([
  'forexlive',
  'investing-com',
  'investing-forex',
  'reddit-forex',
  'fed-press',
  'fxstreet',
  'bls-cpi',
  'marketwatch-economy',
  'marketwatch-bonds',
  'ecb-press',
  'boe-news',
  'fed-speeches',
  'ecb-press2',
  'yahoo-finance-forex',
  'fxstreet-commodities',
]);

const GOLD_IDS = new Set([
  'kitco-gold',
  'kitco-silver',
  'wgc-gold',
  'goldseek',
  'silver-institute',
  'investing-gold-news',
  'bullionstar',
  'metals-focus',
  'silver-doctors',
  'goldmoney-research',
  'platinum-today',
  'investing-silver-news',
  'oilprice',
  'ft-commodities',
  'cnbc-commodities',
  'marketwatch-metals-news',
  'investing-metals',
  'investing-commodities',
]);

const CYBERSECURITY_IDS = new Set([
  'krebs',
  'darkreading',
  'bleepingcomputer',
  'therecord',
  'hackernews-security',
  'thehackernews',
  'schneier',
  'threatpost',
  'zdnet-security',
  'securityweek',
  'reddit-netsec',
]);

function matchesSubcategory(feed: FeedSource, pattern: RegExp): boolean {
  return feed.subcategories.some((s) => pattern.test(s));
}

export function getFeedsForModule(moduleId: IntelligenceModule): FeedSource[] {
  switch (moduleId) {
    case 'clouddevops':
      return FEED_SOURCES.filter(
        (f) =>
          CLOUD_DEVOPS_IDS.has(f.id) ||
          matchesSubcategory(f, /cloud|devops|k8s|kubernetes|container|cncf|istio|pulumi/)
      );
    case 'forex':
      return FEED_SOURCES.filter(
        (f) =>
          FOREX_IDS.has(f.id) ||
          matchesSubcategory(
            f,
            /forex|currency|central-bank|interest-rate|inflation|economic-indicator|bonds/
          ) ||
          /forex|fed-|ecb|bls|fxstreet/i.test(f.id)
      );
    case 'gold':
      return FEED_SOURCES.filter(
        (f) =>
          GOLD_IDS.has(f.id) ||
          matchesSubcategory(
            f,
            /gold|silver|metal|mining|platinum|palladium|commodit|bullion|market-analysis/
          ) ||
          /kitco|gold|silver|bullion|metals/i.test(f.id)
      );
    case 'cybersecurity':
      return FEED_SOURCES.filter(
        (f) =>
          CYBERSECURITY_IDS.has(f.id) ||
          // Most security feeds in the expanded registry use these subcategory keywords
          matchesSubcategory(
            f,
            /security|cyber|vuln|vulnerability|breach|ransomware|malware|threat|incident|exploit|cve/
          ) ||
          /security|cyber|infosec|netsec|cve|ransom|malware/i.test(f.id)
      );
    default:
      return [];
  }
}

export function isIntelligenceModule(value: string): value is IntelligenceModule {
  return value === 'clouddevops' || value === 'forex' || value === 'gold' || value === 'cybersecurity';
}
