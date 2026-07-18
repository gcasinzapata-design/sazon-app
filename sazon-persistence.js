// ═══════════════════════════════════════════════════════════════════════
//  SAZÓN GROWTH ENGINE — PERSISTENCE MODULE
//  Sprint 2 A.1: Guardar/cargar análisis desde Supabase
// ═══════════════════════════════════════════════════════════════════════

window.SAZON_PERSISTENCE = (function() {

  // ─── PRIVATE HELPERS ─────────────────────────────────────────────

  /**
   * Detecta el período (fechas mín/máx) desde el array de órdenes
   */
  function detectPeriod(orders) {
    if (!orders || orders.length === 0) return { start: null, end: null };
    const dates = orders
      .filter(o => o.date instanceof Date)
      .map(o => o.date.getTime());
    if (dates.length === 0) return { start: null, end: null };
    return {
      start: new Date(Math.min(...dates)).toISOString(),
      end:   new Date(Math.max(...dates)).toISOString()
    };
  }

  /**
   * Genera un nombre automático basado en el período detectado
   * Ej: "Análisis del 1-31 May 2026" o "Análisis del 17 Jul 2026"
   */
  function autoName(orders) {
    const period = detectPeriod(orders);
    if (!period.start) {
      return 'Análisis del ' + new Date().toLocaleDateString('es-PE', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    }
    const s = new Date(period.start);
    const e = new Date(period.end);
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameMonth) {
      return `Análisis ${s.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })}`;
    }
    return `Análisis ${s.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} — ${e.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  /**
   * Snapshot del config actual de la marca al momento del análisis
   */
  function snapshotConfig(brand) {
    if (!brand) return {};
    return {
      fee_rappi_pct:    brand.fee_rappi_pct    ?? null,
      fee_peya_pct:     brand.fee_peya_pct     ?? null,
      fee_didi_pct:     brand.fee_didi_pct     ?? null,
      fee_glovo_pct:    brand.fee_glovo_pct    ?? null,
      fee_ubereats_pct: brand.fee_ubereats_pct ?? null,
      fee_ifood_pct:    brand.fee_ifood_pct    ?? null,
      fee_justo_pct:    brand.fee_justo_pct    ?? null,
      food_cost_pct:    brand.food_cost_pct    ?? null,
      country:          brand.country ?? 'PE',
      timezone:         brand.timezone ?? 'America/Lima',
      currency:         brand.currency_display ?? 'USD',
      snapshotted_at:   new Date().toISOString()
    };
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────

  /**
   * Verifica si la marca puede crear un análisis nuevo este mes según su tier
   * @returns {Promise<{can_create, plan, limit, used, remaining}>}
   */
  async function checkQuota(supabase, brandId) {
    const { data, error } = await supabase.rpc('check_analysis_quota', {
      p_brand_id: brandId
    });
    if (error) {
      console.error('checkQuota error:', error);
      return { can_create: false, error: error.message };
    }
    return data;
  }

  /**
   * Guarda un análisis en Supabase
   * @param {Object} params
   * @param {Object} params.supabase - Cliente Supabase autenticado
   * @param {Object} params.brand - Registro de la marca del usuario
   * @param {Array}  params.orders - Array de órdenes procesadas
   * @param {Object} params.modules - Resultados de cada módulo (dashboard, patrones, etc.)
   * @param {Array}  params.files - Metadata de archivos originales [{name, size, platform, format}]
   * @param {Number} params.processingMs - ms que tomó procesar
   * @param {String} [params.customName] - Nombre custom (si null, se auto-genera)
   * @returns {Promise<{success, analysisId, error}>}
   */
  async function saveAnalysis({
    supabase, brand, orders, modules, files, processingMs, customName
  }) {
    if (!supabase || !brand) {
      return { success: false, error: 'Missing supabase or brand' };
    }

    try {
      // 1. Verificar quota
      const quota = await checkQuota(supabase, brand.id);
      if (!quota.can_create) {
        return {
          success: false,
          error: `Alcanzaste el límite de ${quota.limit} análisis mensuales del plan ${quota.plan}. Upgrade para más análisis.`,
          quotaExceeded: true,
          quota
        };
      }

      // 2. Preparar metadata v2
      const period = detectPeriod(orders);
      const done = orders.filter(o => !o.cancelled && o.total > 0);
      const cancelled = orders.filter(o => o.cancelled);
      const gmv = done.reduce((s, o) => s + (o.total || 0), 0);
      const platforms = [...new Set(done.map(o => o.platform).filter(Boolean))];

      const metadata = {
        version: 2,
        created_from: 'browser',
        processing_ms: processingMs || null,

        sources: {
          files: files || [],
          menu_loaded: !!(window.APP?.menu?.length > 0),
        },

        kpis: {
          orders_total: orders.length,
          orders_completed: done.length,
          orders_cancelled: cancelled.length,
          gmv: gmv,
          avg_ticket: done.length > 0 ? gmv / done.length : 0,
          cancellation_pct: orders.length > 0 ? (cancelled.length / orders.length) * 100 : 0,
          period_start: period.start,
          period_end: period.end,
          platforms: platforms
        },

        modules: modules || {}
      };

      const configSnapshot = snapshotConfig(brand);
      const analysisName = (customName || '').trim() || autoName(orders);

      // 3. Llamar a la función SQL create_analysis
      const { data, error } = await supabase.rpc('create_analysis', {
        p_brand_id: brand.id,
        p_name: analysisName,
        p_metadata: metadata,
        p_config_snapshot: configSnapshot,
        p_files_count: files?.length || 0,
        p_processing_ms: processingMs || null
      });

      if (error) {
        console.error('saveAnalysis SQL error:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        analysisId: data,
        name: analysisName,
        expiresAt: null // se puede leer con getAnalysis(data)
      };
    } catch (err) {
      console.error('saveAnalysis exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Sube archivo original a Supabase Storage (solo Partner+)
   * @returns {Promise<{success, storagePath, error}>}
   */
  async function uploadRawFile({
    supabase, brand, analysisId, file, plan
  }) {
    // Solo Partner+ pueden guardar archivos originales
    if (!['partner', 'enterprise'].includes(plan)) {
      return {
        success: false,
        error: 'Almacenamiento de archivos originales solo disponible en Partner+',
        skipped: true
      };
    }

    try {
      const storagePath = `${brand.id}/${analysisId}/${file.name}`;
      const { data, error } = await supabase.storage
        .from('raw-uploads')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('uploadRawFile error:', error);
        return { success: false, error: error.message };
      }

      // Registrar en tabla files
      const { error: fErr } = await supabase.from('files').insert({
        analysis_id: analysisId,
        brand_id: brand.id,
        filename: file.name,
        size_bytes: file.size,
        storage_path: data.path
      });

      if (fErr) {
        console.warn('Files table insert failed:', fErr);
      }

      return { success: true, storagePath: data.path };
    } catch (err) {
      console.error('uploadRawFile exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Lista análisis previos de la marca (para "Mis análisis previos")
   */
  async function listAnalyses(supabase, brandId, options = {}) {
    const limit = options.limit || 50;

    const { data, error } = await supabase
      .from('analyses')
      .select('id, name, custom_name, created_at, expires_at, period_start, period_end, orders_count, gmv, avg_ticket, platforms, files_count')
      .eq('brand_id', brandId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('listAnalyses error:', error);
      return { success: false, error: error.message, analyses: [] };
    }

    // Aplicar el nombre custom si existe, sino el auto
    const analyses = (data || []).map(a => ({
      ...a,
      display_name: a.custom_name || a.name
    }));

    return { success: true, analyses };
  }

  /**
   * Carga un análisis específico con todos sus datos (metadata + módulos)
   */
  async function getAnalysis(supabase, analysisId) {
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.error('getAnalysis error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, analysis: data };
  }

  /**
   * Renombra un análisis
   */
  async function renameAnalysis(supabase, analysisId, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) return { success: false, error: 'El nombre no puede estar vacío' };
    if (trimmed.length > 200) return { success: false, error: 'Máximo 200 caracteres' };

    const { error } = await supabase
      .from('analyses')
      .update({ custom_name: trimmed })
      .eq('id', analysisId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  /**
   * Elimina un análisis (soft delete)
   */
  async function deleteAnalysis(supabase, analysisId) {
    const { error } = await supabase
      .from('analyses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', analysisId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // ─── EXPORT ─────────────────────────────────────────────────────
  return {
    checkQuota,
    saveAnalysis,
    uploadRawFile,
    listAnalyses,
    getAnalysis,
    renameAnalysis,
    deleteAnalysis,

    // Helpers exportados para testing
    _internal: {
      detectPeriod,
      autoName,
      snapshotConfig
    }
  };
})();
