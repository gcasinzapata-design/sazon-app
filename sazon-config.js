// ═══════════════════════════════════════════════════════════════════════
//  SAZÓN GROWTH ENGINE — CONFIG
// ═══════════════════════════════════════════════════════════════════════

window.SAZON_CONFIG = {
  supabase: {
    url:     'https://qetiugzeqyhicgwxxxvv.supabase.co',
    anonKey: 'sb_publishable_4GWSQLtpamKi0rI_cELbJw_JS5B86Pc',
  },
  contact: {
    whatsapp:      '+51952363643',
    email:         'gc.asin.zapata@gmail.com',
    demoUrl:       'https://sazonpartner.com/#contacto',
  },
  tiers: {
    starter: {
      label:  'Starter',
      priceUsd: 79,
      maxBrands:    1,
      maxLocations: 2,
      historyMonths: 3,
      analysesPerMonth: 5,
      tabs: ['dashboard', 'patrones', 'menu', 'costos', 'roas', 'tendencias', 'reclamos'],
    },
    growth: {
      label:  'Growth',
      priceUsd: 199,
      maxBrands:    1,
      maxLocations: 5,
      historyMonths: 6,
      analysesPerMonth: 20,
      tabs: ['dashboard', 'patrones', 'precios', 'menu', 'combos', 'promos', 'adq', 'ticket', 'retencion', 'costos', 'roas', 'tendencias', 'tiempos', 'reclamos'],
    },
    partner: {
      label:  'Partner',
      priceUsd: 499,
      maxBrands:    3,
      maxLocations: 999,
      historyMonths: 12,
      analysesPerMonth: 999,
      tabs: ['dashboard', 'patrones', 'precios', 'menu', 'combos', 'promos', 'adq', 'ticket', 'retencion', 'costos', 'roas', 'tendencias', 'tiempos', 'reclamos', 'roadmap'],
    },
    enterprise: {
      label:  'Enterprise',
      priceUsd: 999,
      maxBrands:    999,
      maxLocations: 999,
      historyMonths: 24,
      analysesPerMonth: 999,
      tabs: ['dashboard', 'patrones', 'precios', 'menu', 'combos', 'promos', 'adq', 'ticket', 'retencion', 'costos', 'roas', 'tendencias', 'tiempos', 'reclamos', 'roadmap'],
    },
  },
  subscriptionBehavior: {
    trial:     { access: 'full',     banner: 'trial'    },
    active:    { access: 'full',     banner: null       },
    grace:     { access: 'full',     banner: 'grace'    },
    past_due:  { access: 'readonly', banner: 'past_due' },
    suspended: { access: 'blocked',  banner: 'suspended'},
    cancelled: { access: 'blocked',  banner: 'cancelled'},
  },
  countries: {
    PE: { name: 'Perú',     tz: 'America/Lima',      currency: 'PEN', platforms: ['rappi','peya','didi'] },
    CO: { name: 'Colombia', tz: 'America/Bogota',    currency: 'COP', platforms: ['rappi','didi'] },
    CL: { name: 'Chile',    tz: 'America/Santiago',  currency: 'CLP', platforms: ['peya','rappi','ubereats','justo'] },
    EC: { name: 'Ecuador',  tz: 'America/Guayaquil', currency: 'USD', platforms: ['rappi','peya','ubereats'] },
  },
};
