const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── TIPOS DE INTERÉS (FRED API) ──────────────────────
const FRED_KEY = process.env.FRED_API_KEY || 'demo';

const FRED_SERIES = {
  USD: 'FEDFUNDS',
  EUR: 'ECBDFR',
  GBP: 'BOEBRATE',
  JPY: 'IRSTCI01JPM156N',
  CAD: 'INTDSRCAM193N',
  CHF: 'SNBPRATE',
  AUD: 'RBATCTR',
  NZD: 'RBNZOCR',
};

// Tipos hardcoded como fallback (actualizados mayo 2026)
const RATES_FALLBACK = {
  USD: { rate: 5.25, bank: 'FED', flag: '🇺🇸' },
  EUR: { rate: 3.50, bank: 'BCE', flag: '🇪🇺' },
  GBP: { rate: 4.25, bank: 'BoE', flag: '🇬🇧' },
  JPY: { rate: 0.50, bank: 'BoJ', flag: '🇯🇵' },
  CAD: { rate: 2.75, bank: 'BoC', flag: '🇨🇦' },
  CHF: { rate: 0.25, bank: 'SNB', flag: '🇨🇭' },
  AUD: { rate: 3.85, bank: 'RBA', flag: '🇦🇺' },
  NZD: { rate: 3.50, bank: 'RBNZ', flag: '🇳🇿' },
};

// Cache para no llamar a la API cada vez
let cache = {
  rates: null,
  vix: null,
  bonds: null,
  lastUpdate: null,
};

const CACHE_TTL = 60 * 60 * 1000; // 1 hora

function isCacheValid() {
  return cache.lastUpdate && (Date.now() - cache.lastUpdate) < CACHE_TTL;
}

// ── OBTENER VIX desde Yahoo Finance ──────────────────
async function fetchVIX() {
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const prev  = data?.chart?.result?.[0]?.meta?.previousClose;
    if (price) {
      const change = ((price - prev) / prev * 100).toFixed(2);
      return { value: price.toFixed(2), change: `${change > 0 ? '+' : ''}${change}%` };
    }
  } catch(e) {}
  return { value: '16.99', change: '-0.6%' };
}

// ── OBTENER BONDS desde Yahoo Finance ────────────────
async function fetchBonds() {
  const tickers = {
    'US10Y': '^TNX', 'US2Y': '^IRX',
    'DE10Y': 'GY10Y-EUR.SW', 'UK10Y': 'GT10:GOV'
  };
  const results = {};
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (price) results.US10Y = price.toFixed(2);
  } catch(e) {}
  return results;
}

// ── ENDPOINT: /api/data ───────────────────────────────
app.get('/api/data', async (req, res) => {
  try {
    if (isCacheValid()) {
      return res.json({ ...cache, cached: true });
    }

    // Fetch en paralelo
    const [vix, bonds] = await Promise.all([
      fetchVIX(),
      fetchBonds(),
    ]);

    cache = {
      rates: RATES_FALLBACK,
      vix,
      bonds,
      lastUpdate: Date.now(),
      updatedAt: new Date().toISOString(),
    };

    res.json({ ...cache, cached: false });
  } catch(err) {
    res.status(500).json({ error: err.message, rates: RATES_FALLBACK });
  }
});

// ── ENDPOINT: /api/rates ─────────────────────────────
app.get('/api/rates', (req, res) => {
  res.json(RATES_FALLBACK);
});

// ── ENDPOINT: /api/vix ───────────────────────────────
app.get('/api/vix', async (req, res) => {
  const vix = await fetchVIX();
  res.json(vix);
});

// ── HEALTH CHECK ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), lastUpdate: cache.lastUpdate });
});

app.get('/', (req, res) => {
  res.json({ 
    name: 'Lamacrots API', 
    version: '1.0.0',
    endpoints: ['/api/data', '/api/rates', '/api/vix', '/health']
  });
});

app.listen(PORT, () => {
  console.log(`Lamacrots API corriendo en puerto ${PORT}`);
});
