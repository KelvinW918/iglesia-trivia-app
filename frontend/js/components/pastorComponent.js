const PastorComponent = {

    // ════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════

    _mostrarAlerta(tipo, mensaje, contenedorId = 'pastor-alerta-host') {
        const host = document.getElementById(contenedorId) || document.body;
        this._limpiarAlerta();

        const estilos = {
            error: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
            exito: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
            info: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
        };
        const iconos = { error: 'alert-circle', exito: 'check-circle-2', info: 'info' };

        const alerta = document.createElement('div');
        alerta.id = 'pastor-alerta';
        alerta.setAttribute('role', 'alert');
        alerta.setAttribute('aria-live', 'assertive');
        alerta.className = `flex items-start gap-3 p-3 rounded-xl border text-sm ${estilos[tipo] || estilos.error} mb-3`;
        alerta.innerHTML = `
            <i data-lucide="${iconos[tipo] || 'alert-circle'}" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
            <span class="flex-1">${this._escapeHtml(mensaje)}</span>
        `;

        if (host.firstChild) {
            host.insertBefore(alerta, host.firstChild);
        } else {
            host.appendChild(alerta);
        }

        if (window.lucide) lucide.createIcons();
        setTimeout(() => { const el = document.getElementById('pastor-alerta'); if (el) el.remove(); }, 8000);
    },

    _limpiarAlerta() {
        const el = document.getElementById('pastor-alerta');
        if (el) el.remove();
    },

    _setLoading(btn, texto = 'Enviando...') {
        if (!btn) return null;
        const html = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('opacity-70', 'cursor-not-allowed');
        btn.innerHTML = `
            <svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span>${texto}</span>`;
        return html;
    },

    _resetButton(btn, html) {
        if (!btn || !html) return;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        btn.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    _escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /**
     * Badge circular reutilizable con el logo CCRF.
     * size: 'sm' | 'md' | 'lg'
     */
    _renderLogoBadge(size = 'sm') {
        const sizes = {
            sm: { box: 'w-11 h-11', padding: 'p-1', radius: 'rounded-xl' },
            md: { box: 'w-16 h-16', padding: 'p-1.5', radius: 'rounded-2xl' },
            lg: { box: 'w-20 h-20', padding: 'p-2', radius: 'rounded-2xl' },
        };
        const s = sizes[size] || sizes.sm;
        return `
            <div class="inline-flex items-center justify-center ${s.box} ${s.radius} bg-white shadow-lg shadow-indigo-500/15 border border-slate-200 overflow-hidden flex-shrink-0">
                <img src="./img/logo_blanco.png"
                     alt="CCRF Jehová Justicia Nuestra"
                     class="w-full h-full object-contain ${s.padding}">
            </div>
        `;
    },

    // ════════════════════════════════════════════════════════════
    // RENDER PRINCIPAL
    // ════════════════════════════════════════════════════════════
    render(containerId, usuarioActual, onLogout) {
        // 🔴 Si no llega usuarioActual, fallamos explícito
        if (!usuarioActual || !usuarioActual.id) {
            console.error('[PastorComponent] FATAL: usuarioActual no recibido. Abortando render.');
            const c = document.getElementById(containerId);
            if (c) c.innerHTML = `<div class="text-rose-400 text-center py-10">Error interno: falta información del usuario.</div>`;
            return;
        }

        this.containerId = containerId;
        this.usuarioActual = usuarioActual;
        this.onLogout = onLogout;

        this.respuestasPendientes = [];
        this.usuarioSeleccionado = null;
        this.vistaActual = 'respuestas';

        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div id="pastor-alerta-host"></div>
            <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

                <!-- ═══ Header Pastor ═══ -->
                <header class="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 sm:py-4 shadow-md sticky top-0 z-40">
                    <div class="max-w-7xl mx-auto flex items-center justify-between gap-3">
                        <div class="flex items-center space-x-3 min-w-0">
                            ${this._renderLogoBadge('sm')}
                            <div class="min-w-0">
                                <h1 class="text-sm sm:text-lg font-bold tracking-tight text-white leading-tight truncate">CCRF Jehová Justicia Nuestra</h1>
                                <span class="inline-block text-[10px] font-semibold uppercase px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded-full border border-rose-500/30 mt-0.5">
                                    Pastor · Evaluador
                                </span>
                            </div>
                        </div>

                        <div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
                            <span class="text-sm font-medium text-slate-300 hidden md:inline">Hola, <strong class="text-white">${this._escapeHtml(this.usuarioActual.nombre)}</strong></span>
                            <button id="btn-logout-pastor" title="Cerrar Sesión" aria-label="Cerrar sesión"
                                class="p-2 text-slate-400 hover:text-rose-400 transition hover:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500">
                                <i data-lucide="log-out" class="w-5 h-5"></i>
                            </button>
                        </div>
                    </div>
                </header>

                <!-- ═══ Panel Principal ═══ -->
                <main class="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">

                    <!-- Lista de respuestas pendientes -->
                    <div class="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-xl">
                        <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                            <h2 class="text-base font-semibold text-white flex items-center gap-2">
                                <i data-lucide="inbox" class="w-5 h-5 text-indigo-400"></i>
                                Respuestas Recibidas
                            </h2>
                            <div class="flex items-center gap-1">
                                <button id="btn-gestion-usuarios" title="Gestión de usuarios" aria-label="Gestión de usuarios"
                                    class="p-1.5 text-slate-400 hover:text-indigo-400 transition hover:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <i data-lucide="user-cog" class="w-4 h-4"></i>
                                </button>
                                <button id="btn-recargar-respuestas" title="Recargar respuestas" aria-label="Recargar respuestas"
                                    class="p-1.5 text-slate-400 hover:text-white transition hover:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>

                        <div id="lista-usuarios-respuestas" class="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] pr-1"
                            role="region" aria-live="polite" aria-label="Lista de respuestas pendientes">
                            <div class="text-center py-10 text-slate-400">
                                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                                <p class="text-xs">Cargando respuestas...</p>
                            </div>
                        </div>
                    </div>

                    <!-- Panel de detalle -->
                    <div id="panel-revision-respuesta"
                        class="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-center items-center">
                        <div class="text-center max-w-sm space-y-4 py-12 text-slate-400">
                            ${this._renderLogoBadge('lg')}
                            <div class="space-y-2">
                                <h3 class="text-lg font-semibold text-slate-300">Selecciona un miembro</h3>
                                <p class="text-xs text-slate-400 leading-relaxed">
                                    Haz clic en un miembro de la lista para revisar sus respuestas del devocional y enviar tu retroalimentación pastoral.
                                </p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        const btnLogout = document.getElementById('btn-logout-pastor');
        if (btnLogout) {
            btnLogout.onclick = () => {
                if (typeof this.onLogout === 'function') this.onLogout();
            };
        }

        const btnRecargar = document.getElementById('btn-recargar-respuestas');
        if (btnRecargar) {
            btnRecargar.onclick = () => {
                if (this.vistaActual === 'usuarios') this.mostrarGestionUsuarios();
                else this.cargarRespuestas();
            };
        }

        const btnGestion = document.getElementById('btn-gestion-usuarios');
        if (btnGestion) btnGestion.onclick = () => this.mostrarGestionUsuarios();

        this.cargarRespuestas();
    },

    // ════════════════════════════════════════════════════════════
    // CARGA DE RESPUESTAS PENDIENTES
    // ════════════════════════════════════════════════════════════
    async cargarRespuestas() {
        this.vistaActual = 'respuestas';
        const contenedorLista = document.getElementById('lista-usuarios-respuestas');
        if (!contenedorLista) return;

        contenedorLista.innerHTML = `
            <div class="text-center py-10 text-slate-400" role="status">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                <p class="text-xs">Cargando respuestas...</p>
            </div>`;

        try {
            let data = await ApiService.obtenerRespuestasPendientes();

            if (data && !Array.isArray(data) && data.respuestas) data = data.respuestas;
            else if (!Array.isArray(data)) data = [];

            this.respuestasPendientes = data;

            if (this.respuestasPendientes.length === 0) {
                contenedorLista.innerHTML = `
                    <div class="text-center py-12 px-4 border border-dashed border-emerald-500/30 rounded-xl bg-emerald-500/5">
                        <div class="inline-flex p-3 bg-emerald-500/15 rounded-full mb-3 border border-emerald-500/30">
                            <i data-lucide="check-circle-2" class="w-8 h-8 text-emerald-400"></i>
                        </div>
                        <p class="text-sm font-medium text-emerald-300">¡Sin entregas pendientes!</p>
                        <p class="text-xs text-slate-400 mt-1">Todas las respuestas de hoy ya fueron evaluadas.</p>
                    </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                this.mostrarPanelVacio();
                return;
            }

            const usuariosMap = new Map();
            this.respuestasPendientes.forEach(item => {
                const userId = item.user_id || item.usuario_id || item.id_usuario;
                const nombre = item.nombre_usuario || item.nombre || 'Miembro';
                if (!userId) return;
                if (!usuariosMap.has(userId)) {
                    usuariosMap.set(userId, { userId, nombre, respuestas: [] });
                }
                usuariosMap.get(userId).respuestas.push(item);
            });

            const usuariosLista = Array.from(usuariosMap.values());

            contenedorLista.innerHTML = usuariosLista.map(u => `
                <div data-userid="${u.userId}" class="item-usuario-respuesta p-4 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-xl cursor-pointer transition flex items-center justify-between group">
                    <div class="flex items-center space-x-3 min-w-0">
                        <div class="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold border border-indigo-500/20 group-hover:bg-indigo-600 group-hover:text-white transition flex-shrink-0">
                            ${this._escapeHtml(u.nombre.charAt(0).toUpperCase())}
                        </div>
                        <div class="min-w-0">
                            <h4 class="text-sm font-semibold text-white group-hover:text-indigo-400 transition truncate">${this._escapeHtml(u.nombre)}</h4>
                            <span class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <i data-lucide="file-question" class="w-3.5 h-3.5 text-slate-400"></i>
                                ${u.respuestas.length} respuesta(s)
                            </span>
                        </div>
                    </div>
                    <i data-lucide="chevron-right" class="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition flex-shrink-0"></i>
                </div>
            `).join('');

            if (typeof lucide !== 'undefined') lucide.createIcons();

            document.querySelectorAll('.item-usuario-respuesta').forEach(elem => {
                elem.onclick = () => {
                    const userId = elem.getAttribute('data-userid');
                    const usuarioSel = usuariosLista.find(u => String(u.userId) === String(userId));
                    document.querySelectorAll('.item-usuario-respuesta').forEach(i => i.classList.remove('border-indigo-500', 'bg-slate-900'));
                    elem.classList.add('border-indigo-500', 'bg-slate-900');
                    this.mostrarDetalleUsuario(usuarioSel);
                };
            });

        } catch (error) {
            console.error("Error cargando respuestas:", error);
            contenedorLista.innerHTML = `
                <div class="text-center py-8 px-4 border border-rose-500/20 bg-rose-500/5 rounded-xl text-rose-300">
                    <i data-lucide="alert-circle" class="w-7 h-7 mx-auto mb-2 text-rose-400"></i>
                    <p class="text-xs font-medium mb-3">Error al cargar la lista</p>
                    <button id="btn-reintentar-respuestas"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-rose-500">
                        <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                        Reintentar
                    </button>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            const btnRetry = document.getElementById('btn-reintentar-respuestas');
            if (btnRetry) btnRetry.onclick = () => this.cargarRespuestas();
        }
    },

    mostrarPanelVacio() {
        const panel = document.getElementById('panel-revision-respuesta');
        if (!panel) return;
        panel.className = "lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-center items-center";
        panel.innerHTML = `
            <div class="text-center max-w-sm space-y-4 py-12 text-slate-400">
                ${this._renderLogoBadge('lg')}
                <div class="space-y-2">
                    <h3 class="text-lg font-semibold text-slate-300">Selecciona un miembro</h3>
                    <p class="text-xs text-slate-400 leading-relaxed">
                        Haz clic en un miembro de la lista para revisar sus respuestas del devocional y enviar tu retroalimentación pastoral.
                    </p>
                </div>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    mostrarDetalleUsuario(usuarioData) {
        this.usuarioSeleccionado = usuarioData;
        const panel = document.getElementById('panel-revision-respuesta');
        if (!panel) return;

        panel.className = "lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col";

        panel.innerHTML = `
            <div class="space-y-6">
                <div class="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div class="flex items-center space-x-3">
                        <div class="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-indigo-600/20">
                            ${this._escapeHtml(usuarioData.nombre.charAt(0).toUpperCase())}
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-white">${this._escapeHtml(usuarioData.nombre)}</h3>
                            <p class="text-xs text-slate-400">Revisión de respuestas enviadas</p>
                        </div>
                    </div>
                    <span class="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
                        ${usuarioData.respuestas.length} Pregunta(s)
                    </span>
                </div>

                <div class="space-y-5 max-h-[calc(100vh-260px)] overflow-y-auto pr-2">
                    ${usuarioData.respuestas.map((r, index) => this._renderRespuestaEvaluable(r, index)).join('')}
                </div>
            </div>`;

        if (typeof lucide !== 'undefined') lucide.createIcons();
        usuarioData.respuestas.forEach((r, index) => this._bindRespuestaHandlers(r, index));

        // 📱 En móvil, hacer scroll automático al panel de detalle
        if (window.innerWidth < 1024) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    _renderRespuestaEvaluable(r, index) {
        const textoPregunta = r.pregunta_texto || r.enunciado || `Pregunta #${index + 1}`;
        const textoRespuesta = r.respuesta_texto || r.respuesta_enviada || 'Sin respuesta grabada';
        const tipo = r.tipo_pregunta || r.tipo || 'desarrollo';
        const answerId = r.answer_id || r.id;

        return `
            <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3" data-answer-id="${answerId}">
                <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Pregunta #${index + 1}</span>
                    <span class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        ${this._escapeHtml(tipo.replace('_', ' '))}
                    </span>
                </div>

                <p class="text-sm font-medium text-slate-200">${this._escapeHtml(textoPregunta)}</p>

                <div class="p-3 bg-slate-900 rounded-lg text-sm text-slate-300 border border-slate-800/60 leading-relaxed italic">
                    "${this._escapeHtml(textoRespuesta)}"
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1">
                    <button type="button" data-action="correcto" data-index="${index}"
                        class="btn-dictamen py-2 px-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        <i data-lucide="check-circle-2" class="w-4 h-4"></i>
                        <span>Correcto</span>
                    </button>
                    <button type="button" data-action="incorrecto" data-index="${index}"
                        class="btn-dictamen py-2 px-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition hover:border-rose-500/50 focus:outline-none focus:ring-2 focus:ring-rose-500">
                        <i data-lucide="x-circle" class="w-4 h-4"></i>
                        <span>Incorrecto</span>
                    </button>
                </div>

                <div>
                    <label class="block text-[11px] text-slate-400 mb-1 font-medium">Comentario de Feedback (opcional):</label>
                    <textarea data-role="feedback-${index}" rows="2"
                        placeholder="Observaciones o palabras de edificación..."
                        class="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                </div>

                <button type="button" data-action="enviar" data-index="${index}"
                    class="btn-enviar-evaluacion w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600 text-white font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 text-xs">
                    <i data-lucide="send" class="w-4 h-4"></i>
                    <span>Enviar Evaluación</span>
                </button>
            </div>`;
    },

    _bindRespuestaHandlers(r, index) {
        const answerId = r.answer_id || r.id;
        const card = document.querySelector(`[data-answer-id="${answerId}"]`);
        if (!card) return;

        let dictamenSeleccionado = null;

        const btnCorrecto = card.querySelector(`[data-action="correcto"]`);
        const btnIncorrecto = card.querySelector(`[data-action="incorrecto"]`);
        const btnEnviar = card.querySelector(`[data-action="enviar"]`);
        const inputFeedback = card.querySelector(`[data-role="feedback-${index}"]`);

        const resetEstilos = () => {
            btnCorrecto.className = 'btn-dictamen py-2 px-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500';
            btnIncorrecto.className = 'btn-dictamen py-2 px-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition hover:border-rose-500/50 focus:outline-none focus:ring-2 focus:ring-rose-500';
        };

        btnCorrecto.onclick = () => {
            dictamenSeleccionado = 'correcto';
            resetEstilos();
            btnCorrecto.className = 'btn-dictamen py-2 px-3 rounded-lg border border-emerald-500 bg-emerald-500/10 text-emerald-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition';
        };

        btnIncorrecto.onclick = () => {
            dictamenSeleccionado = 'incorrecto';
            resetEstilos();
            btnIncorrecto.className = 'btn-dictamen py-2 px-3 rounded-lg border border-rose-500 bg-rose-500/10 text-rose-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition';
        };

        btnEnviar.onclick = async () => {
            this._limpiarAlerta();

            if (!dictamenSeleccionado) {
                return this._mostrarAlerta('error', 'Selecciona Correcto o Incorrecto antes de enviar.');
            }

            const payload = {
                answer_id: answerId,
                estado: dictamenSeleccionado,
                feedback: inputFeedback.value.trim(),
                evaluado_por: this.usuarioActual.id,   // ✅ ID real del pastor
            };

            const htmlOriginal = this._setLoading(btnEnviar, 'Enviando...');

            try {
                await ApiService.guardarEvaluacionPastor(payload);

                card.classList.add('opacity-60', 'border-emerald-500/40');
                btnEnviar.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>Evaluada</span>`;
                btnEnviar.className = 'w-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs cursor-default';
                btnCorrecto.disabled = true;
                btnIncorrecto.disabled = true;
                inputFeedback.disabled = true;
                if (typeof lucide !== 'undefined') lucide.createIcons();

                setTimeout(() => this.cargarRespuestas(), 800);
            } catch (err) {
                console.error("Error enviando evaluación:", err);
                this._mostrarAlerta('error', `No se pudo guardar: ${err.message || 'Error desconocido'}`);
                this._resetButton(btnEnviar, htmlOriginal);
            }
        };
    },

    // ════════════════════════════════════════════════════════════
    // GESTIÓN DE USUARIOS — ya no muestra PINs (Fase 4)
    // ════════════════════════════════════════════════════════════
    async mostrarGestionUsuarios() {
        this.vistaActual = 'usuarios';
        const panel = document.getElementById('panel-revision-respuesta');
        if (!panel) return;

        panel.className = "lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col";

        panel.innerHTML = `
            <div class="space-y-6">
                <div class="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div class="flex items-center space-x-3">
                        ${this._renderLogoBadge('sm')}
                        <div>
                            <h3 class="text-lg font-bold text-white">Gestión de Usuarios</h3>
                            <p class="text-xs text-slate-400">Resetea el PIN si un miembro lo olvida</p>
                        </div>
                    </div>
                    <button id="btn-volver-respuestas"
                        class="text-xs text-slate-400 hover:text-white transition flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-2 py-1">
                        <i data-lucide="arrow-left" class="w-4 h-4"></i>
                        Volver
                    </button>
                </div>

                <div class="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                    <p class="text-xs text-indigo-300 leading-relaxed flex gap-2">
                        <i data-lucide="shield-check" class="w-4 h-4 flex-shrink-0 mt-0.5"></i>
                        <span>Por seguridad, los PINs están cifrados y no se pueden ver. Si un miembro olvida el suyo, usa el botón <strong>Resetear</strong> y entrégale el PIN generado.</span>
                    </p>
                </div>

                <div class="space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto pr-2" id="lista-usuarios-admin"
                    role="region" aria-live="polite">
                    <div class="text-center py-8 text-slate-400">
                        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto"></div>
                        <p class="text-xs mt-2">Cargando usuarios...</p>
                    </div>
                </div>
            </div>`;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.getElementById('btn-volver-respuestas').onclick = () => {
            this.cargarRespuestas();
            this.mostrarPanelVacio();
        };

        try {
            const res = await fetch(`${API_CONFIG.BASE_URL}/pastor/usuarios`);
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const usuarios = await res.json();

            const lista = document.getElementById('lista-usuarios-admin');
            if (!lista) return;

            if (!usuarios || usuarios.length === 0) {
                lista.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay usuarios registrados.</p>`;
                return;
            }

            const miembros = usuarios.filter(u => u.rol === 'miembro').sort((a, b) => a.nombre.localeCompare(b.nombre));
            const pastores = usuarios.filter(u => u.rol === 'pastor').sort((a, b) => a.nombre.localeCompare(b.nombre));

            const renderUsuario = (u) => `
                <div class="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <div class="flex items-center space-x-3 min-w-0">
                        <div class="w-10 h-10 rounded-full ${u.rol === 'pastor' ? 'bg-rose-600/20 text-rose-400 border-rose-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'} flex items-center justify-center font-bold border flex-shrink-0">
                            ${this._escapeHtml(u.nombre.charAt(0).toUpperCase())}
                        </div>
                        <div class="min-w-0">
                            <h4 class="text-sm font-semibold text-white truncate">${this._escapeHtml(u.nombre)}</h4>
                            <span class="text-xs text-slate-400">#${u.id} · ${u.rol} · ${u.puntuacion_total || 0} pts</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3 flex-shrink-0">
                        <div class="text-right hidden sm:block">
                            <div class="text-[10px] uppercase text-slate-400 tracking-wider">PIN</div>
                            <div class="text-sm font-mono font-bold text-slate-500 tracking-widest">••••</div>
                        </div>
                        <button data-user-id="${u.id}" data-user-nombre="${this._escapeHtml(u.nombre)}"
                            class="btn-reset-pin p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-rose-500"
                            title="Generar nuevo PIN" aria-label="Resetear PIN">
                            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>`;

            lista.innerHTML = `
                ${pastores.length > 0 ? `
                    <div class="pt-1">
                        <h4 class="text-[11px] font-bold uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-2">
                            <i data-lucide="shield" class="w-3.5 h-3.5"></i>
                            Pastores (${pastores.length})
                        </h4>
                        <div class="space-y-2">${pastores.map(renderUsuario).join('')}</div>
                    </div>
                ` : ''}
                ${miembros.length > 0 ? `
                    <div class="pt-3">
                        <h4 class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                            <i data-lucide="users" class="w-3.5 h-3.5"></i>
                            Miembros (${miembros.length})
                        </h4>
                        <div class="space-y-2">${miembros.map(renderUsuario).join('')}</div>
                    </div>
                ` : ''}`;

            if (typeof lucide !== 'undefined') lucide.createIcons();

            document.querySelectorAll('.btn-reset-pin').forEach(btn => {
                btn.onclick = async () => {
                    const userId = btn.getAttribute('data-user-id');
                    const userNombre = btn.getAttribute('data-user-nombre');

                    if (!confirm(`¿Generar un nuevo PIN para ${userNombre}? El anterior dejará de funcionar.`)) return;

                    const htmlOriginal = btn.innerHTML;
                    btn.disabled = true;
                    btn.innerHTML = `<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>`;

                    try {
                        const res = await fetch(`${API_CONFIG.BASE_URL}/pastor/usuarios/${userId}/reset-pin`, { method: 'POST' });
                        const data = await res.json();

                        if (res.ok) {
                            const modal = document.createElement('div');
                            modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4';
                            modal.innerHTML = `
                                <div class="bg-slate-800 border border-indigo-500/40 rounded-2xl p-6 max-w-sm w-full space-y-4">
                                    <div class="text-center space-y-1">
                                        <div class="inline-flex p-3 bg-indigo-500/10 text-indigo-400 rounded-xl mb-1">
                                            <i data-lucide="key-round" class="w-7 h-7"></i>
                                        </div>
                                        <h3 class="text-lg font-bold text-white">PIN generado</h3>
                                        <p class="text-xs text-slate-400">Para: <strong class="text-slate-200">${this._escapeHtml(data.nombre)}</strong></p>
                                    </div>
                                    <div class="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center">
                                        <div class="text-4xl font-mono font-bold text-indigo-300 tracking-[0.4em]">${data.nuevo_pin}</div>
                                    </div>
                                    <p class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-center">
                                        Anótalo ahora. No se volverá a mostrar.
                                    </p>
                                    <button id="btn-cerrar-modal-pin"
                                        class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition">
                                        Entendido
                                    </button>
                                </div>`;
                            document.body.appendChild(modal);
                            if (typeof lucide !== 'undefined') lucide.createIcons();

                            document.getElementById('btn-cerrar-modal-pin').onclick = () => {
                                modal.remove();
                                this.mostrarGestionUsuarios();
                            };
                        } else {
                            this._mostrarAlerta('error', data.detail || 'Error al resetear el PIN.');
                            this._resetButton(btn, htmlOriginal);
                        }
                    } catch (e) {
                        console.error(e);
                        this._mostrarAlerta('error', 'Error de conexión con el servidor.');
                        this._resetButton(btn, htmlOriginal);
                    }
                };
            });

        } catch (e) {
            console.error("Error cargando usuarios admin:", e);
            const lista = document.getElementById('lista-usuarios-admin');
            if (lista) {
                lista.innerHTML = `
                    <div class="text-center py-6 border border-rose-500/20 bg-rose-500/5 rounded-xl">
                        <i data-lucide="alert-circle" class="w-6 h-6 mx-auto mb-2 text-rose-400"></i>
                        <p class="text-xs text-rose-300 mb-3">Error al cargar la lista de usuarios.</p>
                        <button id="btn-reintentar-usuarios"
                            class="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition">
                            <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                            Reintentar
                        </button>
                    </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                const btnRetry = document.getElementById('btn-reintentar-usuarios');
                if (btnRetry) btnRetry.onclick = () => this.mostrarGestionUsuarios();
            }
        }
    }
};