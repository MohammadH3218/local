import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

const KNOWN_CATEGORIES = [
  'plumbing',
  'hvac',
  'electrical',
  'pest-control',
  'cleaning',
  'landscaping',
  'roofing',
  'painting',
  'appliance-repair',
  'general-handyman',
] as const;
const MARKETPLACE_AI_MODEL =
  process.env.OPENAI_MARKETPLACE_MODEL ||
  'gpt-4.1-nano';

@Injectable()
export class MarketplaceService {
  private readonly openai: OpenAI;
  /** In-memory cache so we don't geocode the same ZIP twice per process lifetime */
  private readonly zipGeoCache = new Map<string, { lat: number; lng: number } | null>();

  constructor(private readonly dynamodb: DynamoDBService) {
    const apiKey = process.env.OPENAI_API_KEY;
    this.openai = new OpenAI({ apiKey: apiKey || 'dummy' });
  }

  // ─── Haversine ──────────────────────────────────────────────────────────────

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // miles
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── Geocoding ───────────────────────────────────────────────────────────────

  private async geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
    if (this.zipGeoCache.has(zip)) return this.zipGeoCache.get(zip) ?? null;
    try {
      const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=US&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'HandyCall/1.0 (contact@handycall.ai)' },
      });
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (data[0]) {
        const point = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        this.zipGeoCache.set(zip, point);
        return point;
      }
    } catch {
      // Nominatim unavailable — skip geo
    }
    this.zipGeoCache.set(zip, null);
    return null;
  }

  // ─── NLP category extraction ─────────────────────────────────────────────────

  /** Keyword-based fallback when OpenAI is unavailable */
  private extractCategoryKeywords(query: string): string | null {
    const q = query.toLowerCase();
    const map: [string[], string][] = [
      [['plumb', 'pipe', 'leak', 'drain', 'faucet', 'toilet', 'sink', 'water heater', 'hot water'], 'plumbing'],
      [['hvac', 'ac ', 'a/c', 'air condition', 'furnace', 'heat pump', 'duct', 'cooling', 'heating'], 'hvac'],
      [['electric', 'wiring', 'outlet', 'breaker', 'circuit', 'panel', 'switch', 'light'], 'electrical'],
      [['pest', 'bug', 'insect', 'rodent', 'termite', 'roach', 'ant', 'mosquito', 'wasp', 'spider'], 'pest-control'],
      [['clean', 'maid', 'janitor', 'dust', 'vacuum', 'sweep', 'mop', 'spotless'], 'cleaning'],
      [['lawn', 'grass', 'yard', 'garden', 'landscape', 'tree', 'trim', 'mow', 'hedge', 'mulch'], 'landscaping'],
      [['roof', 'shingle', 'gutter', 'fascia', 'soffit', 'attic leak'], 'roofing'],
      [['paint', 'primer', 'stain', 'drywall', 'texture', 'wall coat'], 'painting'],
      [['appliance', 'washer', 'dryer', 'dishwasher', 'refrigerator', 'fridge', 'oven', 'stove', 'microwave'], 'appliance-repair'],
      [['handyman', 'general repair', 'install', 'assemble', 'mount', 'fix', 'odd job'], 'general-handyman'],
    ];
    for (const [keywords, category] of map) {
      if (keywords.some((k) => q.includes(k))) return category;
    }
    return null;
  }

  private async extractCategory(query: string): Promise<string | null> {
    if (!process.env.OPENAI_API_KEY) return this.extractCategoryKeywords(query);
    try {
      const completion = await this.openai.chat.completions.create({
        model: MARKETPLACE_AI_MODEL,
        messages: [
          {
            role: 'user',
            content: `Home service request: "${query}"

Return ONLY the single best matching category slug from this list, or the word "none" if nothing fits:
${KNOWN_CATEGORIES.join(', ')}

Reply with just the slug — no punctuation, no explanation.`,
          },
        ],
        max_tokens: 15,
        temperature: 0,
      });
      const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
      if ((KNOWN_CATEGORIES as readonly string[]).includes(raw)) return raw;
    } catch {
      // OpenAI error — fall back to keyword matching
    }
    return this.extractCategoryKeywords(query);
  }

  async suggestQueries(query: string): Promise<string[]> {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    if (!process.env.OPENAI_API_KEY) {
      const fallbackCategory = this.extractCategoryKeywords(trimmed);
      const base = fallbackCategory
        ? fallbackCategory.replace(/-/g, ' ')
        : 'home service';
      return [
        `${trimmed} near me`,
        `${base} repair estimate`,
        `${base} same day service`,
        `${base} licensed and insured`,
      ].slice(0, 5);
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: MARKETPLACE_AI_MODEL,
        temperature: 0.4,
        max_tokens: 120,
        messages: [
          {
            role: 'user',
            content: `Generate up to 5 short search suggestions for this home-service problem:\n"${trimmed}"\n\nRules:\n- Plain text phrases only\n- No numbering\n- No markdown\n- Keep each under 8 words\n- Return strict JSON array of strings only`,
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content?.trim() || '[]';
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 5);
      }
    } catch {
      // Fall through to deterministic fallback below.
    }

    const fallbackCategory = this.extractCategoryKeywords(trimmed);
    const base = fallbackCategory
      ? fallbackCategory.replace(/-/g, ' ')
      : 'home service';
    return [
      `${trimmed} near me`,
      `${base} quote`,
      `${base} urgent help`,
      `${base} available today`,
    ].slice(0, 5);
  }

  // ─── AI Search ──────────────────────────────────────────────────────────────

  async aiSearch(params: { q: string; zip?: string }) {
    const MAX_MILES = 25;

    // Run AI category extraction + ZIP geocoding in parallel
    const [extractedCategory, searchGeo] = await Promise.all([
      params.q ? this.extractCategory(params.q) : Promise.resolve<string | null>(null),
      params.zip ? this.geocodeZip(params.zip) : Promise.resolve<{ lat: number; lng: number } | null>(null),
    ]);

    // Fetch all active public providers
    const result = await this.dynamodb.scan('companies', {
      filterExpression: '#pub = :t AND #status = :active',
      expressionAttributeNames: { '#pub': 'public_profile_enabled', '#status': 'status' },
      expressionAttributeValues: { ':t': true, ':active': 'ACTIVE' },
      limit: 200,
    });

    let providers = (result.items || []) as any[];

    // Filter by AI-extracted category
    if (extractedCategory) {
      providers = providers.filter((p) => {
        const cats = (p.categories || p.service_types || []) as string[];
        return cats.some((c: string) =>
          c.toLowerCase().replace(/[\s_]/g, '-').includes(extractedCategory),
        );
      });
    }

    // Geo-sort + filter
    if (searchGeo) {
      const scored: Array<{ p: any; dist: number }> = [];

      for (const p of providers) {
        let geo: { lat: number; lng: number } | null = null;

        if (typeof p.latitude === 'number' && typeof p.longitude === 'number') {
          geo = { lat: p.latitude, lng: p.longitude };
        } else if (Array.isArray(p.service_area_zips) && p.service_area_zips.length > 0) {
          geo = await this.geocodeZip(p.service_area_zips[0]);
        }

        if (geo) {
          const dist = this.haversine(searchGeo.lat, searchGeo.lng, geo.lat, geo.lng);
          if (dist <= MAX_MILES) scored.push({ p, dist });
        } else {
          // Provider has no location data — include at the back
          scored.push({ p, dist: 9999 });
        }
      }

      scored.sort((a, b) => a.dist - b.dist);

      return scored.map(({ p, dist }) => ({
        ...this.sanitizeProvider(p),
        distance_miles: dist < 9999 ? Math.round(dist * 10) / 10 : null,
      }));
    }

    // No geo — sort by rating
    providers.sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
    return providers.slice(0, 20).map((p) => ({ ...this.sanitizeProvider(p), distance_miles: null }));
  }

  // ─── Original search (kept for backward compatibility) ────────────────────

  async searchProviders(params: {
    query?: string;
    category?: string;
    zipcode?: string;
    limit?: number;
  }) {
    const limit = params.limit || 20;

    const result = await this.dynamodb.scan('companies', {
      filterExpression: '#public_profile_enabled = :enabled AND #status = :active',
      expressionAttributeNames: {
        '#public_profile_enabled': 'public_profile_enabled',
        '#status': 'status',
      },
      expressionAttributeValues: {
        ':enabled': true,
        ':active': 'ACTIVE',
      },
      limit: limit * 3,
    });

    let providers = (result.items || []) as any[];

    if (params.category) {
      providers = providers.filter((p) => {
        const cats = p.categories || p.service_types || [];
        return cats.some((c: string) => c.toUpperCase().includes(params.category!.toUpperCase()));
      });
    }

    if (params.zipcode) {
      providers = providers.filter((p) => {
        const area = (p.service_area_zips || []) as string[];
        return area.length === 0 || area.includes(params.zipcode!);
      });
    }

    if (params.query) {
      const q = params.query.toLowerCase();
      providers = providers.filter((p) => {
        const name = String(p.company_name || '').toLowerCase();
        const desc = String(p.public_description || p.description || '').toLowerCase();
        return name.includes(q) || desc.includes(q);
      });
    }

    providers.sort((a, b) => {
      const ratingDiff = (b.overall_rating || 0) - (a.overall_rating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return (b.total_reviews || 0) - (a.total_reviews || 0);
    });

    return providers.slice(0, limit).map((p) => this.sanitizeProvider(p));
  }

  async getProviderBySlug(slug: string) {
    const result = await this.dynamodb.scan('companies', {
      filterExpression: '#public_slug = :slug AND #public_profile_enabled = :enabled',
      expressionAttributeNames: {
        '#public_slug': 'public_slug',
        '#public_profile_enabled': 'public_profile_enabled',
      },
      expressionAttributeValues: { ':slug': slug, ':enabled': true },
      limit: 1,
    });

    if (!result.items?.length) return null;
    return this.sanitizeProvider(result.items[0] as any);
  }

  async getProviderById(companyId: string) {
    const item = await this.dynamodb.get('companies', { company_id: companyId });
    if (!item) return null;
    const p = item as any;
    if (!p.public_profile_enabled) return null;
    return this.sanitizeProvider(p);
  }

  async updatePublicProfile(
    companyId: string,
    updates: {
      public_profile_enabled?: boolean;
      public_slug?: string;
      public_description?: string;
      profile_photo_url?: string;
      gallery_urls?: string[];
      service_area_zips?: string[];
      verified?: boolean;
    },
  ) {
    const validUpdates: Record<string, any> = { updated_at: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) validUpdates[key] = value;
    }
    await this.dynamodb.update('companies', { company_id: companyId }, validUpdates);
    return this.dynamodb.get('companies', { company_id: companyId });
  }

  private sanitizeProvider(p: any) {
    return {
      company_id: p.company_id,
      company_name: p.company_name,
      public_slug: p.public_slug,
      public_description: p.public_description || p.description,
      profile_photo_url: p.profile_photo_url,
      gallery_urls: p.gallery_urls || [],
      categories: p.categories || p.service_types || [],
      overall_rating: p.overall_rating || 0,
      total_reviews: p.total_reviews || 0,
      response_time_minutes: p.response_time_minutes,
      verified: p.verified || false,
      badges: p.badges || [],
      city: p.city,
      state: p.state,
      service_area_zips: p.service_area_zips || [],
    };
  }

  async getCategories() {
    return [
      { slug: 'plumbing', label: 'Plumbing' },
      { slug: 'hvac', label: 'HVAC' },
      { slug: 'electrical', label: 'Electrical' },
      { slug: 'pest-control', label: 'Pest Control' },
      { slug: 'cleaning', label: 'Cleaning' },
      { slug: 'landscaping', label: 'Landscaping' },
      { slug: 'roofing', label: 'Roofing' },
      { slug: 'painting', label: 'Painting' },
      { slug: 'appliance-repair', label: 'Appliance Repair' },
      { slug: 'general-handyman', label: 'Handyman' },
    ];
  }
}
