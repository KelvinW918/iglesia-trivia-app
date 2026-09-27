const MemberComponent = {
    async render(containerId, usuario) {
        const container = document.getElementById(containerId);

        // --- Bloqueo: pastores no responden devocionales como miembros ---
        if (usuario && usuario.rol === 'pastor') {
            container.innerHTML = `
                <div class="bg-slate-800/80 p-8 rounded-2xl border border-amber-500/30 text-center space-y-3">
                    <i data-lucide="shield-alert" class="w-10 h-10 text-amber-400 mx-auto"></i>
                    <h3 class="text-lg font-bold text-white">Acceso de Pastor</h3>
                    <p class="text-sm text-slate-400">Como pastor, no participas en los devocionales como miembro. Usa el Portal Pastoral para evaluar las respuestas.</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = `<div class="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/60 text-center text-slate-400">Cargando devocional...</div>`;

        try {
            const response = await ApiService.obtenerDevocionalActivo(usuario.id);
            const data = await response.json();

            if (!response.ok) {
                container.innerHTML = `
                    <div class="bg-slate-800/80 p-8 rounded-2xl border border-slate-700/60 text-center space-y-3">
                        <i data-lucide="calendar-off" class="w-10 h-10 text-amber-400 mx-auto"></i>
                        <h3 class="text-lg font-bold text-white">Sin Devocional Activo</h3>
                        <p class="text-sm text-slate-400">No hay un devocional disponible en este momento.</p>
                    </div>`;
                lucide.createIcons();
                return;
            }

            if (data.ya_respondido) {
                await this.renderDevocionalCompletado(container, usuario, data.devocional_id, data.titulo);
                return;
            }

            let preguntasHtml = data.preguntas.map((q, idx) => `
                <div class="bg-slate-900/50 border border-slate-700/50 p-5 rounded-xl space-y-3">
                    <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Pregunta ${idx + 1}</span>
                    <p class="text-sm font-medium text-white">${q.enunciado}</p>
                    ${q.tipo === 'seleccion_simple' ?
                    q.opciones.map(op => `
                            <label class="flex items-center space-x-3 text-sm text-slate-300 bg-slate-800/80 p-3 rounded-lg border border-slate-700/60 cursor-pointer hover:border-indigo-500 transition">
                                <input type="radio" name="q_${q.id}" value="${op}" class="text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700">
                                <span>${op}</span>
                            </label>
                        `).join('')
                    :
                    `<textarea id="resp_${q.id}" rows="3" placeholder="Escribe tu reflexión..." class="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>`
                }
                </div>
            `).join('');

            container.innerHTML = `
                <div class="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 space-y-6 shadow-xl">
                    <div class="space-y-2">
                        <span class="text-xs font-semibold text-indigo-400 tracking-wider uppercase">Devocional Diario</span>
                        <h2 class="text-xl font-bold text-white">${data.titulo}</h2>
                        <a href="${data.resumen_ia.split(': ')[1] || '#'}" target="_blank" class="inline-flex items-center space-x-2 text-indigo-400 hover:text-indigo-300 text-sm font-medium pt-1">
                            <i data-lucide="youtube" class="w-4 h-4 text-rose-500"></i>
                            <span>Ver video oficial en YouTube</span>
                        </a>
                    </div>

                    <form id="form-devocional" class="space-y-4">
                        ${preguntasHtml}
                        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2">
                            <i data-lucide="send" class="w-4 h-4"></i>
                            <span>Enviar Respuestas</span>
                        </button>
                    </form>
                </div>
            `;
            lucide.createIcons();

            document.getElementById('form-devocional').onsubmit = async (e) => {
                e.preventDefault();
                let respuestas = [];
                for (let q of data.preguntas) {
                    let val = "";
                    if (q.tipo === 'seleccion_simple') {
                        const sel = document.querySelector(`input[name="q_${q.id}"]:checked`);
                        val = sel ? sel.value : "";
                    } else {
                        const txt = document.getElementById(`resp_${q.id}`);
                        val = txt ? txt.value : "";
                    }
                    if (!val) return alert("Por favor responde todas las preguntas.");
                    respuestas.push({ question_id: q.id, respuesta_texto: val });
                }

                // Ajustado acorde al endpoint POST /respuestas de FastAPI que recibe user_id y respuestas directamente en el body JSON
                const res = await ApiService.enviarRespuestas({ user_id: usuario.id, respuestas });

                // Verificamos si la respuesta del ApiService fue exitosa (manejando fetch nativo o wrapper)
                const resOk = res.ok !== undefined ? res.ok : true;
                if (resOk) {
                    alert("¡Enviado correctamente!");
                    MemberComponent.render(containerId, usuario);
                } else {
                    // Intentar leer el detalle del error del backend (ej. 403 si es pastor)
                    let detalle = "Error al enviar las respuestas.";
                    try {
                        const errData = await res.json();
                        if (errData && errData.detail) detalle = errData.detail;
                    } catch (_) { /* ignorar */ }
                    alert(detalle);
                }
            };

        } catch (e) {
            container.innerHTML = `<div class="text-rose-400 text-center">Error al cargar el contenido.</div>`;
        }
    },

    // --- Nueva vista: devocional completado + feedback pastoral por pregunta ---
    async renderDevocionalCompletado(container, usuario, devocionalId, titulo) {
        container.innerHTML = `
            <div class="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/60 text-center space-y-3">
                <i data-lucide="loader-2" class="w-7 h-7 animate-spin text-indigo-500 mx-auto"></i>
                <p class="text-sm text-slate-400">Cargando tu feedback pastoral...</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        let detalle;
        try {
            detalle = await ApiService.obtenerRespuestasMiembro(usuario.id, devocionalId);
        } catch (err) {
            container.innerHTML = `
                <div class="bg-slate-800/80 p-6 rounded-2xl border border-rose-500/30 text-center space-y-2">
                    <i data-lucide="alert-circle" class="w-8 h-8 text-rose-400 mx-auto"></i>
                    <p class="text-sm text-rose-300">No se pudo cargar tu feedback: ${err.message}</p>
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
                        <p class="text-sm text-slate-200 leading-relaxed">${item.feedback_pastor}</p>
                    </div>`;
            } else if (item.estado === 'pendiente') {
                feedbackHtml = `
                    <div class="mt-3 p-3 bg-slate-800/50 border border-slate-700/60 rounded-lg">
                        <p class="text-xs text-slate-500 italic">Aún sin comentario del pastor. Tu respuesta está en revisión.</p>
                    </div>`;
            } else {
                feedbackHtml = `
                    <div class="mt-3 p-3 bg-slate-800/50 border border-slate-700/60 rounded-lg">
                        <p class="text-xs text-slate-500 italic">Sin comentario adicional del pastor.</p>
                    </div>`;
            }

            return `
                <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div class="flex items-start justify-between gap-3">
                        <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Pregunta ${item.orden}</span>
                        ${estadoBadge}
                    </div>
                    <p class="text-sm font-medium text-slate-200">${item.pregunta_texto}</p>
                    <div class="p-3 bg-slate-900 rounded-lg text-sm text-slate-300 border border-slate-800/60 leading-relaxed italic">
                        "${item.respuesta_texto || 'Sin respuesta'}"
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
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 space-y-6 shadow-xl">
                <!-- Encabezado del devocional -->
                <div class="space-y-3 pb-4 border-b border-slate-700/60">
                    <div class="flex items-center gap-3">
                        <div class="inline-flex p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                            <i data-lucide="check-circle-2" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-white">¡Devocional completado!</h3>
                            <p class="text-xs text-slate-400">${titulo}</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 pt-1">
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
                <div class="space-y-4">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <i data-lucide="list-checks" class="w-4 h-4 text-indigo-400"></i>
                        Detalle de tus respuestas y feedback pastoral
                    </h4>
                    ${respuestasHtml}
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};