/**
 * HAVANA HOME PROS — Property Finder Identical Engine for Cuba
 * Dual-Layer Persistence (Instant Boot localStorage + Supabase Sync)
 * 20 Real Revolico Houses (> $50,000 USD) with Real Multi-Photo Galleries
 */

const STORAGE_KEY = 'havana_home_pros_state_v2';

const I18N_DICT = {
  es: {
    top_banner_text: '¿Tienes una casa en venta en Cuba? <strong>Publícala 100% GRATIS</strong> en Havana Home Pros — Solo cobramos el <strong>1% de comisión</strong> si la vendemos a través de nuestro portal.',
    btn_publish_free: 'Publicar Gratis (1%)',
    hero_title: 'Encuentra tu próxima propiedad en Cuba',
    hero_subtitle: 'Búsqueda avanzada estilo Property Finder con fotos reales verificadas, filtros por reparto, habitaciones, rango de precio en USD y publicación gratuita para propietarios (solo 1% al venderse).',
    book_appointment: 'Reservar Cita'
  },
  en: {
    top_banner_text: 'Selling a home in Cuba? <strong>List it 100% FREE</strong> on Havana Home Pros — We only charge a <strong>1% success fee</strong> if sold through our portal.',
    btn_publish_free: 'List Free (1% Fee)',
    hero_title: 'Find your next property in Cuba',
    hero_subtitle: 'Property Finder style search with verified real photos, neighborhood filters, bedrooms, USD price range, and free listing for owners (only 1% upon sale).',
    book_appointment: 'Book Appointment'
  },
  ar: {
    top_banner_text: 'هل لديك منزل للبيع في كوبا؟ <strong>انشره مجاناً 100%</strong> في Havana Home Pros — عمولة <strong>1% فقط</strong> عند البيع.',
    btn_publish_free: 'انشر مجاناً (1%)',
    hero_title: 'اعثر على عقارك القادم في كوبا',
    hero_subtitle: 'بحث متقدم على طراز Property Finder مع صور حقيقية موثقة وفلاتر حسب المنطقة والسعر بالدولار.',
    book_appointment: 'حجز موعد'
  }
};

let hhpState = {
  properties: [],
  zones: ['Miramar', 'Siboney', 'El Vedado', 'Nuevo Vedado', 'Atabey', 'Playa', 'Lawton', 'Alturas de La Lisa'],
  favorites: [],
  appointments: [
    {
      id: 'apt-101',
      propertyTitle: 'Casa independiente en Siboney ($260,000 USD)',
      clientName: 'Carlos M. (Miami)',
      clientPhone: '+1 305 555 0192',
      date: '2026-10-28',
      notes: 'Interesado en visita presencial esta semana; pago en EE.UU.'
    }
  ],
  bannerText: '',
  supabaseUrl: '',
  supabaseKey: '',
  activeMainTab: 'BUY',
  layoutMode: 'GRID',
  mapOpen: false,
  selectedAmenities: [],
  onlyFavorites: false,
  cardSlideIndex: {}
};

let isAdminLogged = false;
let leafletMap = null;
let leafletMarkers = [];
let detailLeafletMap = null;

function loadInitialState() {
  const seed = Array.isArray(window.INITIAL_HOUSES_DATA) ? window.INITIAL_HOUSES_DATA : [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.properties) && parsed.properties.length >= 20) {
        hhpState = { ...hhpState, ...parsed };
        return;
      }
    }
  } catch (err) {
    console.warn('Instant boot fallback:', err);
  }
  hhpState.properties = seed;
  saveState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      properties: hhpState.properties,
      zones: hhpState.zones,
      favorites: hhpState.favorites,
      appointments: hhpState.appointments,
      bannerText: hhpState.bannerText,
      supabaseUrl: hhpState.supabaseUrl,
      supabaseKey: hhpState.supabaseKey
    }));
  } catch (e) {
    console.warn('Storage save notice:', e);
  }
}

