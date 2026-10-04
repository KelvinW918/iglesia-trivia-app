const MemberComponent = {

    // ════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════

    _mostrarAlerta(container, tipo, mensaje) {
        this._limpiarAlerta(container);

        const estilos = {
            error: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
            exito: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
            info: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
        };
        const iconos = { error: 'alert-circle', exito: 'check-circle-2', info: 'info' };

        const alerta = document.createElement('div');
        alerta.id = 'member-alerta';
        alerta.setAttribute('role', 'alert');
        alerta.setAttribute('aria-live', 'assertive');
        alerta.className = `flex items-start gap-3 p-3 rounded-xl border text-sm ${estilos[tipo] || estilos.error}`;
        alerta.innerHTML = `
            <i data-lucide="${iconos[tipo] || 'alert-circle'}" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
            <span class="flex-1">${mensaje}</span>
        `;

        const form = container.querySelector('form');
        if (form && form.parentNode) {
            form.parentNode.insertBefore(alerta, form);
        } else {
            container.prepend(alerta);
        }

        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            const el = document.getElementById('member-alerta');
            if (el) el.remove();
        }, 8000);
    },

    _limpiarAlerta(container) {
        const el = document.getElementById('member-alerta');
        if (el) el.remove();
    },

    _setLoading(btn, texto = 'Enviando...') {
        if (!btn) return null;
        const htmlOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('opacity-70', 'cursor-not-allowed');
        btn.innerHTML = `
            <svg class="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span>${texto}</span>
        `;
        return htmlOriginal;
    },

    _resetButton(btn, htmlOriginal) {
        if (!btn || !htmlOriginal) return;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        btn.innerHTML = htmlOriginal;
        if (window.lucide) lucide.createIcons();
    },

    /**
     * Extrae la URL del video del campo resumen_ia usando regex.
     * Retorna null si no encuentra URL.
     */
    _extraerUrlVideo(resumenIa) {
        if (!resumenIa || typeof resumenIa !== 'string') return null;
        const match = resumenIa.match(/https?:\/\/[^\s]+/);
        return match ? match[0] : null;
    },

    /**
     * Escapa HTML para prevenir XSS en contenido del backend.
     */
    _escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * Badge circular reutilizable con el logo CCRF.
     * size: 'sm' | 'md' | 'lg'
     */
    _renderLogoBadge(size = 'md') {
        const sizes = {
            sm: { box: 'w-12 h-12', padding: 'p-1', radius: 'rounded-xl' },
            md: { box: 'w-16 h-16', padding: 'p-1.5', radius: 'rounded-2xl' },
            lg: { box: 'w-24 h-24', padding: 'p-2', radius: 'rounded-2xl' },
        };
        const s = sizes[size] || sizes.md;
        return `
            <div class="inline-flex items-center justify-center ${s.box} ${s.radius} bg-white shadow-lg shadow-indigo-500/15 border border-slate-200 overflow-hidden">
                <img src="./img/logo_blanco.png"
                     alt="CCRF Jehová Justicia Nuestra"
                     class="w-full h-full object-contain ${s.padding}">
            </div>
        `;
    },

    // ════════════════════════════════════════════════════════════
    // RENDER PRINCIPAL
    // ════════════════════════════════════════════════════════════
    async render(containerId, usuario) {
        const container = document.getElementById(containerId);

        // ─── Bloqueo: pastores no responden devocionales como miembros ───
        if (usuario && usuario.rol === 'pastor') {
            container.innerHTML = `
                <div class="bg-slate-800/80 p-8 rounded-2xl border border-amber-500/30 text-center space-y-4">
                    ${this._renderLogoBadge('md')}
                    <div class="space-y-2">
                        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
                            <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-amber-400"></i>
                            <span class="text-[11px] font-bold uppercase tracking-wider text-amber-400">Acceso de Pastor</span>
                        </div>
                        <h3 class="text-lg font-bold text-white">Bienvenido, pastor</h3>
                        <p class="text-sm text-slate-300 leading-relaxed">
                            Como pastor, no participas en los devocionales como miembro.
                            Usa el Portal Pastoral para evaluar las respuestas de la comunidad.
                        </p>
                    </div>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // ─── Estado de carga ───
        container.innerHTML = `
            <div class="bg-slate-800/80 p-8 rounded-2xl border border-slate-700/60 text-center space-y-4" role="status" aria-live="polite">
                ${this._renderLogoBadge('md')}
                <div class="space-y-3">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
                    <p class="text-sm text-slate-400">Cargando devocional del día...</p>
                </div>
            </div>`;

        let response;
        let data;
        try {
            response = await ApiService.obtenerDevocionalActivo(usuario.id);
            data = await response.json().catch(() => ({}));
        } catch (networkError) {
            console.error('[MemberComponent] Error de red:', networkError);
            return this._renderError(
                container, usuario,
                'No pudimos conectar con el servidor. Verifica tu conexión a internet e intenta de nuevo.'
            );
        }

        // ─── 404: no hay devocional hoy (caso NORMAL, no error) ───
        if (response.status === 404) {
            return this._renderSinDevocional(container, usuario);
        }

        // ─── Otro error del servidor ───
        if (!response.ok) {
            const msg = data.detail || `Error del servidor (${response.status}).`;
            return this._renderError(container, usuario, msg);
        }

        // ─── Ya respondió: mostrar feedback pastoral ───
        if (data.ya_respondido) {
            await this.renderDevocionalCompletado(container, usuario, data.devocional_id, data.titulo);
            return;
        }

        // ─── Renderizar formulario del devocional del día ───
        this._renderFormulario(container, usuario, data);
    },

    // ════════════════════════════════════════════════════════════
    // VISTA: SIN DEVOCIONAL HOY
    // ════════════════════════════════════════════════════════════
    _renderSinDevocional(container, usuario) {
        container.innerHTML = `
            <div class="bg-slate-800/80 p-8 rounded-2xl border border-amber-500/30 text-center space-y-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/0 via-amber-500/60 to-amber-500/0"></div>

                ${this._renderLogoBadge('lg')}

                <div class="space-y-2">
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
                        <i data-lucide="calendar-clock" class="w-3.5 h-3.5 text-amber-400"></i>
                        <span class="text-[11px] font-bold uppercase tracking-wider text-amber-400">Próximamente</span>
                    </div>
                    <h3 class="text-lg font-bold text-white">Aún no está listo el devocional de hoy</h3>
                    <p class="text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">
                        El devocional se publica cuando el pastor lo sube a YouTube.
                        Suele estar disponible en la mañana.
                    </p>
                    <p class="text-xs text-slate-400 italic">Vuelve a intentar más tarde o mañana temprano.</p>
                </div>

                <button id="btn-recargar-devocional"
                    class="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-600/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800">
                    <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    <span>Buscar de nuevo</span>
                </button>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const btn = document.getElementById('btn-recargar-devocional');
        if (btn) {
            btn.onclick = () => {
                const cid = container.id;
                MemberComponent.render(cid, usuario);
            };
        }
    },

    // ════════════════════════════════════════════════════════════
    // VISTA: ERROR (servidor o red)
    // ════════════════════════════════════════════════════════════
    _renderError(container, usuario, mensaje) {
        container.innerHTML = `
            <div class="bg-slate-800/80 p-8 rounded-2xl border border-rose-500/30 text-center space-y-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500/0 via-rose-500/60 to-rose-500/0"></div>

                ${this._renderLogoBadge('lg')}

                <div class="space-y-2">
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30">
                        <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-400"></i>
                        <span class="text-[11px] font-bold uppercase tracking-wider text-rose-400">Error de conexión</span>
                    </div>
                    <h3 class="text-lg font-bold text-white">No pudimos cargar el devocional</h3>
                    <p class="text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">${this._escapeHtml(mensaje)}</p>
                </div>

                <button id="btn-reintentar-devocional"
                    class="inline-flex items-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl transition shadow-lg shadow-rose-600/20 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-slate-800">
                    <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    <span>Reintentar</span>
                </button>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const btn = document.getElementById('btn-reintentar-devocional');
        if (btn) {
            btn.onclick = () => {
                const cid = container.id;
                MemberComponent.render(cid, usuario);
            };
        }
    },

    // ════════════════════════════════════════════════════════════
    // FORMULARIO DEL DEVOCIONAL DEL DÍA
    // ════════════════════════════════════════════════════════════
    _renderFormulario(container, usuario, data) {
        const videoUrl = this._extraerUrlVideo(data.resumen_ia);

        // Generar HTML por pregunta según su tipo
        let preguntasHtml = data.preguntas.map((q, idx) => {
            const enunciado = this._escapeHtml(q.enunciado);
            let inputHtml = '';

            if (q.tipo === 'seleccion_simple') {
                // Radios (solo una opción)
                inputHtml = q.opciones.map(op => `
                    <label class="flex items-start space-x-3 text-sm text-slate-200 bg-slate-800/80 p-3 rounded-lg border border-slate-700/60 cursor-pointer hover:border-indigo-500 transition">
                        <input type="radio" name="q_${q.id}" value="${this._escapeHtml(op)}" required
                            class="mt-0.5 text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700">
                        <span>${this._escapeHtml(op)}</span>
                    </label>
                `).join('');

            } else if (q.tipo === 'seleccion_multiple') {
                // Checkboxes para selección múltiple
                inputHtml = `
                    <p class="text-xs text-slate-400 italic mb-2">Puedes marcar varias opciones.</p>
                    ${q.opciones.map(op => `
                        <label class="flex items-start space-x-3 text-sm text-slate-200 bg-slate-800/80 p-3 rounded-lg border border-slate-700/60 cursor-pointer hover:border-indigo-500 transition">
                            <input type="checkbox" name="q_${q.id}" value="${this._escapeHtml(op)}"
                                class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700">
                            <span>${this._escapeHtml(op)}</span>
                        </label>
                    `).join('')}
                `;

            } else {
                // Desarrollo
                inputHtml = `
                    <textarea id="resp_${q.id}" rows="4" required
                        placeholder="Escribe tu reflexión..."
                        class="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
                `;
            }

            return `
                <div class="bg-slate-900/50 border border-slate-700/50 p-5 rounded-xl space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Pregunta ${idx + 1}</span>
                        <span class="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                            ${q.tipo === 'seleccion_simple' ? 'Opción única'
                    : q.tipo === 'seleccion_multiple' ? 'Opción múltiple'
                        : 'Reflexión'}
                        </span>
                    </div>
                    <p class="text-sm font-medium text-white leading-relaxed">${enunciado}</p>
                    <div class="space-y-2">${inputHtml}</div>
                </div>`;
        }).join('');

        const linkVideoHtml = videoUrl ? `
            <a href="${videoUrl}" target="_blank" rel="noopener noreferrer"
                class="inline-flex items-center space-x-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-rose-500">
                <i data-lucide="youtube" class="w-4 h-4 text-rose-400"></i>
                <span>Ver video oficial</span>
                <i data-lucide="external-link" class="w-3.5 h-3.5 opacity-60"></i>
            </a>
        ` : '';

        container.innerHTML = `
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
                <!-- Header con logo + título -->
                <div class="p-5 border-b border-slate-700/60 bg-gradient-to-br from-slate-800/90 to-slate-900/80">
                    <div class="flex items-start gap-4">
                        ${this._renderLogoBadge('sm')}
                        <div class="min-w-0 flex-1 space-y-2">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-400">Devocional Diario</span>
                                <span class="w-1 h-1 rounded-full bg-slate-600"></span>
                                <span class="text-[10px] uppercase tracking-wider text-slate-400">Hoy</span>
                            </div>
                            <h2 class="text-lg sm:text-xl font-bold text-white leading-snug">${this._escapeHtml(data.titulo)}</h2>
                            <div>${linkVideoHtml}</div>
                        </div>
                    </div>
                </div>

                <!-- Formulario -->
                <form id="form-devocional" class="p-5 sm:p-6 space-y-4" novalidate>
                    ${preguntasHtml}

                    <div class="pt-2 space-y-3">
                        <button type="submit" id="btn-enviar-respuestas"
                            class="btn-shine w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600 text-white font-semibold py-3.5 rounded-xl transition shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800">
                            <i data-lucide="send" class="w-4 h-4"></i>
                            <span>Enviar Respuestas</span>
                        </button>
                        <p class="text-xs text-slate-400 text-center">
                            Una vez enviadas, no podrás modificar tus respuestas.
                        </p>
                    </div>
                </form>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // ─── Handler de envío ───
        document.getElementById('form-devocional').onsubmit = async (e) => {
            e.preventDefault();
            this._limpiarAlerta(container);

            // Recopilar respuestas
            const respuestas = [];
            for (const q of data.preguntas) {
                let val = '';

                if (q.tipo === 'seleccion_simple') {
                    const sel = document.querySelector(`input[name="q_${q.id}"]:checked`);
                    val = sel ? sel.value : '';

                } else if (q.tipo === 'seleccion_multiple') {
                    const checked = document.querySelectorAll(`input[name="q_${q.id}"]:checked`);
                    val = Array.from(checked).map(el => el.value).join(', ');

                } else {
                    const txt = document.getElementById(`resp_${q.id}`);
                    val = txt ? txt.value.trim() : '';
                }

                if (!val) {
                    const nombreTipo = q.tipo === 'seleccion_multiple'
                        ? 'marca al menos una opción'
                        : 'responde';
                    this._mostrarAlerta(container, 'error',
                        `Pregunta ${data.preguntas.indexOf(q) + 1}: ${nombreTipo}.`);
                    // Scroll hacia la pregunta
                    const el = document.querySelector(`[name="q_${q.id}"], #resp_${q.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }

                respuestas.push({ question_id: q.id, respuesta_texto: val });
            }

            // Confirmación (envío one-shot)
            const ok = confirm(`¿Confirmas el envío de tus ${respuestas.length} respuestas? Una vez enviadas no podrás modificarlas.`);
            if (!ok) return;

            const btn = document.getElementById('btn-enviar-respuestas');
            const htmlOriginal = this._setLoading(btn, 'Enviando...');

            // ─── Submit con su PROPIO try/catch (no contamina el outer) ───
            try {
                const res = await ApiService.enviarRespuestas({
                    user_id: usuario.id,
                    respuestas: respuestas
                });

                if (res.ok) {
                    this._mostrarAlerta(container, 'exito', '¡Respuestas enviadas! Cargando tu resumen...');
                    // Pequeño delay para que se vea el mensaje antes de re-renderizar
                    setTimeout(() => {
                        MemberComponent.render(container.id, usuario);
                    }, 1200);
                } else {
                    let detalle = 'No se pudieron enviar las respuestas.';
                    try {
                        const errData = await res.json();
                        if (errData && errData.detail) detalle = errData.detail;
                    } catch (_) { /* ignorar */ }
                    this._mostrarAlerta(container, 'error', detalle);
                    this._resetButton(btn, htmlOriginal);
                }
            } catch (networkError) {
                console.error('[MemberComponent] Error enviando:', networkError);
                this._mostrarAlerta(container, 'error',
                    'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo. Tus respuestas se conservan abajo.');
                this._resetButton(btn, htmlOriginal);
                // ⚠️ NO re-renderizamos → las respuestas del hermano se conservan
            }
        };
    },

    // ════════════════════════════════════════════════════════════
    // VISTA: DEVOCIONAL COMPLETADO + FEEDBACK PASTORAL
    // ════════════════════════════════════════════════════════════
    async renderDevocionalCompletado(container, usuario, devocionalId, titulo) {
        container.innerHTML = `
            <div class="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/60 text-center space-y-4" role="status" aria-live="polite">
                ${this._renderLogoBadge('md')}
                <div class="space-y-3">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
                    <p class="text-sm text-slate-400">Cargando tu feedback pastoral...</p>
                </div>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        let detalle;
        try {
            detalle = await ApiService.obtenerRespuestasMiembro(usuario.id, devocionalId);
        } catch (err) {
            container.innerHTML = `
                <div class="bg-slate-800/80 p-6 rounded-2xl border border-rose-500/30 text-center space-y-3">
                    <i data-lucide="alert-circle" class="w-8 h-8 text-rose-400 mx-auto"></i>
                    <p class="text-sm text-rose-300">No se pudo cargar tu feedback: ${this._escapeHtml(err.message)}</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const r = detalle.resumen;
        const hayFeedbackPendiente = r.pendientes > 0;

        const respuestasHtml = detalle.respuestas.map(item => {
            let estadoBadge = '';
            let feedbackHtml = '';

            if (item.estado === 'aprobada') {
                estadoBadge = `
                    <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <i data-lucide="check-circle-2" class="w-3 h-3"></i>
                        Correcto · +${item.puntos_otorgados} pts
                    </span>`;
            } else if (item.estado === 'rechazada') {
                estadoBadge = `
                    <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <i data-lucide="x-circle" class="w-3 h-3"></i>
                        A mejorar
                    </span>`;
            } else if (item.estado === 'pendiente') {
                estadoBadge = `
                    <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <i data-lucide="clock" class="w-3 h-3"></i>
                        Pendiente de revisión
                    </span>`;
            } else {
                estadoBadge = `
                    <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-700/50 text-slate-400 border border-slate-700">
                        Sin responder
                    </span>`;
            }

            if (item.feedback_pastor) {
                feedbackHtml = `
                    <div class="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg space-y-1">
                        <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                            <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
                            Comentario del Pastor
                        </div>
                        <p class="text-sm text-slate-200 leading-relaxed">${this._escapeHtml(item.feedback_pastor)}</p>
                    </div>`;
            } else if (item.estado === 'pendiente') {
                feedbackHtml = `
                    <div class="mt-3 p-3 bg-slate-800/50 border border-slate-700/60 rounded-lg">
                        <p class="text-xs text-slate-400 italic">Aún sin comentario del pastor. Tu respuesta está en revisión.</p>
                    </div>`;
            } else {
                feedbackHtml = `
                    <div class="mt-3 p-3 bg-slate-800/50 border border-slate-700/60 rounded-lg">
                        <p class="text-xs text-slate-400 italic">Sin comentario adicional del pastor.</p>
                    </div>`;
            }

            return `
                <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div class="flex items-start justify-between gap-3">
                        <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Pregunta ${item.orden}</span>
                        ${estadoBadge}
                    </div>
                    <p class="text-sm font-medium text-slate-200">${this._escapeHtml(item.pregunta_texto)}</p>
                    <div class="p-3 bg-slate-900 rounded-lg text-sm text-slate-300 border border-slate-800/60 leading-relaxed italic">
                        "${this._escapeHtml(item.respuesta_texto || 'Sin respuesta')}"
                    </div>
                    ${feedbackHtml}
                </div>`;
        }).join('');

        const resumenBadge = hayFeedbackPendiente
            ? `<span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                    ${r.pendientes} pendiente(s) de revisión
                </span>`
            : `<span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>
                    Todo revisado
                </span>`;

        container.innerHTML = `
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
                <!-- Header con logo -->
                <div class="p-5 border-b border-slate-700/60 bg-gradient-to-br from-emerald-900/20 to-slate-900/80">
                    <div class="flex items-start gap-4">
                        ${this._renderLogoBadge('sm')}
                        <div class="min-w-0 flex-1 space-y-2">
                            <div class="flex items-center gap-2">
                                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                                    <i data-lucide="check-circle-2" class="w-3 h-3 text-emerald-400"></i>
                                    <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Completado</span>
                                </span>
                            </div>
                            <h3 class="text-lg font-bold text-white">¡Devocional completado!</h3>
                            <p class="text-xs text-slate-400 leading-snug">${this._escapeHtml(titulo)}</p>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 pt-3">
                        <span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                            <i data-lucide="award" class="w-3.5 h-3.5"></i>
                            ${r.puntos_totales} pts este devocional
                        </span>
                        <span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            ${r.aprobadas}/${r.total_preguntas} correctas
                        </span>
                        ${resumenBadge}
                    </div>
                </div>

                <!-- Detalle pregunta por pregunta -->
                <div class="p-5 sm:p-6 space-y-4">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <i data-lucide="list-checks" class="w-4 h-4 text-indigo-400"></i>
                        Tus respuestas y feedback pastoral
                    </h4>
                    ${respuestasHtml}
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};