// ═══════════════════════════════════════════════════════════════════════
//  SAZÓN PERSISTENCE — biblioteca de acceso a Supabase
//  Sprint 4: Modelo agregativo con dedup y snapshots
// ═══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const SAZON_PERSISTENCE = {

    // ─── SPRINT 4: ÓRDENES UNIFICADAS ─────────────────────────────────

    /**
     * Guarda órdenes en el historial acumulado (dedup por brand+platform+order_id)
     * @param {Object} supabase - cliente Supabase
     * @param {string} brandId - ID de la marca
     * @param {Array} orders - array de órdenes normalizadas
     * @param {string} sourceFile - nombre del archivo original
     * @returns {Promise<{success, inserted, updated, skipped, error}>}
     */
    async saveOrdersToHistory(supabase, brandId, orders, sourceFile) {
      if (!supabase || !brandId || !Array.isArray(orders) || orders.length === 0) {
        return { success: false, error: 'Datos inválidos' };
      }

      try {
        // Preparar payload para el RPC
        const payload = orders.map(o => ({
          platform: o.platform || 'rappi',
          order_id: String(o.id || o.order_id || ''),
          order_date: o.date instanceof Date ? o.date.toISOString() : o.date,
          status: o.estado || o.status || null,
          cancelled: !!o.cancelled,

          branch_id: o.branchId || o.branch_id || null,
          branch_name: o.sucursal || o.branch_name || 'Principal',

          gmv: o.total || o.gmv || 0,
          base_price: o.basePrice || o.base_price || null,
          discount_amt: o.discAmt || o.discount_amt || null,
          discount_pct: o.discPct || o.discount_pct || null,
          commission: o.comision || o.commission || null,

          cost_ads: o.costs?.adsSpend || null,
          cost_ads_tax: o.costs?.taxAds || null,
          cost_dar: o.costs?.darDiscount || null,
          cost_free_delivery: o.costs?.freeDelivery || null,
          cost_integration: o.costs?.integration || null,
          cost_late: o.costs?.lateDelivery || null,
          cost_transactional: o.costs?.transactional || null,
          cost_wallet: o.costs?.wallet || null,
          cost_service: o.costs?.service || null,
          cost_iva_platform: o.costs?.ivaPlatform || null,

          prep_time_min: o.prepTime || o.prep_time_min || null,
          delivery_time_min: o.deliveryTime || o.delivery_time_min || null,
          total_time_min: o.totalTime || o.total_time_min || null,

          accepted_at: o.acceptedAt ? (o.acceptedAt instanceof Date ? o.acceptedAt.toISOString() : o.acceptedAt) : null,
          ready_at: o.readyAt ? (o.readyAt instanceof Date ? o.readyAt.toISOString() : o.readyAt) : null,
          picked_up_at: o.pickedUpAt ? (o.pickedUpAt instanceof Date ? o.pickedUpAt.toISOString() : o.pickedUpAt) : null,
          delivered_at: o.deliveredAt ? (o.deliveredAt instanceof Date ? o.deliveredAt.toISOString() : o.deliveredAt) : null,
          cancelled_at: o.cancelledAt ? (o.cancelledAt instanceof Date ? o.cancelledAt.toISOString() : o.cancelledAt) : null,

          payment_method: o.metodo || o.payment_method || null,
          delivery_method: o.deliveryMethod || o.delivery_method || null,
          has_complaint: !!o.hasComplaint,
          complaint_reason: o.complaintReason || null,
          cancel_reason: o.cancelReason || null,

          source_file: sourceFile,
          raw_data: o.raw_data || null,
        }));

        // Batch de 100 en 100 para no exceder límites
        let totalInserted = 0, totalUpdated = 0, totalSkipped = 0;
        const BATCH_SIZE = 100;

        for (let i = 0; i < payload.length; i += BATCH_SIZE) {
          const batch = payload.slice(i, i + BATCH_SIZE);
          const { data, error } = await supabase.rpc('upsert_orders_bulk', {
            p_brand_id: brandId,
            p_orders: batch,
          });

          if (error) {
            console.error('[Persistence] Error batch', i, error);
            return { success: false, error: error.message };
          }

          if (data && data.length > 0) {
            totalInserted += data[0].inserted_count || 0;
            totalUpdated += data[0].updated_count || 0;
            totalSkipped += data[0].skipped_count || 0;
          }
        }

        return {
          success: true,
          inserted: totalInserted,
          updated: totalUpdated,
          skipped: totalSkipped,
          total: payload.length,
        };
      } catch (err) {
        console.error('[Persistence] saveOrdersToHistory error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Recupera órdenes históricas por rango de fechas y plataforma
     */
    async getOrdersHistory(supabase, brandId, opts = {}) {
      if (!supabase || !brandId) return { success: false, error: 'Datos inválidos' };

      try {
        let query = supabase
          .from('orders_unified')
          .select('*')
          .eq('brand_id', brandId)
          .order('order_date', { ascending: false });

        if (opts.dateFrom) query = query.gte('order_date', opts.dateFrom);
        if (opts.dateTo) query = query.lte('order_date', opts.dateTo);
        if (opts.platform && opts.platform !== 'all') query = query.eq('platform', opts.platform);
        if (opts.limit) query = query.limit(opts.limit);

        const { data, error } = await query;
        if (error) return { success: false, error: error.message };

        // Deserializar dates
        const orders = (data || []).map(row => ({
          id: row.order_id,
          date: row.order_date ? new Date(row.order_date) : null,
          platform: row.platform,
          total: parseFloat(row.gmv) || 0,
          basePrice: parseFloat(row.base_price) || 0,
          discAmt: parseFloat(row.discount_amt) || 0,
          discPct: parseFloat(row.discount_pct) || 0,
          cancelled: !!row.cancelled,
          estado: row.status,
          sucursal: row.branch_name,
          metodo: row.payment_method,
          comision: parseFloat(row.commission) || 0,
          prepTime: parseFloat(row.prep_time_min) || 0,
          deliveryTime: parseFloat(row.delivery_time_min) || 0,
          totalTime: parseFloat(row.total_time_min) || 0,
          acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
          readyAt: row.ready_at ? new Date(row.ready_at) : null,
          deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
          hasComplaint: !!row.has_complaint,
          complaintReason: row.complaint_reason,
          cancelReason: row.cancel_reason,
          items: '',
          isPrime: false,
          costs: {
            commission: parseFloat(row.commission) || 0,
            adsSpend: parseFloat(row.cost_ads) || 0,
            taxAds: parseFloat(row.cost_ads_tax) || 0,
            darDiscount: parseFloat(row.cost_dar) || 0,
            freeDelivery: parseFloat(row.cost_free_delivery) || 0,
            integration: parseFloat(row.cost_integration) || 0,
            lateDelivery: parseFloat(row.cost_late) || 0,
            transactional: parseFloat(row.cost_transactional) || 0,
            wallet: parseFloat(row.cost_wallet) || 0,
            service: parseFloat(row.cost_service) || 0,
            ivaPlatform: parseFloat(row.cost_iva_platform) || 0,
          },
          _fromHistory: true,
        }));

        return { success: true, orders, count: orders.length };
      } catch (err) {
        console.error('[Persistence] getOrdersHistory error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Guarda items de órdenes (productos)
     */
    async saveOrderItems(supabase, brandId, items) {
      if (!supabase || !brandId || !Array.isArray(items) || items.length === 0) {
        return { success: false, error: 'Datos inválidos' };
      }

      try {
        // Batch de 500
        const BATCH_SIZE = 500;
        let inserted = 0;

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const batch = items.slice(i, i + BATCH_SIZE).map(it => ({
            brand_id: brandId,
            platform: it.platform,
            order_id: it.order_id || it.orderId,
            product_name: it.product_name || it.name,
            quantity: it.quantity || it.qty || 1,
            unit_price: it.unit_price || it.price,
            base_price: it.base_price || null,
            discount_amt: it.discount_amt || 0,
          }));

          const { error } = await supabase.from('order_items').insert(batch);
          if (error) {
            console.error('[Persistence] items batch error:', error);
            return { success: false, error: error.message };
          }
          inserted += batch.length;
        }

        return { success: true, inserted };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // ─── SPRINT 4: WEEKLY SNAPSHOTS ───────────────────────────────────

    /**
     * Guarda un snapshot semanal (Service_Level, opsSummary, etc.)
     */
    async saveWeeklySnapshot(supabase, brandId, platform, weekStart, weekEnd, metrics, opts = {}) {
      if (!supabase || !brandId) return { success: false, error: 'Datos inválidos' };

      try {
        const { data, error } = await supabase
          .from('weekly_snapshots')
          .upsert({
            brand_id: brandId,
            platform,
            week_start: weekStart,
            week_end: weekEnd,
            metrics,
            complaints: opts.complaints || null,
            cancellations: opts.cancellations || null,
            reviews: opts.reviews || null,
            source_file: opts.sourceFile || null,
          }, { onConflict: 'brand_id,platform,week_start' })
          .select();

        if (error) return { success: false, error: error.message };
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /**
     * Obtiene snapshots semanales por rango
     */
    async getWeeklySnapshots(supabase, brandId, opts = {}) {
      if (!supabase || !brandId) return { success: false, error: 'Datos inválidos' };

      try {
        let query = supabase
          .from('weekly_snapshots')
          .select('*')
          .eq('brand_id', brandId)
          .order('week_start', { ascending: false });

        if (opts.dateFrom) query = query.gte('week_start', opts.dateFrom);
        if (opts.dateTo) query = query.lte('week_start', opts.dateTo);
        if (opts.platform && opts.platform !== 'all') query = query.eq('platform', opts.platform);
        if (opts.limit) query = query.limit(opts.limit);

        const { data, error } = await query;
        if (error) return { success: false, error: error.message };
        return { success: true, snapshots: data || [] };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // ─── SPRINT 4: MONTHLY SNAPSHOTS ──────────────────────────────────

    async saveMonthlySnapshots(supabase, brandId, platform, months, sourceFile) {
      if (!supabase || !brandId || !Array.isArray(months)) {
        return { success: false, error: 'Datos inválidos' };
      }

      try {
        const payload = months.map(m => ({
          brand_id: brandId,
          platform,
          month_key: m.month,
          orders_total: m.orders || 0,
          orders_rejected: m.rejected || 0,
          gmv: m.sales || 0,
          avg_ticket: m.avgTicket || 0,
          orders_delivery: m.ordersDelivery || 0,
          orders_pickup: m.ordersPickup || 0,
          gmv_delivery: m.salesDelivery || 0,
          gmv_pickup: m.salesPickup || 0,
          orders_online: m.ordersOnline || 0,
          source_file: sourceFile,
        }));

        const { data, error } = await supabase
          .from('monthly_snapshots')
          .upsert(payload, { onConflict: 'brand_id,platform,month_key' })
          .select();

        if (error) return { success: false, error: error.message };
        return { success: true, count: data?.length || 0 };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getMonthlySnapshots(supabase, brandId, opts = {}) {
      if (!supabase || !brandId) return { success: false, error: 'Datos inválidos' };

      try {
        let query = supabase
          .from('monthly_snapshots')
          .select('*')
          .eq('brand_id', brandId)
          .order('month_key', { ascending: true });

        if (opts.platform && opts.platform !== 'all') query = query.eq('platform', opts.platform);

        const { data, error } = await query;
        if (error) return { success: false, error: error.message };
        return { success: true, months: data || [] };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // ─── SPRINT 4: ADS PERFORMANCE ────────────────────────────────────

    async saveAdsPerformance(supabase, brandId, adsRows, sourceFile) {
      if (!supabase || !brandId || !Array.isArray(adsRows)) {
        return { success: false, error: 'Datos inválidos' };
      }

      try {
        const payload = adsRows.map(r => ({
          brand_id: brandId,
          platform: r.platform || 'peya',
          ad_date: r.date,
          branch_id: r.branchId,
          branch_name: r.branchName,
          campaign_name: r.campaignName,
          campaign_id: r.campaignId,
          status: r.status,
          clicks: r.clicks,
          orders: r.orders,
          conversion_rate: r.conversionRate,
          revenue: r.revenue,
          cost: r.cost,
          roas: r.roas,
          avg_ticket: r.avgTicket,
          avg_cost_per_click: r.avgCostPerClick,
          avg_cost_per_order: r.avgCostPerOrder,
          source_file: sourceFile,
        }));

        const BATCH_SIZE = 500;
        let inserted = 0;
        for (let i = 0; i < payload.length; i += BATCH_SIZE) {
          const batch = payload.slice(i, i + BATCH_SIZE);
          const { error } = await supabase
            .from('ads_performance')
            .upsert(batch, { onConflict: 'brand_id,platform,ad_date,branch_id,campaign_id' });
          if (error) return { success: false, error: error.message };
          inserted += batch.length;
        }
        return { success: true, inserted };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getAdsPerformance(supabase, brandId, opts = {}) {
      if (!supabase || !brandId) return { success: false, error: 'Datos inválidos' };

      try {
        let query = supabase
          .from('ads_performance')
          .select('*')
          .eq('brand_id', brandId)
          .order('ad_date', { ascending: false });

        if (opts.dateFrom) query = query.gte('ad_date', opts.dateFrom);
        if (opts.dateTo) query = query.lte('ad_date', opts.dateTo);
        if (opts.platform && opts.platform !== 'all') query = query.eq('platform', opts.platform);

        const { data, error } = await query;
        if (error) return { success: false, error: error.message };
        return { success: true, ads: data || [] };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // ─── SPRINT 4: FILE UPLOADS AUDIT ─────────────────────────────────

    async logFileUpload(supabase, brandId, fileInfo) {
      if (!supabase || !brandId) return { success: false, error: 'Datos inválidos' };

      try {
        const { data, error } = await supabase
          .from('file_uploads')
          .insert({
            brand_id: brandId,
            file_name: fileInfo.name,
            file_type: fileInfo.type,
            file_size_bytes: fileInfo.size,
            period_start: fileInfo.periodStart,
            period_end: fileInfo.periodEnd,
            rows_processed: fileInfo.rowsProcessed || 0,
            rows_inserted: fileInfo.rowsInserted || 0,
            rows_updated: fileInfo.rowsUpdated || 0,
            rows_skipped: fileInfo.rowsSkipped || 0,
            status: fileInfo.status || 'success',
            error_message: fileInfo.error || null,
            processed_at: new Date().toISOString(),
          })
          .select();

        if (error) return { success: false, error: error.message };
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getFileUploadsHistory(supabase, brandId, limit = 20) {
      if (!supabase || !brandId) return { success: false, error: 'Datos inválidos' };

      try {
        const { data, error } = await supabase
          .from('file_uploads')
          .select('*')
          .eq('brand_id', brandId)
          .order('uploaded_at', { ascending: false })
          .limit(limit);

        if (error) return { success: false, error: error.message };
        return { success: true, uploads: data || [] };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // ─── SPRINT 2 LEGACY: Análisis snapshots (mantenidos para compat) ─

    async saveAnalysis(supabase, params) {
      if (!supabase) return { success: false, error: 'No hay supabase' };

      try {
        const { data, error } = await supabase
          .from('analyses')
          .insert({
            brand_id: params.brandId,
            user_id: params.userId,
            name: params.name || 'Análisis',
            custom_name: params.customName || null,
            period_start: params.periodStart,
            period_end: params.periodEnd,
            orders_count: params.ordersCount || 0,
            gmv: params.gmv || 0,
            avg_ticket: params.avgTicket || 0,
            platforms: params.platforms || [],
            files_count: params.filesCount || 0,
            metadata: params.metadata || {},
            expires_at: params.expiresAt || null,
          })
          .select()
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, analysisId: data.id, analysis: data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getAnalysis(supabase, analysisId) {
      if (!supabase || !analysisId) return { success: false, error: 'Datos inválidos' };
      try {
        const { data, error } = await supabase
          .from('analyses')
          .select('*')
          .eq('id', analysisId)
          .single();
        if (error) return { success: false, error: error.message };
        return { success: true, analysis: data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async listAnalyses(supabase, brandId, limit = 20) {
      if (!supabase || !brandId) return { success: false, error: 'Datos inválidos' };
      try {
        const { data, error } = await supabase
          .from('analyses')
          .select('id, name, custom_name, created_at, expires_at, period_start, period_end, orders_count, gmv, avg_ticket, platforms, files_count')
          .eq('brand_id', brandId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) return { success: false, error: error.message };
        return { success: true, analyses: data || [] };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async deleteAnalysis(supabase, analysisId) {
      if (!supabase || !analysisId) return { success: false, error: 'Datos inválidos' };
      try {
        const { error } = await supabase.from('analyses').delete().eq('id', analysisId);
        if (error) return { success: false, error: error.message };
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };

  window.SAZON_PERSISTENCE = SAZON_PERSISTENCE;
  console.log('[Persistence] Sprint 4 loaded - modelo agregativo activo');
})();