async function syncFromSupabase() {
  if (!hhpState.supabaseUrl || !hhpState.supabaseKey) return;
  try {
    const res = await fetch(`${hhpState.supabaseUrl}/rest/v1/havana_properties?select=*`, {
      headers: {
        apikey: hhpState.supabaseKey,
        Authorization: `Bearer ${hhpState.supabaseKey}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        hhpState.properties = data;
        saveState();
        applyFilters();
      }
    }
  } catch (e) {
    console.warn('Supabase background sync skipped:', e);
  }
}

function formatUsd(val) {
  const n = Number(val || 0);
  return '$' + n.toLocaleString('en-US') + ' USD';
}

function renderZoneFilterOptions() {
  const sel = document.getElementById('filter-zone-select');
  if (!sel) return;
  const current = sel.value || 'ALL';
  const baseOptions = `<option value="ALL">Todas las Zonas (${hhpState.properties.length})</option>`;
  const zoneOpts = hhpState.zones.map(z => {
    const count = hhpState.properties.filter(p =>
      (p.neighborhood && p.neighborhood.toLowerCase().includes(z.toLowerCase())) ||
      (p.municipality && p.municipality.toLowerCase().includes(z.toLowerCase()))
    ).length;
    return `<option value="${z}">${z} (${count})</option>`;
  }).join('');
  sel.innerHTML = baseOptions + zoneOpts;
  sel.value = current;
}

function renderNeighborhoodPills() {
  const bar = document.getElementById('neighborhood-pills-bar');
  if (!bar) return;
  const activeZone = (document.getElementById('filter-zone-select') || {}).value || 'ALL';

  const allPill = `
    <button onclick="selectZonePill('ALL')" class="px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all shrink-0 ${
      activeZone === 'ALL'
        ? 'bg-[#EF5E4E] text-white shadow-sm'
        : 'bg-[#FFFDF8] dark:bg-[#121D18] border border-stone-300 dark:border-white/15 hover:border-[#EF5E4E]'
    }">
      Toda La Habana (${hhpState.properties.length})
    </button>
  `;

  const pills = hhpState.zones.map(z => {
    const count = hhpState.properties.filter(p =>
      (p.neighborhood && p.neighborhood.toLowerCase().includes(z.toLowerCase())) ||
      (p.municipality && p.municipality.toLowerCase().includes(z.toLowerCase()))
    ).length;
    const isSel = activeZone === z;
    return `
      <button onclick="selectZonePill('${z}')" class="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
        isSel
          ? 'bg-[#EF5E4E] text-white shadow-sm'
          : 'bg-[#FFFDF8] dark:bg-[#121D18] border border-stone-300 dark:border-white/15 hover:border-[#EF5E4E]'
      }">
        ${z} <span class="opacity-70 ml-0.5">(${count})</span>
      </button>
    `;
  }).join('');

  bar.innerHTML = allPill + pills;
}

function selectZonePill(zone) {
  const sel = document.getElementById('filter-zone-select');
  if (sel) sel.value = zone;
  applyFilters();
}

function setMainTab(tab) {
  hhpState.activeMainTab = tab;
  hhpState.onlyFavorites = false;
  document.querySelectorAll('.js-nav-tab').forEach(btn => {
    btn.className = 'js-nav-tab px-3.5 py-2 rounded-xl hover:bg-stone-200/60 dark:hover:bg-white/5 transition-all';
  });
  const activeBtn = document.getElementById(`nav-tab-${tab}`);
  if (activeBtn) {
    activeBtn.className = 'js-nav-tab px-3.5 py-2 rounded-xl bg-[#EF5E4E]/15 text-[#EF5E4E] font-extrabold transition-all';
  }
  applyFilters();
}

function toggleAmenityChip(featureName) {
  const idx = hhpState.selectedAmenities.indexOf(featureName);
  if (idx >= 0) {
    hhpState.selectedAmenities.splice(idx, 1);
  } else {
    hhpState.selectedAmenities.push(featureName);
  }
  document.querySelectorAll('.js-amenity-chip').forEach(btn => {
    const chip = btn.getAttribute('data-chip');
    if (hhpState.selectedAmenities.includes(chip)) {
      btn.classList.add('bg-[#EF5E4E]', 'text-white', 'border-[#EF5E4E]');
    } else {
      btn.classList.remove('bg-[#EF5E4E]', 'text-white', 'border-[#EF5E4E]');
    }
  });
  applyFilters();
}

function filterFavoritesOnly() {
  hhpState.onlyFavorites = !hhpState.onlyFavorites;
  applyFilters();
}

function resetAllFilters() {
  document.getElementById('filter-search-input').value = '';
  document.getElementById('filter-zone-select').value = 'ALL';
  document.getElementById('filter-type-select').value = 'ALL';
  document.getElementById('filter-beds-select').value = '0';
  document.getElementById('filter-price-select').value = 'ALL';
  document.getElementById('sort-select').value = 'FEATURED';
  hhpState.selectedAmenities = [];
  hhpState.onlyFavorites = false;
  hhpState.activeMainTab = 'BUY';
  document.querySelectorAll('.js-amenity-chip').forEach(btn => {
    btn.classList.remove('bg-[#EF5E4E]', 'text-white', 'border-[#EF5E4E]');
  });
  applyFilters();
}

function getFilteredProperties() {
  const q = (document.getElementById('filter-search-input')?.value || '').trim().toLowerCase();
  const zone = document.getElementById('filter-zone-select')?.value || 'ALL';
  const type = document.getElementById('filter-type-select')?.value || 'ALL';
  const minBeds = Number(document.getElementById('filter-beds-select')?.value || 0);
  const priceRange = document.getElementById('filter-price-select')?.value || 'ALL';
  const sortBy = document.getElementById('sort-select')?.value || 'FEATURED';

  let list = hhpState.properties.filter(p => {
    if (hhpState.onlyFavorites && !hhpState.favorites.includes(String(p.id))) {
      return false;
    }
    if (hhpState.activeMainTab === 'LUXURY' && Number(p.priceUsd) < 150000) {
      return false;
    }
    if (hhpState.activeMainTab === 'OFFGRID') {
      const feats = (p.features || []).join(' ').toLowerCase() + ' ' + (p.description || '').toLowerCase();
      if (!feats.includes('piscina') && !feats.includes('planta') && !feats.includes('solar') && !feats.includes('inversor')) {
        return false;
      }
    }
    if (q) {
      const hay = `${p.title} ${p.neighborhood} ${p.municipality} ${p.description} ${p.propertyType}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (zone !== 'ALL') {
      const zMatch =
        (p.neighborhood && p.neighborhood.toLowerCase().includes(zone.toLowerCase())) ||
        (p.municipality && p.municipality.toLowerCase().includes(zone.toLowerCase())) ||
        (p.title && p.title.toLowerCase().includes(zone.toLowerCase()));
      if (!zMatch) return false;
    }
    if (type !== 'ALL' && p.propertyType !== type) {
      return false;
    }
    if (minBeds > 0 && Number(p.bedrooms || 0) < minBeds) {
      return false;
    }
    if (priceRange !== 'ALL') {
      const [minP, maxP] = priceRange.split('-').map(Number);
      const pr = Number(p.priceUsd || 0);
      if (pr < minP || pr > maxP) return false;
    }
    if (hhpState.selectedAmenities.length > 0) {
      const pFeats = p.features || [];
      const allPresent = hhpState.selectedAmenities.every(a => pFeats.includes(a));
      if (!allPresent) return false;
    }
    return true;
  });

  if (sortBy === 'PRICE_ASC') {
    list.sort((a, b) => Number(a.priceUsd) - Number(b.priceUsd));
  } else if (sortBy === 'PRICE_DESC') {
    list.sort((a, b) => Number(b.priceUsd) - Number(a.priceUsd));
  } else if (sortBy === 'AREA_DESC') {
    list.sort((a, b) => Number(b.areaSqm || 0) - Number(a.areaSqm || 0));
  } else if (sortBy === 'OLDEST') {
    list.sort((a, b) => String(a.publishedDate || '').localeCompare(String(b.publishedDate || '')));
  }

  return list;
}

