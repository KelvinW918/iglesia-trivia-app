const RankingComponent = {
    periodoActual: 'total',

    // ════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════

    _escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    _setLoading(btn, originalHtml) {
        if (!btn) return;
        btn.disabled = true;
        btn.classList.add('opacity-60', 'cursor-not-allowed');
        btn.innerHTML = `<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>`;
    },

    _resetButton(btn, originalHtml) {
        if (!btn || !originalHtml) return;
        btn.disabled = false;
        btn.classList.remove('opacity-60', 'cursor-not-allowed');
        btn.innerHTML = originalHtml;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    // ════════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════════
    async render(containerId) {
        this.containerId = containerId;
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <i data-lucide="trophy" class="w-5 h-5 text-amber-400"></i>
                        <h3 class="font-bold text-white text-lg">Ranking</h3>
                    </div>
                    <button id="btn-recargar-ranking" aria-label="Recargar ranking"
                        class="p-1.5 text-slate-400 hover:text-white transition hover:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    </button>
                </div>

                <!-- Tabs de período -->
                <div class="flex gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-700/50"
                    role="tablist" aria-label="Período del ranking">
                    <button data-periodo="diario" role="tab" aria-selected="false" aria-label="Ranking de hoy"
                        class="tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        Hoy
                    </button>
                    <button data-periodo="semanal" role="tab" aria-selected="false" aria-label="Ranking semanal"
                        class="tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        Semana
                    </button>
                    <button data-periodo="mensual" role="tab" aria-selected="false" aria-label="Ranking mensual"
                        class="tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        Mes
                    </button>
                    <button data-periodo="total" role="tab" aria-selected="false" aria-label="Ranking total histórico"
                        class="tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        Total
                    </button>
                </div>

                <p id="ranking-subtitulo" class="text-xs text-slate-400 text-center -mt-2" aria-live="polite"></p>

                <div id="ranking-lista" class="divide-y divide-slate-700/50" role="region"
                    aria-live="polite" aria-label="Lista del ranking">
                    <p class="text-xs text-slate-400 text-center py-4">Cargando ranking...</p>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        this._marcarTabActivo();

        document.querySelectorAll('.tab-ranking').forEach(btn => {
            btn.onclick = () => {
                const periodo = btn.getAttribute('data-periodo');
                if (periodo === this.periodoActual) return;
                this.periodoActual = periodo;
                this._marcarTabActivo();
                this.actualizarDatos();
            };
        });

        const btnRecargar = document.getElementById('btn-recargar-ranking');
        if (btnRecargar) {
            btnRecargar.onclick = () => this.actualizarDatos();
        }

        this.actualizarDatos();
    },

    _marcarTabActivo() {
        document.querySelectorAll('.tab-ranking').forEach(btn => {
            const p = btn.getAttribute('data-periodo');
            const esActivo = p === this.periodoActual;
            btn.setAttribute('aria-selected', esActivo ? 'true' : 'false');
            if (esActivo) {
                btn.className = 'tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 focus:outline-none focus:ring-2 focus:ring-indigo-500';
            } else {
                btn.className = 'tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition text-slate-400 hover:text-white hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-indigo-500';
            }
        });
    },

    // ════════════════════════════════════════════════════════════
    // CARGA DE DATOS
    // ════════════════════════════════════════════════════════════
    async actualizarDatos() {
        const listaContainer = document.getElementById('ranking-lista');
        const subtitulo = document.getElementById('ranking-subtitulo');
        const btnRecargar = document.getElementById('btn-recargar-ranking');

        if (!listaContainer) return;

        // Estado de carga en el botón de recargar
        let originalBtnHtml = null;
        if (btnRecargar) {
            originalBtnHtml = btnRecargar.innerHTML;
            this._setLoading(btnRecargar);
        }

        listaContainer.innerHTML = `
            <div class="text-center py-6" role="status">
                <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500 mx-auto"></div>
                <p class="text-xs text-slate-400 mt-2">Cargando...</p>
            </div>`;

        try {
            const data = await ApiService.obtenerRanking(this.periodoActual);

            if (subtitulo) subtitulo.textContent = data.titulo || '';

            const hayDatos = data.ranking && data.ranking.length > 0;
            const hayPuntos = hayDatos && data.ranking.some(r => (r.puntuacion_total || 0) > 0);

            if (hayDatos) {
                listaContainer.innerHTML = data.ranking.map((r, i) => {
                    // ✅ Reemplazo de emojis por iconos Lucide coherentes
                    let medallaHtml = '';
                    let colorPuesto = 'text-slate-400';

                    if (i === 0) {
                        medallaHtml = `<i data-lucide="medal" class="w-4 h-4 text-amber-400 fill-amber-400/20"></i>`;
                        colorPuesto = 'text-amber-400';
                    } else if (i === 1) {
                        medallaHtml = `<i data-lucide="medal" class="w-4 h-4 text-slate-300 fill-slate-300/20"></i>`;
                        colorPuesto = 'text-slate-300';
                    } else if (i === 2) {
                        medallaHtml = `<i data-lucide="medal" class="w-4 h-4 text-amber-700 fill-amber-700/20"></i>`;
                        colorPuesto = 'text-amber-700';
                    }

                    const sinPuntos = (r.puntuacion_total || 0) === 0;

                    return `
                        <div class="py-3 flex justify-between items-center text-sm ${sinPuntos ? 'opacity-70' : ''}">
                            <div class="flex items-center space-x-3">
                                <span class="font-bold w-6 text-center ${colorPuesto}">#${r.puesto}</span>
                                <span class="font-medium text-slate-200">${this._escapeHtml(r.nombre)}</span>
                                ${medallaHtml}
                            </div>
                            <span class="font-semibold px-2.5 py-1 rounded-full text-xs ${sinPuntos
                            ? 'bg-slate-700/40 text-slate-400'
                            : 'bg-indigo-500/10 text-indigo-400'}">
                                ${r.puntuacion_total || 0} pts
                            </span>
                        </div>`;
                }).join('');

                if (!hayPuntos) {
                    listaContainer.innerHTML += `
                        <div class="text-center py-4 border-t border-slate-700/50">
                            <p class="text-[11px] text-slate-400 italic">Aún no hay puntos registrados en este período.</p>
                        </div>`;
                }
            } else {
                listaContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Sin registros todavía.</p>`;
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();

        } catch (e) {
            console.error("Error cargando ranking:", e);
            listaContainer.innerHTML = `
                <div class="text-center py-5 space-y-2">
                    <i data-lucide="alert-circle" class="w-6 h-6 text-rose-400 mx-auto"></i>
                    <p class="text-xs text-rose-300">No pudimos cargar el ranking.</p>
                    <button id="btn-reintentar-ranking"
                        class="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-rose-500">
                        <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                        Reintentar
                    </button>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            const btnRetry = document.getElementById('btn-reintentar-ranking');
            if (btnRetry) btnRetry.onclick = () => this.actualizarDatos();

        } finally {
            if (btnRecargar && originalBtnHtml) {
                this._resetButton(btnRecargar, originalBtnHtml);
            }
        }
    }
};