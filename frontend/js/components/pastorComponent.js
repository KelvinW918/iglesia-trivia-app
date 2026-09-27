const PastorComponent = {
    render(containerId, usuarioActual, onLogout) {
        this.containerId = containerId;
        this.usuarioActual = usuarioActual || { nombre: 'Pastor', id: 1 };
        this.onLogout = onLogout;

        this.respuestasPendientes = [];
        this.usuarioSeleccionado = null;
        this.vistaActual = 'respuestas'; // 'respuestas' | 'usuarios'

        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
                <!-- Header Pastor -->
                <header class="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-md">
                    <div class="flex items-center space-x-3">
                        <div class="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg">
                            <i data-lucide="book-open" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <h1 class="text-xl font-bold tracking-tight text-white">Devocionales Iglesia</h1>
                            <span class="inline-block text-[10px] font-semibold uppercase px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/30">
                                PASTOR / EVALUADOR
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center space-x-4">
                        <span class="text-sm font-medium text-slate-300">Hola, <strong class="text-white">${this.usuarioActual.nombre}</strong></span>
                        <button id="btn-logout-pastor" title="Cerrar Sesión" class="p-2 text-slate-400 hover:text-rose-400 transition hover:bg-slate-800 rounded-lg">
                            <i data-lucide="log-out" class="w-5 h-5"></i>
                        </button>
                    </div>
                </header>

                <!-- Panel Principal -->
                <main class="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <!-- Lista de Miembros con Respuestas -->
                    <div class="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-xl">
                        <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                            <h2 class="text-base font-semibold text-white flex items-center gap-2">
                                <i data-lucide="users" class="w-5 h-5 text-indigo-400"></i>
                                Respuestas Recibidas
                            </h2>
                            <div class="flex items-center gap-1">
                                <button id="btn-gestion-usuarios" title="Gestión de usuarios" class="p-1.5 text-slate-400 hover:text-indigo-400 transition hover:bg-slate-800 rounded-lg">
                                    <i data-lucide="user-cog" class="w-4 h-4"></i>
                                </button>
                                <button id="btn-recargar-respuestas" title="Recargar respuestas" class="p-1.5 text-slate-400 hover:text-white transition hover:bg-slate-800 rounded-lg">
                                    <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>

                        <div id="lista-usuarios-respuestas" class="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
                            <div class="text-center py-10 text-slate-500">
                                <i data-lucide="loader-2" class="w-7 h-7 animate-spin mx-auto mb-2 text-indigo-500"></i>
                                <p class="text-xs">Cargando respuestas...</p>
                            </div>
                        </div>
                    </div>

                    <!-- Visualizador y Evaluación -->
                    <div id="panel-revision-respuesta" class="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-center items-center">
                        <div class="text-center max-w-sm space-y-3 py-16 text-slate-500">
                            <div class="inline-flex p-4 bg-slate-800/80 rounded-2xl text-slate-400 mb-2">
                                <i data-lucide="file-text" class="w-10 h-10"></i>
                            </div>
                            <h3 class="text-lg font-semibold text-slate-300">Selecciona un Miembro</h3>
                            <p class="text-xs text-slate-400 leading-relaxed">Haz clic en un miembro de la lista izquierda para revisar sus respuestas del devocional y enviar tu retroalimentación.</p>
                        </div>
                    </div>
                </main>
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Handlers del header
        const btnLogout = document.getElementById('btn-logout-pastor');
        if (btnLogout) {
            btnLogout.onclick = () => {
                if (typeof this.onLogout === 'function') this.onLogout();
            };
        }

        const btnRecargar = document.getElementById('btn-recargar-respuestas');
        if (btnRecargar) {
            btnRecargar.onclick = () => {
                if (this.vistaActual === 'usuarios') {
                    this.mostrarGestionUsuarios();
                } else {
                    this.cargarRespuestas();
                }
            };
        }

        const btnGestion = document.getElementById('btn-gestion-usuarios');
        if (btnGestion) {
            btnGestion.onclick = () => this.mostrarGestionUsuarios();
        }

        this.cargarRespuestas();
    },

    async cargarRespuestas() {
        this.vistaActual = 'respuestas';
        const contenedorLista = document.getElementById('lista-usuarios-respuestas');
        if (!contenedorLista) return;

        try {
            let data = await ApiService.obtenerRespuestasPendientes();
            console.log("Datos obtenidos de la API:", data);

            if (data && !Array.isArray(data) && data.respuestas) {
                data = data.respuestas;
            } else if (!Array.isArray(data)) {
                data = [];
            }

            this.respuestasPendientes = data;

            if (this.respuestasPendientes.length === 0) {
                contenedorLista.innerHTML = `
                    <div class="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl">
                        <i data-lucide="check-circle-2" class="w-10 h-10 text-emerald-500/60 mx-auto mb-2"></i>
                        <p class="text-sm font-medium text-slate-300">¡Sin entregas pendientes!</p>
                        <p class="text-xs text-slate-500 mt-1">No hay respuestas de miembros pendientes de revisión.</p>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                this.mostrarPanelVacio();
                return;
            }

            // Agrupar respuestas por miembro
            const usuariosMap = new Map();
            this.respuestasPendientes.forEach(item => {
                const userId = item.user_id || item.usuario_id || (item.usuario ? item.usuario.id : null) || item.id_usuario;
                const nombre = item.nombre_usuario || item.nombre || (item.usuario ? item.usuario.nombre : null) || item.usuario_nombre || 'Miembro';

                if (userId && !usuariosMap.has(userId)) {
                    usuariosMap.set(userId, {
                        userId: userId,
                        nombre: nombre,
                        respuestas: []
                    });
                }

                if (userId) {
                    usuariosMap.get(userId).respuestas.push(item);
                }
            });

            const usuariosLista = Array.from(usuariosMap.values());

            contenedorLista.innerHTML = usuariosLista.map(u => `
                <div data-userid="${u.userId}" class="item-usuario-respuesta p-4 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-xl cursor-pointer transition flex items-center justify-between group">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold border border-indigo-500/20 group-hover:bg-indigo-600 group-hover:text-white transition">
                            ${u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h4 class="text-sm font-semibold text-white group-hover:text-indigo-400 transition">${u.nombre}</h4>
                            <span class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <i data-lucide="file-question" class="w-3.5 h-3.5 text-slate-500"></i>
                                ${u.respuestas.length} respuesta(s)
                            </span>
                        </div>
                    </div>
                    <i data-lucide="chevron-right" class="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition"></i>
                </div>
            `).join('');

            if (typeof lucide !== 'undefined') lucide.createIcons();

            document.querySelectorAll('.item-usuario-respuesta').forEach(elem => {
                elem.onclick = () => {
                    const userId = elem.getAttribute('data-userid');
                    const usuarioSeleccionado = usuariosLista.find(u => String(u.userId) === String(userId));

                    document.querySelectorAll('.item-usuario-respuesta').forEach(i => i.classList.remove('border-indigo-500', 'bg-slate-900'));
                    elem.classList.add('border-indigo-500', 'bg-slate-900');

                    this.mostrarDetalleUsuario(usuarioSeleccionado);
                };
            });

        } catch (error) {
            console.error("Error cargando respuestas:", error);
            contenedorLista.innerHTML = `
                <div class="text-center py-8 px-4 border border-rose-500/20 bg-rose-500/5 rounded-xl text-rose-300">
                    <i data-lucide="alert-circle" class="w-7 h-7 mx-auto mb-2 text-rose-400"></i>
                    <p class="text-xs font-medium">Error al cargar la lista</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    },

    mostrarPanelVacio() {
        const panel = document.getElementById('panel-revision-respuesta');
        if (!panel) return;
        panel.className = "lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-center items-center";
        panel.innerHTML = `
            <div class="text-center max-w-sm space-y-3 py-16 text-slate-500">
                <div class="inline-flex p-4 bg-slate-800/80 rounded-2xl text-slate-400 mb-2">
                    <i data-lucide="file-text" class="w-10 h-10"></i>
                </div>
                <h3 class="text-lg font-semibold text-slate-300">Selecciona un Miembro</h3>
                <p class="text-xs text-slate-400 leading-relaxed">Haz clic en un miembro de la lista izquierda para revisar sus respuestas del devocional y enviar tu retroalimentación.</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    mostrarDetalleUsuario(usuarioData) {
        this.usuarioSeleccionado = usuarioData;
        const panel = document.getElementById('panel-revision-respuesta');
        if (!panel) return;

        panel.className = "lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col";

        panel.innerHTML = `
            <div class="space-y-6">
                <!-- Encabezado Miembro -->
                <div class="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div class="flex items-center space-x-3">
                        <div class="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-indigo-600/20">
                            ${usuarioData.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-white">${usuarioData.nombre}</h3>
                            <p class="text-xs text-slate-400">Revisión de respuestas enviadas</p>
                        </div>
                    </div>
                    <span class="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
                        ${usuarioData.respuestas.length} Pregunta(s)
                    </span>
                </div>

                <!-- Lista de Respuestas (cada una con su propia evaluación) -->
                <div class="space-y-5 max-h-[calc(100vh-260px)] overflow-y-auto pr-2">
                    ${usuarioData.respuestas.map((r, index) => this._renderRespuestaEvaluable(r, index)).join('')}
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Enganchar handlers de cada respuesta
        usuarioData.respuestas.forEach((r, index) => {
            this._bindRespuestaHandlers(r, index);
        });
    },

    // Renderiza UNA respuesta con sus propios controles de evaluación
    _renderRespuestaEvaluable(r, index) {
        const textoPregunta = r.pregunta_texto || r.enunciado || r.pregunta || r.texto_pregunta || `Pregunta #${index + 1}`;
        const textoRespuesta = r.respuesta_texto || r.respuesta_enviada || r.respuesta || r.texto_respuesta || 'Sin respuesta grabada';
        const tipo = r.tipo_pregunta || r.tipo || 'desarrollo';
        const answerId = r.answer_id || r.id;

        return `
            <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3" data-answer-id="${answerId}">
                <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                        Pregunta #${index + 1}
                    </span>
                    <span class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        ${tipo.replace('_', ' ')}
                    </span>
                </div>

                <p class="text-sm font-medium text-slate-200">${textoPregunta}</p>

                <div class="p-3 bg-slate-900 rounded-lg text-sm text-slate-300 border border-slate-800/60 leading-relaxed italic">
                    "${textoRespuesta}"
                </div>

                <!-- Controles de evaluación individuales -->
                <div class="grid grid-cols-2 gap-2 pt-1">
                    <button type="button"
                        data-action="correcto"
                        data-index="${index}"
                        class="btn-dictamen py-2 px-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition hover:border-emerald-500/50">
                        <i data-lucide="check-circle-2" class="w-4 h-4"></i>
                        <span>Correcto</span>
                    </button>
                    <button type="button"
                        data-action="incorrecto"
                        data-index="${index}"
                        class="btn-dictamen py-2 px-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition hover:border-rose-500/50">
                        <i data-lucide="x-circle" class="w-4 h-4"></i>
                        <span>Incorrecto</span>
                    </button>
                </div>

                <div>
                    <label class="block text-[11px] text-slate-400 mb-1 font-medium">Comentario de Feedback:</label>
                    <textarea data-role="feedback-${index}" rows="2"
                        placeholder="Observaciones o palabras de edificación..."
                        class="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                </div>

                <button type="button"
                    data-action="enviar"
                    data-index="${index}"
                    class="btn-enviar-evaluacion w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 text-xs">
                    <i data-lucide="send" class="w-4 h-4"></i>
                    <span>Enviar Evaluación</span>
                </button>
            </div>
        `;
    },

    // Engancha los handlers de UNA respuesta individual
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
            btnCorrecto.className = 'btn-dictamen py-2 px-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition hover:border-emerald-500/50';
            btnIncorrecto.className = 'btn-dictamen py-2 px-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition hover:border-rose-500/50';
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
            if (!dictamenSeleccionado) {
                alert("Selecciona Correcto o Incorrecto antes de enviar.");
                return;
            }

            const payload = {
                answer_id: answerId,
                estado: dictamenSeleccionado,
                feedback: inputFeedback.value.trim(),
                evaluado_por: this.usuarioActual.id
            };

            btnEnviar.disabled = true;
            btnEnviar.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Enviando...</span>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                await ApiService.guardarEvaluacionPastor(payload);

                // Marcar la tarjeta como evaluada visualmente
                card.classList.add('opacity-60', 'border-emerald-500/40');
                btnEnviar.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>Evaluada</span>`;
                btnEnviar.className = 'w-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs cursor-default';
                btnCorrecto.disabled = true;
                btnIncorrecto.disabled = true;
                inputFeedback.disabled = true;
                if (typeof lucide !== 'undefined') lucide.createIcons();

                // Recargar la lista global para reflejar que ya no está pendiente
                setTimeout(() => this.cargarRespuestas(), 800);
            } catch (err) {
                console.error("Error enviando evaluación:", err);
                alert(`No se pudo guardar: ${err.message}`);
                btnEnviar.disabled = false;
                btnEnviar.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Enviar Evaluación</span>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        };
    },

    // --- Gestión de Usuarios ---
    async mostrarGestionUsuarios() {
        this.vistaActual = 'usuarios';
        const panel = document.getElementById('panel-revision-respuesta');
        if (!panel) return;

        panel.className = "lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col";

        panel.innerHTML = `
            <div class="space-y-6">
                <div class="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div class="flex items-center space-x-3">
                        <div class="inline-flex p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
                            <i data-lucide="user-cog" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-white">Gestión de Usuarios</h3>
                            <p class="text-xs text-slate-400">Ver PINs y resetear accesos</p>
                        </div>
                    </div>
                    <button id="btn-volver-respuestas" class="text-xs text-slate-400 hover:text-white transition flex items-center gap-1">
                        <i data-lucide="arrow-left" class="w-4 h-4"></i>
                        Volver
                    </button>
                </div>

                <div class="space-y-3 max-h-[calc(100vh-260px)] overflow-y-auto pr-2" id="lista-usuarios-admin">
                    <div class="text-center py-8 text-slate-500">
                        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-indigo-500"></i>
                        <p class="text-xs mt-2">Cargando usuarios...</p>
                    </div>
                </div>
            </div>
        `;
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

            // Separar miembros y pastores, ordenar cada uno por nombre
            const miembros = usuarios.filter(u => u.rol === 'miembro').sort((a, b) => a.nombre.localeCompare(b.nombre));
            const pastores = usuarios.filter(u => u.rol === 'pastor').sort((a, b) => a.nombre.localeCompare(b.nombre));

            const renderUsuario = (u) => `
                <div class="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full ${u.rol === 'pastor' ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'} flex items-center justify-center font-bold border">
                            ${u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h4 class="text-sm font-semibold text-white">${u.nombre}</h4>
                            <span class="text-xs text-slate-400">#${u.id} · ${u.rol} · ${u.puntuacion_total || 0} pts</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        <div class="text-right">
                            <div class="text-[10px] uppercase text-slate-500 tracking-wider">PIN</div>
                            <div class="text-sm font-mono font-bold text-indigo-400 tracking-widest">${u.password}</div>
                        </div>
                        <button data-user-id="${u.id}" data-user-nombre="${u.nombre}" class="btn-reset-pin p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition" title="Generar nuevo PIN">
                            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `;

            lista.innerHTML = `
                ${pastores.length > 0 ? `
                    <div class="pt-1">
                        <h4 class="text-[11px] font-bold uppercase tracking-wider text-indigo-400 mb-2 flex items-center gap-2">
                            <i data-lucide="shield" class="w-3.5 h-3.5"></i>
                            Pastores (${pastores.length})
                        </h4>
                        <div class="space-y-2">
                            ${pastores.map(renderUsuario).join('')}
                        </div>
                    </div>
                ` : ''}
                ${miembros.length > 0 ? `
                    <div class="pt-3">
                        <h4 class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                            <i data-lucide="users" class="w-3.5 h-3.5"></i>
                            Miembros (${miembros.length})
                        </h4>
                        <div class="space-y-2">
                            ${miembros.map(renderUsuario).join('')}
                        </div>
                    </div>
                ` : ''}
            `;

            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Handlers de resetear PIN
            document.querySelectorAll('.btn-reset-pin').forEach(btn => {
                btn.onclick = async () => {
                    const userId = btn.getAttribute('data-user-id');
                    const userNombre = btn.getAttribute('data-user-nombre');

                    if (!confirm(`¿Generar un nuevo PIN para ${userNombre}? El anterior dejará de funcionar.`)) return;

                    btn.disabled = true;
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>`;
                    if (typeof lucide !== 'undefined') lucide.createIcons();

                    try {
                        const res = await fetch(`${API_CONFIG.BASE_URL}/pastor/usuarios/${userId}/reset-pin`, {
                            method: 'POST'
                        });
                        const data = await res.json();

                        if (res.ok) {
                            alert(`Nuevo PIN para ${data.nombre}:\n\n${data.nuevo_pin}\n\nAnótalo y compártelo con el miembro.`);
                            this.mostrarGestionUsuarios();
                        } else {
                            alert(data.detail || "Error al resetear el PIN.");
                            btn.disabled = false;
                            btn.innerHTML = originalHTML;
                            if (typeof lucide !== 'undefined') lucide.createIcons();
                        }
                    } catch (e) {
                        alert("Error de conexión con el servidor.");
                        btn.disabled = false;
                        btn.innerHTML = originalHTML;
                        if (typeof lucide !== 'undefined') lucide.createIcons();
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
                        <p class="text-xs text-rose-300">Error al cargar la lista de usuarios.</p>
                    </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }
};