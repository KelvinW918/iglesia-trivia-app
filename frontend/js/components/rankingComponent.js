const RankingComponent = {
    periodoActual: 'total',

    async render(containerId) {
        this.containerId = containerId;
        const container = document.getElementById(containerId);
        container.innerHTML = `
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <i data-lucide="trophy" class="w-5 h-5 text-amber-400"></i>
                        <h3 class="font-bold text-white text-lg">Ranking</h3>
                    </div>
                    <button id="btn-recargar-ranking" class="p-1.5 text-slate-400 hover:text-white transition hover:bg-slate-800 rounded-lg" title="Recargar ranking">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    </button>
                </div>

                <!-- Tabs de período -->
                <div class="flex gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-700/50">
                    <button data-periodo="diario" class="tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition">
                        Hoy
                    </button>
                    <button data-periodo="semanal" class="tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition">
                        Semana
                    </button>
                    <button data-periodo="mensual" class="tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition">
                        Mes
                    </button>
                    <button data-periodo="total" class="tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition">
                        Total
                    </button>
                </div>

                <!-- Subtítulo dinámico del período -->
                <p id="ranking-subtitulo" class="text-[11px] text-slate-500 text-center -mt-2"></p>

                <!-- Lista del ranking -->
                <div id="ranking-lista" class="divide-y divide-slate-700/50">
                    <p class="text-xs text-slate-400 text-center py-4">Cargando ranking...</p>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Marcar tab activo
        this._marcarTabActivo();

        // Handlers de tabs
        document.querySelectorAll('.tab-ranking').forEach(btn => {
            btn.onclick = () => {
                const periodo = btn.getAttribute('data-periodo');
                if (periodo === this.periodoActual) return;
                this.periodoActual = periodo;
                this._marcarTabActivo();
                this.actualizarDatos();
            };
        });

        // Handler de recargar
        const btnRecargar = document.getElementById('btn-recargar-ranking');
        if (btnRecargar) {
            btnRecargar.onclick = () => this.actualizarDatos();
        }

        this.actualizarDatos();
    },

    _marcarTabActivo() {
        document.querySelectorAll('.tab-ranking').forEach(btn => {
            const p = btn.getAttribute('data-periodo');
            if (p === this.periodoActual) {
                btn.className = 'tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition bg-indigo-600 text-white shadow-lg shadow-indigo-600/20';
            } else {
                btn.className = 'tab-ranking flex-1 text-xs font-semibold py-2 rounded-lg transition text-slate-400 hover:text-white hover:bg-slate-800/50';
            }
        });
    },

    async actualizarDatos() {
        const listaContainer = document.getElementById('ranking-lista');
        const subtitulo = document.getElementById('ranking-subtitulo');
        if (!listaContainer) return;

        listaContainer.innerHTML = `
            <div class="text-center py-6">
                <i data-lucide="loader-2" class="w-5 h-5 animate-spin text-indigo-500 mx-auto"></i>
                <p class="text-xs text-slate-400 mt-2">Cargando...</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const data = await ApiService.obtenerRanking(this.periodoActual);

            // Mostrar subtítulo del período (fecha de corte o descripción)
            if (subtitulo) {
                subtitulo.textContent = data.titulo || '';
            }

            const hayDatos = data.ranking && data.ranking.length > 0;
            const hayPuntos = hayDatos && data.ranking.some(r => r.puntuacion_total > 0);

            if (hayDatos) {
                listaContainer.innerHTML = data.ranking.map((r, i) => {
                    const esTop3 = i < 3;
                    const colorPuesto = i === 0
                        ? 'text-amber-400 text-base'
                        : i === 1
                            ? 'text-slate-300'
                            : i === 2
                                ? 'text-amber-600'
                                : 'text-slate-500';

                    const iconoTop = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                    const sinPuntos = r.puntuacion_total === 0;

                    return `
                        <div class="py-3 flex justify-between items-center text-sm ${sinPuntos ? 'opacity-60' : ''}">
                            <div class="flex items-center space-x-3">
                                <span class="font-bold w-6 text-center ${colorPuesto}">#${r.puesto}</span>
                                <span class="font-medium text-slate-200">${r.nombre}</span>
                                ${iconoTop ? `<span class="text-xs">${iconoTop}</span>` : ''}
                            </div>
                            <span class="bg-indigo-500/10 text-indigo-400 font-semibold px-2.5 py-1 rounded-full text-xs ${sinPuntos ? 'bg-slate-700/40 text-slate-500' : ''}">
                                ${r.puntuacion_total} pts
                            </span>
                        </div>`;
                }).join('');

                // Si no hay puntos en el período, mostrar aviso
                if (!hayPuntos) {
                    listaContainer.innerHTML += `
                        <div class="text-center py-4 border-t border-slate-700/50">
                            <p class="text-[11px] text-slate-500 italic">Aún no hay puntos registrados en este período.</p>
                        </div>`;
                }
            } else {
                listaContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Sin registros todavía.</p>`;
            }
        } catch (e) {
            console.error("Error cargando ranking:", e);
            listaContainer.innerHTML = `
                <div class="text-center py-4">
                    <i data-lucide="alert-circle" class="w-5 h-5 text-rose-400 mx-auto"></i>
                    <p class="text-xs text-rose-400 mt-1">Error al cargar ranking.</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
};