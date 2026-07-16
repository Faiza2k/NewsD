export type AskChannel = 'whatsapp' | 'discord';

export type SourceButton = {
  type?: string;
  text?: string;
  url?: string;
};

export type AskQueryRequest = {
  q: string;
  limit?: number;
  chatId: string;
  previousQ?: string;
  previousIntent?: string;
  history?: Array<{ role?: string; content?: string; text?: string }>;
  lang?: string;
  replyLang?: 'en' | 'ur';
};

export type AskQueryResult = {
  query?: string;
  rawQuery?: string;
  effectiveQuery?: string;
  intent?: string;
  brief?: string;
  whatsappText?: string;
  sourceButtons?: SourceButton[];
  usedMemory?: boolean;
  error?: string;
};
