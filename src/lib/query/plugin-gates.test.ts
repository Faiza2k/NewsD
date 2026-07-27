import { describe, expect, it } from 'vitest';
import { verifyDiscordSignature } from '@/lib/discord/verify';
import { detectObviousPlugin, isSmallTalkHeuristic } from '@/lib/query/classify-turn';
import { isIdentityAsk } from '@/lib/query/persona';
import {
  awaitingWeatherCitySlot,
  containsPumpPriceLeak,
  extractWeatherCitiesFromAsk,
  isSpuriousWeatherLocation,
  looksLikeCitySlotFill,
  requestedPumpProducts,
  stripWeatherFillers,
  wantsPakistanPumpFuel,
  WEATHER_NON_CITY,
} from '@/lib/query/plugin-gates';

describe('weather filler / city extraction (prod gates)', () => {
  it('strips Roman Urdu weather fillers so kesa is never a city', () => {
    expect(stripWeatherFillers('mosam kesa hai')).toBe('');
    expect(extractWeatherCitiesFromAsk('mosam kesa hai')).toEqual([]);
    expect(WEATHER_NON_CITY.has('kesa')).toBe(true);
  });

  it('extracts Zhob from zhob mai', () => {
    expect(extractWeatherCitiesFromAsk('zhob mai')).toEqual(['Zhob']);
    expect(looksLikeCitySlotFill('zhob mai')).toBe(true);
  });

  it('bare weather asks yield no invented city', () => {
    expect(extractWeatherCitiesFromAsk('weather')).toEqual([]);
    expect(extractWeatherCitiesFromAsk('mosam')).toEqual([]);
  });

  it('slot-fill only after need-city weather turn', () => {
    expect(
      awaitingWeatherCitySlot({
        memoryIntent: 'weather',
        lastBrief: 'Need city for weather',
      }),
    ).toBe(true);
    expect(
      awaitingWeatherCitySlot({
        memoryIntent: 'news',
        lastBrief: 'Need city for weather',
      }),
    ).toBe(false);
    expect(looksLikeCitySlotFill('OpenAI news')).toBe(false);
  });

  it('flags PNG/Kesa-class spurious locations', () => {
    expect(isSpuriousWeatherLocation('Kesa, Madang Province, Papua New Guinea')).toBe(true);
    expect(isSpuriousWeatherLocation('Zhob, Balochistan, Pakistan')).toBe(false);
  });
});

describe('fuel product filter (prod gates)', () => {
  it('petrol-only and diesel-only', () => {
    expect(requestedPumpProducts('petrol price')).toEqual({ petrol: true, diesel: false });
    expect(requestedPumpProducts('diesel keemat')).toEqual({ petrol: false, diesel: true });
  });

  it('generic fuel shows both; crude is not pump', () => {
    expect(requestedPumpProducts('fuel price')).toEqual({ petrol: true, diesel: true });
    expect(wantsPakistanPumpFuel('petrol price')).toBe(true);
    expect(wantsPakistanPumpFuel('WTI crude barrel')).toBe(false);
  });

  it('detects pump price leak text', () => {
    expect(containsPumpPriceLeak('*Petrol:* Rs 327 / litre')).toBe(true);
    expect(containsPumpPriceLeak('OpenAI launched a new model.')).toBe(false);
  });
});

describe('identity / small-talk never news-shaped', () => {
  it('identity asks are detected', () => {
    expect(isIdentityAsk("what's your name?")).toBe(true);
    expect(isIdentityAsk('tell me your name')).toBe(true);
    expect(isIdentityAsk('apna naam batao')).toBe(true);
    expect(isIdentityAsk('aapka naam kya hai')).toBe(true);
    expect(isIdentityAsk('who is the new OpenAI CEO?')).toBe(false);
  });

  it('obvious plugins for live prices', () => {
    expect(detectObviousPlugin('bitcoin price')).toMatchObject({
      kind: 'plugin',
      plugin: 'crypto_price',
    });
    expect(detectObviousPlugin('mosam kesa hai')).toMatchObject({
      kind: 'plugin',
      plugin: 'weather',
    });
  });

  it('small talk heuristic', () => {
    expect(isSmallTalkHeuristic('thanks')).toBe(true);
  });
});

describe('Discord signature gate', () => {
  it('rejects missing signature material', () => {
    expect(verifyDiscordSignature('aa'.repeat(32), null, '123', '{}')).toBe(false);
    expect(verifyDiscordSignature('aa'.repeat(32), 'bb', null, '{}')).toBe(false);
  });

  it('rejects wrong-length keys', () => {
    expect(verifyDiscordSignature('abcd', '00'.repeat(64), String(Math.floor(Date.now() / 1000)), '{}')).toBe(
      false,
    );
  });
});
