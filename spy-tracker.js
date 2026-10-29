/**
 * Tecnoemprende & Jota Beta — Universal Spy Visitor & Unique User Telemetry Engine
 * Tracks:
 *  - Different Unique Users (visitor_id fingerprint + IP + device)
 *  - Total Visits / Sessions per Page
 *  - Real-time Duration (15s Heartbeat + Keepalive Exit)
 *  - Secret Spy Dashboard (?admin=david | ?view=spy | Alt+S | Admin Panel)
 */
(function () {
  const CONFIG = {
    supabaseUrl: 'https://jyrqzjctkmzdvmraqrcv.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5cnF6amN0a216ZHZtcmFxcmN2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjI4MTU3NCwiZXhwIjoyMTAxODU3NTc0fQ.jpzy38i_JqhKiLZwNFXESJo62kk4vWvwCVPLpFIyLjc',
    heartbeatIntervalMs: 15000
  };

  function detectSiteMetadata() {
    if (window.SPY_SITE_ID && window.SPY_SITE_NAME) {
      return { siteId: window.SPY_SITE_ID, siteName: window.SPY_SITE_NAME };
    }
    const host = (window.location.hostname || 'local').toLowerCase();
    const path = (window.location.pathname || '/').toLowerCase();
    const full = host + path;

    if (full.includes('mercapros')) {
      return { siteId: 'mercapros-cuba', siteName: 'Mercapros Cuba (B2B & Mayoristas)' };
    }
    if (full.includes('havana-home-pros') && path.includes('sniper')) {
      return { siteId: 'havana-home-pros-sniper', siteName: 'Radar Sniper Privado (Gangas Revolico)' };
    }
    if (full.includes('havana-home-pros')) {
      return { siteId: 'havana-home-pros', siteName: 'Havana Home Pros (Portal Inmobiliario)' };
    }
    if (full.includes('tecnoemprende') && path.includes('portfolio')) {
      return { siteId: 'tecnoemprende-portfolio', siteName: 'Portafolio Oficial Tecnoemprende' };
    }
    if (full.includes('tecnoemprende')) {
      return { siteId: 'tecnoemprende-web', siteName: 'Tecnoemprende Sitio Oficial (' + (path.split('/').pop() || 'index') + ')' };
    }
    if (full.includes('jota-cloud')) {
      return { siteId: 'jota-cloud-saas', siteName: 'Jota Cloud Online SaaS' };
    }
    const slug = path.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || host.replace(/\./g, '-');
    return {
      siteId: 'jota-page-' + slug,
      siteName: document.title ? document.title.slice(0, 60) : ('Página Jota Beta (' + slug + ')')
    };
  }

  const { siteId, siteName } = detectSiteMetadata();
  const urlParams = new URLSearchParams(window.location.search);
  const isSpyParam = urlParams.get('admin') === 'david' || urlParams.get('view') === 'spy' || urlParams.get('spy') === '1';

  if (isSpyParam) {
    localStorage.setItem('tecno_spy_admin_excluded', 'true');
  }

  const isExcludedAdmin = localStorage.getItem('tecno_spy_admin_excluded') === 'true';

  function getOrCreateVisitorId() {
    let vid = localStorage.getItem('tecno_spy_visitor_id');
    if (!vid) {
      vid = 'usr_' + (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).substring(2, 12) + Date.now().toString(36));
      localStorage.setItem('tecno_spy_visitor_id', vid);
    }
    return vid;
  }

  function incrementSiteVisitCount(sId) {
    const key = 'tecno_spy_vcount_' + sId;
    const prev = parseInt(localStorage.getItem(key) || '0', 10);
    const next = prev + 1;
    localStorage.setItem(key, String(next));
    return next;
  }

  function getDeviceInfo() {
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'Apple iPhone';
    if (/iPad/i.test(ua)) return 'Apple iPad';
    if (/Android/i.test(ua)) return 'Android Smartphone';
    if (/Macintosh/i.test(ua)) return 'Apple Mac';
    if (/Windows/i.test(ua)) return 'Windows PC';
    if (/Linux/i.test(ua)) return 'Linux PC';
    return 'Dispositivo Web';
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m === 0) return `${rem}s`;
    return `${m}m ${rem}s`;
  }

  const visitorId = getOrCreateVisitorId();
  const sessionKey = 'tecno_spy_sess_' + siteId;
  const startKey = 'tecno_spy_start_' + siteId;
  const vnumKey = 'tecno_spy_vnum_' + siteId;

  let sessionId = sessionStorage.getItem(sessionKey);
  let sessionStartTime = parseInt(sessionStorage.getItem(startKey) || String(Date.now()), 10);
  let visitNumber = parseInt(sessionStorage.getItem(vnumKey) || '0', 10);
  let clientGeo = { ip: 'direct', city: 'Visitante', country: 'Externo' };
  let isTrackingActive = false;

  async function resolveGeo() {
    try {
      const r1 = await fetch('https://ipwho.is/', { cache: 'no-store' });
      if (r1.ok) {
        const d1 = await r1.json();
        if (d1 && d1.ip) {
          return {
            ip: d1.ip,
            city: d1.city || 'Ciudad',
            country: d1.country || 'País'
          };
        }
      }
    } catch (e) {}
    try {
      const r2 = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
      if (r2.ok) {
        const d2 = await r2.json();
        if (d2 && d2.ip) {
          return {
            ip: d2.ip,
            city: d2.city || 'Ciudad',
            country: d2.country_name || d2.country || 'País'
          };
        }
      }
    } catch (e2) {}
    return { ip: 'direct_' + visitorId.slice(-6), city: 'Acceso Directo', country: 'Web / Móvil' };
  }

  async function initTelemetry() {
    if (isExcludedAdmin) {
      return;
    }

    try {
      clientGeo = await resolveGeo();

      if (!sessionId) {
        sessionId = 'spy_' + siteId.slice(0, 18) + '_' + (crypto.randomUUID ? crypto.randomUUID().slice(0, 10) : Math.random().toString(36).substring(2, 10) + Date.now().toString(36));
        sessionStartTime = Date.now();
        visitNumber = incrementSiteVisitCount(siteId);
        sessionStorage.setItem(sessionKey, sessionId);
        sessionStorage.setItem(startKey, String(sessionStartTime));
        sessionStorage.setItem(vnumKey, String(visitNumber));
      } else if (!visitNumber) {
        visitNumber = parseInt(localStorage.getItem('tecno_spy_vcount_' + siteId) || '1', 10);
      }

      isTrackingActive = true;
      await registerInitialVisit();

      setInterval(sendHeartbeat, CONFIG.heartbeatIntervalMs);
      window.addEventListener('beforeunload', () => sendHeartbeat(true));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') sendHeartbeat(true);
      });
    } catch (err) {}
  }

  async function registerInitialVisit() {
    const durationSec = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
    const payload = {
      id: sessionId,
      site_id: siteId,
      site_name: siteName,
      page_path: window.location.pathname || '/',
      page_url: window.location.href.split('?')[0],
      visitor_id: visitorId,
      ip: clientGeo.ip,
      city: clientGeo.city,
      country: clientGeo.country,
      device: getDeviceInfo(),
      user_agent: (navigator.userAgent || '').slice(0, 250),
      referrer: (document.referrer || 'Directo').slice(0, 200),
      duration_seconds: durationSec,
      is_active: true,
      visit_count: visitNumber || 1,
      last_ping_at: new Date().toISOString()
    };

    try {
      await fetch(`${CONFIG.supabaseUrl}/rest/v1/web_spy_visits`, {
        method: 'POST',
        headers: {
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }

  async function sendHeartbeat(isClosing = false) {
    if (!isTrackingActive || !sessionId) return;
    const durationSec = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
    const payload = {
      duration_seconds: durationSec,
      is_active: !isClosing,
      last_ping_at: new Date().toISOString()
    };

    try {
      await fetch(`${CONFIG.supabaseUrl}/rest/v1/web_spy_visits?id=eq.${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: {
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        keepalive: Boolean(isClosing)
      });
    } catch (e) {}
  }

  // --- SPY TELEMETRY PANEL FOR DAVID (?admin=david | ?view=spy | Alt+S) ---
  let spyActiveTab = 'current'; // 'current' | 'global'

  function mountSpyPanel() {
    if (document.getElementById('tecno-universal-spy-panel')) {
      document.getElementById('tecno-universal-spy-panel').style.display = 'block';
      refreshSpyMetrics();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'tecno-universal-spy-panel';
    panel.style.cssText = 'position:fixed;bottom:16px;right:16px;width:410px;max-width:calc(100vw - 24px);z-index:2147483647;background:rgba(10,15,24,0.98);border:1px solid rgba(217,183,111,0.45);border-radius:20px;box-shadow:0 25px 60px rgba(0,0,0,0.75);padding:18px;color:#F8FAFC;font-family:system-ui,-apple-system,sans-serif;font-size:12px;backdrop-filter:blur(16px);';

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:9px;height:9px;border-radius:999px;background:#10B981;box-shadow:0 0 10px #10B981;display:inline-block;"></span>
          <div>
            <div style="font-weight:800;color:#FBBF24;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Sistema Espía • Tecnoemprende & Jota</div>
            <div style="font-size:10px;color:#94A3B8;margin-top:1px;">${siteName}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button id="spy-btn-refresh" style="background:rgba(251,191,36,0.14);border:1px solid rgba(251,191,36,0.35);color:#FBBF24;padding:4px 8px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;">Actualizar</button>
          <button id="spy-btn-close" style="background:transparent;border:none;color:#94A3B8;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;">&times;</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;margin-top:10px;">
        <button id="spy-tab-current" style="flex:1;padding:7px 10px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid rgba(251,191,36,0.4);background:rgba(251,191,36,0.18);color:#FDE68A;">📊 Esta Página</button>
        <button id="spy-tab-global" style="flex:1;padding:7px 10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#94A3B8;">🌐 Todas las Páginas</button>
      </div>

      <div id="spy-kpi-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;">
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:8px 10px;text-align:center;">
          <div style="font-size:9px;color:#94A3B8;text-transform:uppercase;font-weight:700;">Usuarios Únicos</div>
          <div id="spy-kpi-unique" style="font-size:18px;font-weight:900;color:#34D399;margin-top:2px;">-</div>
          <div style="font-size:9px;color:#64748B;">Diferentes personas</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:8px 10px;text-align:center;">
          <div style="font-size:9px;color:#94A3B8;text-transform:uppercase;font-weight:700;">Visitas Totales</div>
          <div id="spy-kpi-total" style="font-size:18px;font-weight:900;color:#FBBF24;margin-top:2px;">-</div>
          <div style="font-size:9px;color:#64748B;">Sesiones abiertas</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:8px 10px;text-align:center;">
          <div style="font-size:9px;color:#94A3B8;text-transform:uppercase;font-weight:700;">En Línea Ahora</div>
          <div id="spy-kpi-online" style="font-size:18px;font-weight:900;color:#38BDF8;margin-top:2px;">-</div>
          <div style="font-size:9px;color:#64748B;">Activos &lt; 60s</div>
        </div>
      </div>

      <div id="spy-body-container" style="margin-top:12px;max-height:270px;overflow-y:auto;padding-right:2px;">
        <div style="text-align:center;padding:18px;color:#64748B;">Cargando telemetría en vivo...</div>
      </div>

      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#64748B;">
        <span>Tu navegador admin está excluido del conteo.</span>
        <span style="color:#94A3B8;font-weight:700;">Atajo: Alt+S</span>
      </div>
    `;

    document.body.appendChild(panel);

    document.getElementById('spy-btn-close').onclick = () => {
      panel.style.display = 'none';
    };
    document.getElementById('spy-btn-refresh').onclick = () => refreshSpyMetrics();
    document.getElementById('spy-tab-current').onclick = () => {
      spyActiveTab = 'current';
      updateTabStyles();
      refreshSpyMetrics();
    };
    document.getElementById('spy-tab-global').onclick = () => {
      spyActiveTab = 'global';
      updateTabStyles();
      refreshSpyMetrics();
    };

    refreshSpyMetrics();
  }

  function updateTabStyles() {
    const tCur = document.getElementById('spy-tab-current');
    const tGlo = document.getElementById('spy-tab-global');
    if (!tCur || !tGlo) return;
    if (spyActiveTab === 'current') {
      tCur.style.background = 'rgba(251,191,36,0.18)';
      tCur.style.borderColor = 'rgba(251,191,36,0.4)';
      tCur.style.color = '#FDE68A';
      tGlo.style.background = 'rgba(255,255,255,0.04)';
      tGlo.style.borderColor = 'rgba(255,255,255,0.1)';
      tGlo.style.color = '#94A3B8';
    } else {
      tGlo.style.background = 'rgba(251,191,36,0.18)';
      tGlo.style.borderColor = 'rgba(251,191,36,0.4)';
      tGlo.style.color = '#FDE68A';
      tCur.style.background = 'rgba(255,255,255,0.04)';
      tCur.style.borderColor = 'rgba(255,255,255,0.1)';
      tCur.style.color = '#94A3B8';
    }
  }

  async function refreshSpyMetrics() {
    const container = document.getElementById('spy-body-container');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:16px;color:#94A3B8;">Consultando registros en Supabase...</div>';

    try {
      const queryUrl = spyActiveTab === 'current'
        ? `${CONFIG.supabaseUrl}/rest/v1/web_spy_visits?site_id=eq.${encodeURIComponent(siteId)}&order=created_at.desc&limit=200`
        : `${CONFIG.supabaseUrl}/rest/v1/web_spy_visits?order=created_at.desc&limit=500`;

      const res = await fetch(queryUrl, {
        headers: {
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`
        }
      });
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      const rows = await res.json();

      // Compute unique users (by visitor_id or ip+device)
      const uniqueSet = new Set();
      let onlineNow = 0;
      const nowMs = Date.now();

      rows.forEach(r => {
        const uKey = r.visitor_id || ((r.ip || '') + '|' + (r.device || ''));
        uniqueSet.add(uKey);
        const pingMs = new Date(r.last_ping_at || r.created_at).getTime();
        if (r.is_active && (nowMs - pingMs) < 65000) {
          onlineNow++;
        }
      });

      const elUnique = document.getElementById('spy-kpi-unique');
      const elTotal = document.getElementById('spy-kpi-total');
      const elOnline = document.getElementById('spy-kpi-online');
      if (elUnique) elUnique.textContent = String(uniqueSet.size);
      if (elTotal) elTotal.textContent = String(rows.length);
      if (elOnline) elOnline.textContent = String(onlineNow);

      if (spyActiveTab === 'global') {
        const bySite = {};
        rows.forEach(r => {
          const sid = r.site_id || 'unknown';
          if (!bySite[sid]) {
            bySite[sid] = {
              siteId: sid,
              siteName: r.site_name || sid,
              totalVisits: 0,
              uniqueVisitors: new Set(),
              onlineCount: 0,
              lastVisit: r.created_at
            };
          }
          bySite[sid].totalVisits++;
          bySite[sid].uniqueVisitors.add(r.visitor_id || ((r.ip || '') + '|' + (r.device || '')));
          const pingMs = new Date(r.last_ping_at || r.created_at).getTime();
          if (r.is_active && (nowMs - pingMs) < 65000) {
            bySite[sid].onlineCount++;
          }
        });

        const siteList = Object.values(bySite).sort((a, b) => b.totalVisits - a.totalVisits);
        if (siteList.length === 0) {
          container.innerHTML = `<div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.03);text-align:center;color:#94A3B8;">Aún no hay visitas externas registradas en la red global.</div>`;
          return;
        }

        container.innerHTML = siteList.map(s => `
          <div style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:800;color:#F8FAFC;font-size:11px;">${s.siteName}</span>
              <span style="font-size:10px;color:#34D399;font-weight:800;">${s.uniqueVisitors.size} usuarios únicos</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:10px;color:#94A3B8;">
              <span>Visitas totales: <strong style="color:#FBBF24;">${s.totalVisits}</strong></span>
              <span>En línea: <strong style="color:#38BDF8;">${s.onlineCount}</strong></span>
            </div>
          </div>
        `).join('');
        return;
      }

      if (rows.length === 0) {
        container.innerHTML = `
          <div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);text-align:center;color:#94A3B8;">
            <div style="color:#FBBF24;font-weight:800;margin-bottom:4px;">0 Visitas Externas Aún</div>
            <div style="font-size:10px;">El sistema espía está activo en <strong>${siteName}</strong>. Cada visitante externo se registrará con dispositivo, ubicación, duración y conteo de usuario único.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = rows.slice(0, 40).map(r => {
        const pingMs = new Date(r.last_ping_at || r.created_at).getTime();
        const isOnline = r.is_active && (nowMs - pingMs) < 65000;
        const dateStr = new Date(r.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
        const shortUser = (r.visitor_id || 'usr').slice(-6).toUpperCase();
        return `
          <div style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:800;color:#FFFFFF;font-size:11px;">${r.device || 'Dispositivo'} <span style="color:#FBBF24;font-size:10px;">#${shortUser}</span></span>
              <span style="padding:2px 7px;border-radius:6px;font-size:9px;font-weight:800;${isOnline ? 'background:rgba(16,185,129,0.2);color:#34D399;border:1px solid rgba(16,185,129,0.35);' : 'background:rgba(255,255,255,0.06);color:#94A3B8;'}">
                ${isOnline ? '🟢 En línea ahora' : 'Visita #' + (r.visit_count || 1)}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:10px;color:#CBD5E1;">
              <span>📍 ${r.city || 'Ciudad'}, ${r.country || 'País'}</span>
              <span>⏱️ <strong style="color:#FBBF24;">${formatDuration(r.duration_seconds)}</strong></span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06);font-size:9px;color:#64748B;">
              <span>Fecha: ${dateStr}</span>
              <span>IP: ${r.ip || 'Directo'}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:12px;color:#F87171;font-size:11px;">Error al consultar telemetría: ${err.message}</div>`;
    }
  }

  // Expose helper globally so Admin Dashboards can open the Spy Panel with 1 click
  window.openTecnoSpyPanel = function () {
    localStorage.setItem('tecno_spy_admin_excluded', 'true');
    mountSpyPanel();
  };

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      window.openTecnoSpyPanel();
    }
  });

  if (isSpyParam) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountSpyPanel);
    } else {
      mountSpyPanel();
    }
  }

  initTelemetry();
})();