function applyFilters() {
  renderZoneFilterOptions();
  renderNeighborhoodPills();

  const filtered = getFilteredProperties();
  const container = document.getElementById('properties-grid-container');
  const countBadge = document.getElementById('nav-total-count');
  const statTotal = document.getElementById('stat-total-properties');
  const subText = document.getElementById('results-sub-text');
  const favBadge = document.getElementById('fav-counter-badge');

  if (countBadge) countBadge.textContent = String(hhpState.properties.length);
  if (statTotal) statTotal.textContent = `${hhpState.properties.length} Casas`;
  if (favBadge) favBadge.textContent = String(hhpState.favorites.length);
  if (subText) {
    subText.textContent = `Mostrando ${filtered.length} de ${hhpState.properties.length} propiedades verificadas en La Habana (+$50,000 USD)`;
  }

  if (!container) return;

  if (hhpState.layoutMode === 'LIST') {
    container.className = 'space-y-4';
  } else {
    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5';
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-10 rounded-3xl bg-[#FFFDF8] dark:bg-[#121D18] border border-stone-200 dark:border-white/10 text-center space-y-3">
        <i class="fa-solid fa-house-circle-xmark text-3xl text-[#EF5E4E]"></i>
        <h3 class="font-display font-bold text-lg">No encontramos propiedades con esos filtros</h3>
        <p class="text-xs opacity-70">Prueba ajustando el rango de precio o seleccionando todas las zonas de La Habana.</p>
        <button onclick="resetAllFilters()" class="px-4 py-2 rounded-xl bg-[#EF5E4E] text-white text-xs font-extrabold">Ver las ${hhpState.properties.length} Propiedades</button>
      </div>
    `;
  } else {
    container.innerHTML = filtered.map(p => renderPropertyCard(p)).join('');
  }

  if (hhpState.mapOpen) {
    renderMapMarkers(filtered);
  }
}

function getCardImageSrc(p) {
  const imgs = (Array.isArray(p.images) && p.images.length > 0) ? p.images : (p.cdnImages || []);
  const idx = hhpState.cardSlideIndex[String(p.id)] || 0;
  const safeIdx = ((idx % imgs.length) + imgs.length) % imgs.length;
  const primary = imgs[safeIdx] || '';
  const fallback = (p.cdnImages && p.cdnImages[safeIdx]) || primary;
  return { src: primary, fallback, index: safeIdx, total: imgs.length };
}

function prevCardImage(id, e) {
  if (e) e.stopPropagation();
  const key = String(id);
  hhpState.cardSlideIndex[key] = (hhpState.cardSlideIndex[key] || 0) - 1;
  applyFilters();
}

function nextCardImage(id, e) {
  if (e) e.stopPropagation();
  const key = String(id);
  hhpState.cardSlideIndex[key] = (hhpState.cardSlideIndex[key] || 0) + 1;
  applyFilters();
}

function toggleFavorite(id, e) {
  if (e) e.stopPropagation();
  const sid = String(id);
  const idx = hhpState.favorites.indexOf(sid);
  if (idx >= 0) {
    hhpState.favorites.splice(idx, 1);
  } else {
    hhpState.favorites.push(sid);
  }
  saveState();
  applyFilters();
}

function renderPropertyCard(p) {
  const sid = String(p.id);
  const isFav = hhpState.favorites.includes(sid);
  const imgInfo = getCardImageSrc(p);
  const pricePerSqm = p.areaSqm ? Math.round(Number(p.priceUsd) / Number(p.areaSqm)) : 450;
  const waNumber = p.cleanPhone || '971508379080';
  const waText = encodeURIComponent(`Hola, vi la propiedad "${p.title}" (${formatUsd(p.priceUsd)}) en Havana Home Pros y me gustaría recibir más información o agendar una visita.`);
  const waHref = `https://wa.me/${waNumber}?text=${waText}`;

  const isHorizontal = hhpState.layoutMode === 'LIST';

  return `
    <article onclick="openPropertyDetailModal('${sid}')" class="pf-card-hover pf-shadow rounded-3xl bg-[#FFFDF8] dark:bg-[#121D18] border border-stone-200/90 dark:border-white/10 overflow-hidden cursor-pointer flex ${isHorizontal ? 'flex-col md:flex-row' : 'flex-col'} justify-between">
      <!-- Image Carousel Area (Property Finder Style) -->
      <div class="relative ${isHorizontal ? 'md:w-80 shrink-0 h-60 md:h-auto' : 'aspect-[16/10] w-full'} bg-stone-900 overflow-hidden group">
        <img
          src="${imgInfo.src}"
          onerror="if(this.src!=='${imgInfo.fallback}')this.src='${imgInfo.fallback}'"
          alt="${p.title.replace(/"/g, '&quot;')}"
          loading="lazy"
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25 pointer-events-none"></div>

        <!-- Top Badges: VERIFIED + 1% SUCCESS -->
        <div class="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
          <span class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow flex items-center gap-1">
            <i class="fa-solid fa-circle-check"></i>Verificada
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-[#14201B]/90 text-[#D9B76F] text-[10px] font-bold shadow">
            ${p.propertyType}
          </span>
        </div>

        <!-- Favorite Heart Button -->
        <button type="button" onclick="toggleFavorite('${sid}', event)" aria-label="Guardar favorito" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-all">
          <i class="${isFav ? 'fa-solid text-[#EF5E4E]' : 'fa-regular text-white'} fa-heart text-sm"></i>
        </button>

        <!-- Carousel Prev / Next Arrows -->
        ${imgInfo.total > 1 ? `
          <button type="button" onclick="prevCardImage('${sid}', event)" aria-label="Foto anterior" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            <i class="fa-solid fa-chevron-left text-xs"></i>
          </button>
          <button type="button" onclick="nextCardImage('${sid}', event)" aria-label="Foto siguiente" class="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            <i class="fa-solid fa-chevron-right text-xs"></i>
          </button>
        ` : ''}

        <!-- Bottom Image Overlay: Photo Counter + Date -->
        <div class="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white text-[11px] font-bold">
          <span class="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm flex items-center gap-1">
            <i class="fa-solid fa-camera text-[#D9B76F]"></i>
            <span>${imgInfo.index + 1} / ${imgInfo.total} Fotos Reales</span>
          </span>
          <span class="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px]">
            Ref. #${p.revolicoId || sid.slice(-6)}
          </span>
        </div>
      </div>

      <!-- Property Finder Details Body -->
      <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div class="space-y-2">
          <!-- Price Row -->
          <div class="flex items-baseline justify-between gap-2">
            <div class="font-display font-bold text-xl sm:text-2xl text-[#14201B] dark:text-[#F2EDE0]">
              ${formatUsd(p.priceUsd)}
            </div>
            <span class="text-[11px] font-bold text-[#7A5A1E] dark:text-[#D9B76F]">
              ~$${pricePerSqm}/m²
            </span>
          </div>

          <!-- Title -->
          <h3 class="font-bold text-sm leading-snug line-clamp-2 text-[#14201B] dark:text-[#F2EDE0]">
            ${p.title}
          </h3>

          <!-- Location Pin + Property Finder "Ver en Mapa" Action -->
          <div class="p-2 rounded-xl bg-stone-100/90 dark:bg-white/5 border border-stone-200/80 dark:border-white/10 flex items-center justify-between gap-2">
            <p class="text-[11px] text-stone-700 dark:text-stone-200 flex items-start gap-1.5 font-semibold leading-tight">
              <i class="fa-solid fa-location-dot text-[#EF5E4E] mt-0.5 shrink-0"></i>
              <span class="line-clamp-2">${p.exactAddress || `${p.neighborhood}, ${p.municipality}, La Habana`}</span>
            </p>
            <button
              type="button"
              onclick="openPropertyDetailModal('${sid}', event, true)"
              class="px-2 py-1 rounded-lg bg-[#EF5E4E]/15 hover:bg-[#EF5E4E] text-[#EF5E4E] hover:text-white text-[10px] font-extrabold shrink-0 transition-all flex items-center gap-1"
              title="Ver ubicación en el mapa"
            >
              <i class="fa-solid fa-map-pin"></i>
              <span>Mapa</span>
            </button>
          </div>

          <!-- Specs Row: Beds | Baths | SqM -->
          <div class="flex items-center gap-4 pt-1 text-xs font-bold text-stone-700 dark:text-stone-200">
            <span class="flex items-center gap-1.5" title="Habitaciones">
              <i class="fa-solid fa-bed text-[#7A5A1E] dark:text-[#D9B76F]"></i>
              <span>${p.bedrooms} Hab.</span>
            </span>
            <span class="flex items-center gap-1.5" title="Baños">
              <i class="fa-solid fa-bath text-[#7A5A1E] dark:text-[#D9B76F]"></i>
              <span>${p.bathrooms} Baños</span>
            </span>
            <span class="flex items-center gap-1.5" title="Superficie">
              <i class="fa-solid fa-ruler-combined text-[#7A5A1E] dark:text-[#D9B76F]"></i>
              <span>${p.areaSqm} m²</span>
            </span>
          </div>

          <!-- Feature Chips -->
          <div class="flex flex-wrap gap-1 pt-1">
            ${(p.features || []).slice(0, 3).map(f => `
              <span class="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-white/5 border border-stone-200/80 dark:border-white/10 text-[10px] font-semibold">
                ${f}
              </span>
            `).join('')}
          </div>
        </div>

        <!-- Bottom Action Bar (Book Appointment + Icon-Only WhatsApp Button) -->
        <div class="pt-3 border-t border-stone-200/80 dark:border-white/10 flex items-center justify-between gap-2">
          <button
            type="button"
            onclick="openPropertyDetailModal('${sid}', event)"
            class="flex-1 py-2.5 px-4 rounded-xl bg-[#14201B] hover:bg-[#EF5E4E] dark:bg-[#D9B76F] dark:text-[#14201B] text-white font-extrabold text-xs transition-all text-center"
            data-i18n="book_appointment"
          >
            Reservar Cita
          </button>

          <!-- STRICT RULE #5: WhatsApp Button with ONLY the icon, zero text -->
          <a
            href="${waHref}"
            target="_blank"
            rel="noopener"
            onclick="event.stopPropagation()"
            aria-label="WhatsApp"
            class="w-10 h-10 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white flex items-center justify-center shadow-sm transition-all shrink-0"
          >
            <i class="fa-brands fa-whatsapp text-lg"></i>
          </a>
        </div>
      </div>
    </article>
  `;
}

function openPropertyDetailModal(id, e, scrollToMap = false) {
  if (e) e.stopPropagation();
  const p = hhpState.properties.find(x => String(x.id) === String(id));
  if (!p) return;

  const modal = document.getElementById('property-detail-modal');
  const body = document.getElementById('property-detail-modal-body');
  if (!modal || !body) return;

  const imgs = (Array.isArray(p.images) && p.images.length > 0) ? p.images : (p.cdnImages || []);
  const mainImg = imgs[0] || '';
  const waNumber = p.cleanPhone || '971508379080';
  const waText = encodeURIComponent(`Hola, me interesa la propiedad "${p.title}" (${formatUsd(p.priceUsd)}) en Havana Home Pros.`);
  const waHref = `https://wa.me/${waNumber}?text=${waText}`;
  const exactLoc = p.exactAddress || `${p.neighborhood}, ${p.municipality}, La Habana`;
  const lat = Number(p.lat || 23.1165);
  const lng = Number(p.lng || -82.4260);
  const gmapsHref = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  body.innerHTML = `
    <div class="flex items-start justify-between gap-3 border-b border-stone-200 dark:border-white/10 pb-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase">Verificada Havana Home Pros</span>
          <span class="px-2.5 py-0.5 rounded-full bg-stone-200 dark:bg-white/10 text-[10px] font-bold">${p.propertyType} • Código #HHP-${String(p.id).slice(-5)}</span>
          <span class="text-[11px] opacity-65">Publicada: ${p.publishedDate || '2026'}</span>
        </div>
        <h2 class="font-display text-lg sm:text-2xl font-bold mt-1">${p.title}</h2>
        <p class="text-xs text-[#EF5E4E] font-bold flex items-center gap-1.5 mt-0.5">
          <i class="fa-solid fa-location-dot"></i>
          <span>${exactLoc}</span>
        </p>
      </div>
      <button onclick="closePropertyDetailModal()" class="w-9 h-9 rounded-full bg-stone-200 dark:bg-white/10 font-bold shrink-0">✕</button>
    </div>

    <!-- Main Photo + Thumbnails Strip -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div class="lg:col-span-8 space-y-3">
        <div class="aspect-[16/10] w-full rounded-2xl overflow-hidden bg-stone-900 border border-stone-200 dark:border-white/10">
          <img id="detail-main-photo" src="${mainImg}" alt="${p.title.replace(/"/g, '&quot;')}" class="w-full h-full object-cover" />
        </div>
        <div class="flex items-center gap-2 overflow-x-auto pb-1">
          ${imgs.map((imgUrl, idx) => `
            <button type="button" onclick="document.getElementById('detail-main-photo').src='${imgUrl}'" class="w-20 h-14 rounded-xl overflow-hidden border-2 border-transparent hover:border-[#EF5E4E] shrink-0">
              <img src="${imgUrl}" alt="Foto ${idx + 1}" class="w-full h-full object-cover" />
            </button>
          `).join('')}
        </div>

        <!-- Specs Bar -->
        <div class="grid grid-cols-3 gap-2 p-3.5 rounded-2xl bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 text-center">
          <div>
            <span class="block text-[10px] uppercase opacity-65">Habitaciones</span>
            <span class="font-display font-bold text-base"><i class="fa-solid fa-bed text-[#EF5E4E] mr-1"></i>${p.bedrooms}</span>
          </div>
          <div>
            <span class="block text-[10px] uppercase opacity-65">Baños</span>
            <span class="font-display font-bold text-base"><i class="fa-solid fa-bath text-[#EF5E4E] mr-1"></i>${p.bathrooms}</span>
          </div>
          <div>
            <span class="block text-[10px] uppercase opacity-65">Superficie Total</span>
            <span class="font-display font-bold text-base"><i class="fa-solid fa-ruler-combined text-[#EF5E4E] mr-1"></i>${p.areaSqm} m²</span>
          </div>
        </div>

        <!-- Full Original Description -->
        <div class="space-y-1.5">
          <h4 class="font-display font-bold text-sm">Descripción Completa del Inmueble</h4>
          <p class="text-xs leading-relaxed whitespace-pre-line opacity-90 bg-stone-100/70 dark:bg-white/5 p-3.5 rounded-2xl border border-stone-200/70 dark:border-white/10">${p.description || 'Propiedad verificada en excelente estado constructivo y documentación lista para venta.'}</p>
        </div>

        <!-- PROPERTY FINDER LOCATION & INTERACTIVE MAP SECTION -->
        <div id="detail-map-section" class="p-4 rounded-2xl bg-stone-100/80 dark:bg-white/5 border border-stone-200 dark:border-white/10 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 class="font-display font-bold text-sm flex items-center gap-1.5">
                <i class="fa-solid fa-map-location-dot text-[#EF5E4E]"></i>
                <span>Ubicación en el Mapa (Estilo Property Finder)</span>
              </h4>
              <p class="text-xs font-bold text-[#7A5A1E] dark:text-[#D9B76F] mt-0.5">${exactLoc}</p>
            </div>
            <a href="${gmapsHref}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-xl bg-[#14201B] hover:bg-[#EF5E4E] text-white text-[11px] font-extrabold transition-all flex items-center gap-1.5">
              <i class="fa-solid fa-up-right-from-square"></i>
              <span>Ver en Google Maps</span>
            </a>
          </div>
          <div id="detail-inline-leaflet-map" class="w-full h-64 rounded-2xl overflow-hidden border border-stone-300 dark:border-white/15 z-10"></div>
        </div>
      </div>

      <!-- Right Column: Price Card & Booking Form -->
      <div class="lg:col-span-4 space-y-4">
        <div class="p-4 rounded-2xl bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 space-y-3">
          <div class="text-xs uppercase font-bold opacity-65">Precio Oficial de Venta</div>
          <div class="font-display font-bold text-2xl sm:text-3xl text-[#EF5E4E]">${formatUsd(p.priceUsd)}</div>
          <div class="text-[11px] space-y-1.5 pt-2 border-t border-stone-200 dark:border-white/10">
            <div>• Ubicación: <strong>${p.neighborhood}, ${p.municipality}</strong></div>
            <div>• Referencia: <strong>${exactLoc}</strong></div>
            <div>• Anunciante: <strong>${p.contactName || 'Propietario Verificado'}</strong></div>
            <div>• Garantía: <strong>Verificada por Havana Home Pros</strong></div>
          </div>

          <div class="flex items-center gap-2 pt-2">
            <!-- Strict Rule #5: WhatsApp icon-only button -->
            <a href="${waHref}" target="_blank" rel="noopener" aria-label="WhatsApp" class="w-11 h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white flex items-center justify-center shadow-md shrink-0">
              <i class="fa-brands fa-whatsapp text-xl"></i>
            </a>
            <span class="text-[11px] opacity-75">Contacto directo por WhatsApp o agenda tu visita abajo:</span>
          </div>
        </div>

        <!-- Appointment Booking Form -->
        <form onsubmit="submitPropertyAppointment(event, '${String(p.id)}')" class="p-4 rounded-2xl bg-[#FFFDF8] dark:bg-black/30 border border-stone-300 dark:border-white/15 space-y-2.5 text-xs">
          <h4 class="font-display font-bold text-sm">Reservar Cita / Visita a la Propiedad</h4>
          <input id="book-name" type="text" required placeholder="Tu Nombre Completo" class="w-full px-3 py-2 rounded-xl bg-stone-100 dark:bg-white/5 border border-stone-300 dark:border-white/15" />
          <input id="book-phone" type="text" required placeholder="Tu WhatsApp (+1 / +34 / +53)" class="w-full px-3 py-2 rounded-xl bg-stone-100 dark:bg-white/5 border border-stone-300 dark:border-white/15" />
          <input id="book-date" type="date" required class="w-full px-3 py-2 rounded-xl bg-stone-100 dark:bg-white/5 border border-stone-300 dark:border-white/15" />
          <textarea id="book-notes" rows="2" placeholder="¿Compras desde el exterior o en La Habana?" class="w-full px-3 py-2 rounded-xl bg-stone-100 dark:bg-white/5 border border-stone-300 dark:border-white/15"></textarea>
          <button type="submit" class="w-full py-2.5 rounded-xl bg-[#14201B] hover:bg-[#EF5E4E] text-white font-extrabold transition-all">
            Reservar Cita
          </button>
        </form>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  // Render Property Finder interactive mini-map inside the modal
  setTimeout(() => {
    const mapEl = document.getElementById('detail-inline-leaflet-map');
    if (mapEl && window.L) {
      if (detailLeafletMap) {
        detailLeafletMap.remove();
        detailLeafletMap = null;
      }
      detailLeafletMap = L.map(mapEl).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap • Havana Home Pros'
      }).addTo(detailLeafletMap);

      L.circle([lat, lng], {
        color: '#EF5E4E',
        fillColor: '#EF5E4E',
        fillOpacity: 0.14,
        radius: 260
      }).addTo(detailLeafletMap);

      const priceIcon = L.divIcon({
        className: 'custom-pf-pin',
        html: `<div class="price-marker-pin">$${Math.round(Number(p.priceUsd) / 1000)}K USD</div>`,
        iconSize: [90, 28],
        iconAnchor: [45, 14]
      });

      L.marker([lat, lng], { icon: priceIcon })
        .addTo(detailLeafletMap)
        .bindPopup(`<strong>${p.title}</strong><br/><span style="color:#EF5E4E;font-weight:700;">${exactLoc}</span>`)
        .openPopup();

      if (scrollToMap) {
        document.getElementById('detail-map-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, 150);
}

function closePropertyDetailModal() {
  document.getElementById('property-detail-modal')?.classList.add('hidden');
}

function submitPropertyAppointment(e, propId) {
  e.preventDefault();
  const p = hhpState.properties.find(x => String(x.id) === String(propId));
  const name = document.getElementById('book-name').value.trim();
  const phone = document.getElementById('book-phone').value.trim();
  const date = document.getElementById('book-date').value;
  const notes = document.getElementById('book-notes').value.trim();

  hhpState.appointments.unshift({
    id: `apt-${Date.now()}`,
    propertyTitle: p ? `${p.title} (${formatUsd(p.priceUsd)})` : propId,
    clientName: name,
    clientPhone: phone,
    date,
    notes
  });
  saveState();
  alert('¡Cita registrada con éxito! Nuestro equipo o el propietario te contactará por WhatsApp.');
  closePropertyDetailModal();
}

function setLayoutMode(mode) {
  hhpState.layoutMode = mode;
  document.getElementById('layout-btn-GRID').className = mode === 'GRID'
    ? 'px-2.5 py-1 rounded-lg bg-[#EF5E4E] text-white text-xs font-bold'
    : 'px-2.5 py-1 rounded-lg text-xs font-bold';
  document.getElementById('layout-btn-LIST').className = mode === 'LIST'
    ? 'px-2.5 py-1 rounded-lg bg-[#EF5E4E] text-white text-xs font-bold'
    : 'px-2.5 py-1 rounded-lg text-xs font-bold';
  applyFilters();
}

function toggleMapSplitView() {
  hhpState.mapOpen = !hhpState.mapOpen;
  const mapSec = document.getElementById('havana-map-section');
  if (!mapSec) return;
  if (hhpState.mapOpen) {
    mapSec.classList.remove('hidden');
    setTimeout(() => {
      initOrUpdateLeafletMap(getFilteredProperties());
    }, 100);
  } else {
    mapSec.classList.add('hidden');
  }
}

function initOrUpdateLeafletMap(list) {
  if (!leafletMap) {
    leafletMap = L.map('havana-leaflet-map').setView([23.1165, -82.4220], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(leafletMap);
  } else {
    leafletMap.invalidateSize();
  }
  renderMapMarkers(list);
}

function renderMapMarkers(list) {
  if (!leafletMap) return;
  leafletMarkers.forEach(m => leafletMap.removeLayer(m));
  leafletMarkers = [];

  list.forEach(p => {
    const lat = Number(p.lat || 23.1180);
    const lng = Number(p.lng || -82.4280);
    const shortK = '$' + Math.round(Number(p.priceUsd || 50000) / 1000) + 'K';
    const icon = L.divIcon({
      className: '',
      html: `<div class="price-marker-pin">${shortK}</div>`,
      iconSize: [58, 26],
      iconAnchor: [29, 13]
    });
    const marker = L.marker([lat, lng], { icon }).addTo(leafletMap);
    marker.on('click', () => openPropertyDetailModal(String(p.id)));
    leafletMarkers.push(marker);
  });
}

// ============================================================================
// FREE PROPERTY PUBLISHER (1% COMMISSION CALCULATOR + CANVAS COMPRESSION)
// ============================================================================
function openPublishPropertyModal() {
  document.getElementById('publish-property-modal')?.classList.remove('hidden');
  updateCommissionCalculator();
}

function closePublishPropertyModal() {
  document.getElementById('publish-property-modal')?.classList.add('hidden');
}

function updateCommissionCalculator() {
  const price = Number(document.getElementById('pub-price')?.value || 0);
  const el = document.getElementById('pub-commission-numbers');
  if (!el) return;
  if (price > 0) {
    const fee1Pct = Math.round(price * 0.01);
    const ownerNet99 = price - fee1Pct;
    el.innerHTML = `• Si se vende en <strong>${formatUsd(price)}</strong>: Tú recibes <strong>${formatUsd(ownerNet99)} (99%)</strong> y la comisión de éxito de Havana Home Pros es de solo <strong>${formatUsd(fee1Pct)} (1%)</strong>.`;
  } else {
    el.innerHTML = `• Si se vende por nuestra web: Recibes el <strong>99% neto</strong> y solo abonas el <strong>1%</strong> al concretarse la venta.`;
  }
}

function handleCanvasPhotoUpload(event, hiddenId, previewId) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = new Image();
    img.onload = function() {
      const MAX = 800;
      let w = img.width;
      let h = img.height;
      if (w > h && w > MAX) {
        h = Math.round((h * MAX) / w);
        w = MAX;
      } else if (h > MAX) {
        w = Math.round((w * MAX) / h);
        h = MAX;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      let dataUrl = canvas.toDataURL('image/webp', 0.72);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      }
      const hidden = document.getElementById(hiddenId);
      if (hidden) hidden.value = dataUrl;
      const prev = document.getElementById(previewId);
      if (prev) {
        prev.src = dataUrl;
        prev.classList.remove('hidden');
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function submitPublicPropertyListing(e) {
  e.preventDefault();
  const title = document.getElementById('pub-title').value.trim();
  const priceUsd = Number(document.getElementById('pub-price').value || 50000);
  const neighborhood = document.getElementById('pub-zone').value;
  const propertyType = document.getElementById('pub-type').value;
  const bedrooms = Number(document.getElementById('pub-beds').value || 3);
  const bathrooms = Number(document.getElementById('pub-baths').value || 2);
  const areaSqm = Number(document.getElementById('pub-area').value || 200);
  const contactName = document.getElementById('pub-contact').value.trim();
  const phone = document.getElementById('pub-phone').value.trim();
  const cleanPhone = phone.replace(/[^\d]/g, '') || '5350000000';
  const description = document.getElementById('pub-desc').value.trim();
  const uploadedImg = document.getElementById('pub-image-dataurl').value || (hhpState.properties[0]?.images[0] || '');

  const newProp = {
    id: `hhp-${Date.now()}`,
    revolicoId: String(Date.now()).slice(-6),
    title,
    priceUsd,
    currency: 'USD',
    municipality: neighborhood === 'El Vedado' || neighborhood === 'Nuevo Vedado' ? 'Plaza de la Revolución' : 'Playa',
    neighborhood,
    propertyType,
    bedrooms,
    bathrooms,
    areaSqm,
    features: ['Propiedad en Regla', '1% Comisión Éxito', 'Verificada'],
    description,
    contactName,
    phone: '+' + cleanPhone,
    cleanPhone,
    revolicoUrl: '',
    publishedDate: new Date().toISOString().slice(0, 10),
    images: [uploadedImg],
    cdnImages: [uploadedImg],
    lat: 23.1185,
    lng: -82.4250,
    verified: true,
    commissionModel: '1% Comisión Éxito'
  };

  hhpState.properties.unshift(newProp);
  saveState();
  applyFilters();
  closePublishPropertyModal();
  alert('¡Tu propiedad ha sido publicada gratis en Havana Home Pros! (Modalidad 1% de comisión solo en caso de venta).');
}

// ============================================================================
// 5-TAB MOBILE ADMIN DASHBOARD ("TIERRA QUERIDA" ARCHITECTURE)
// ============================================================================
function openAdminModal() {
  document.getElementById('admin-modal')?.classList.remove('hidden');
  if (isAdminLogged) {
    document.getElementById('admin-login-box')?.classList.add('hidden');
    document.getElementById('admin-dashboard-content')?.classList.remove('hidden');
    renderAdminDashboard();
  }
}

function closeAdminModal() {
  document.getElementById('admin-modal')?.classList.add('hidden');
}

function handleAdminLogin(e) {
  e.preventDefault();
  isAdminLogged = true;
  document.getElementById('header-admin-gold-pill')?.classList.remove('hidden');
  document.getElementById('header-admin-gold-pill')?.classList.add('inline-flex');
  document.getElementById('admin-login-box')?.classList.add('hidden');
  document.getElementById('admin-dashboard-content')?.classList.remove('hidden');
  renderAdminDashboard();
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.js-adm-panel').forEach(p => {
    if (p.id === tabId) p.classList.remove('hidden');
    else p.classList.add('hidden');
  });
}

function renderAdminDashboard() {
  const countEl = document.getElementById('adm-prop-count');
  if (countEl) countEl.textContent = String(hhpState.properties.length);

  const listEl = document.getElementById('admin-properties-list');
  if (listEl) {
    listEl.innerHTML = hhpState.properties.map(p => `
      <div class="p-3 rounded-2xl bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <img src="${(p.images && p.images[0]) || ''}" class="w-14 h-12 rounded-xl object-cover shrink-0 border" />
          <div class="min-w-0">
            <div class="font-bold text-xs truncate">${p.title}</div>
            <div class="text-[11px] text-[#EF5E4E] font-extrabold">${formatUsd(p.priceUsd)} • ${p.neighborhood} (${p.bedrooms} Hab / ${p.bathrooms} Baños)</div>
          </div>
        </div>
        <button onclick="deletePropertyStrict('${String(p.id)}')" class="px-3 py-1.5 rounded-xl bg-red-500/15 text-red-600 font-bold text-xs hover:bg-red-600 hover:text-white shrink-0">
          Eliminar
        </button>
      </div>
    `).join('');
  }

  const zonesEl = document.getElementById('adm-zones-list');
  if (zonesEl) {
    zonesEl.innerHTML = hhpState.zones.map(z => `
      <span class="px-3 py-1.5 rounded-xl bg-stone-200 dark:bg-white/10 font-bold text-xs flex items-center gap-2">
        ${z}
        <button onclick="deleteZoneStrict('${String(z)}')" class="text-red-500 font-extrabold">✕</button>
      </span>
    `).join('');
  }

  const aptsEl = document.getElementById('adm-appointments-list');
  if (aptsEl) {
    aptsEl.innerHTML = hhpState.appointments.map(a => `
      <div class="p-3 rounded-2xl bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10">
        <div class="font-bold text-xs text-[#EF5E4E]">${a.propertyTitle}</div>
        <div class="text-xs font-semibold mt-0.5">${a.clientName} • ${a.clientPhone} • Fecha: ${a.date}</div>
        <div class="text-[11px] opacity-75">${a.notes || ''}</div>
      </div>
    `).join('');
  }
}

function deletePropertyStrict(id) {
  const sid = String(id);
  hhpState.properties = hhpState.properties.filter(p => String(p.id) !== sid);
  saveState();
  renderAdminDashboard();
  applyFilters();
}

function addDynamicZone() {
  const inp = document.getElementById('adm-new-zone');
  const val = (inp?.value || '').trim();
  if (!val) return;
  if (!hhpState.zones.includes(val)) {
    hhpState.zones.push(val);
    saveState();
    renderAdminDashboard();
    applyFilters();
  }
  inp.value = '';
}

function deleteZoneStrict(zoneName) {
  const sz = String(zoneName);
  hhpState.zones = hhpState.zones.filter(z => String(z) !== sz);
  saveState();
  renderAdminDashboard();
  applyFilters();
}

function saveAdminBanner() {
  const val = document.getElementById('adm-banner-input')?.value.trim();
  if (val) {
    hhpState.bannerText = val;
    const bannerEl = document.querySelector('[data-i18n="top_banner_text"]');
    if (bannerEl) bannerEl.innerHTML = val;
    saveState();
    alert('Banner superior actualizado en vivo.');
  }
}

function exportBackupJson() {
  const blob = new Blob([JSON.stringify(hhpState, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `havana_home_pros_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackupJson(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && Array.isArray(parsed.properties)) {
        hhpState = { ...hhpState, ...parsed };
        saveState();
        renderAdminDashboard();
        applyFilters();
        alert('Copia de seguridad restaurada con éxito.');
      }
    } catch (err) {
      alert('Archivo JSON inválido.');
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// THEME, LANGUAGE & MOBILE DRAWER
// ============================================================================
function toggleTheme() {
  const html = document.documentElement;
  const icon = document.getElementById('theme-icon');
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    html.classList.add('light');
    if (icon) icon.className = 'fa-solid fa-moon text-[#7A5A1E]';
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    if (icon) icon.className = 'fa-solid fa-sun text-[#D9B76F]';
  }
}

function changeLanguage(lang) {
  const dict = I18N_DICT[lang] || I18N_DICT.es;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.innerHTML = dict[key];
  });
}

function toggleMobileDrawer(open) {
  const dr = document.getElementById('mobile-drawer');
  if (!dr) return;
  if (open) dr.classList.remove('hidden');
  else dr.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  loadInitialState();
  applyFilters();
  syncFromSupabase();
});
