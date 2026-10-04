const AuthComponent = {
    render(containerId, onLoginSuccess) {
        this.containerId = containerId;
        this.onLoginSuccess = onLoginSuccess;
        this.renderLoginView();
    },

    // ════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════

    /**
     * Muestra una alerta inline arriba del formulario.
     * tipo: 'error' | 'exito' | 'info'
     */
    mostrarAlerta(tipo, mensaje) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Eliminar alertas previas
        this.limpiarAlerta();

        const estilos = {
            error: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
            exito: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
            info: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
        };
        const iconos = { error: 'alert-circle', exito: 'check-circle-2', info: 'info' };

        const alerta = document.createElement('div');
        alerta.id = 'auth-alerta';
        alerta.setAttribute('role', 'alert');
        alerta.setAttribute('aria-live', 'assertive');
        alerta.className = `flex items-start gap-3 p-3 rounded-xl border text-sm ${estilos[tipo] || estilos.error}`;
        alerta.innerHTML = `
            <i data-lucide="${iconos[tipo] || 'alert-circle'}" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
            <span class="flex-1">${mensaje}</span>
        `;

        // Insertar antes del <form> dentro de la tarjeta
        const form = container.querySelector('form');
        if (form && form.parentNode) {
            form.parentNode.insertBefore(alerta, form);
        } else {
            container.prepend(alerta);
        }

        if (window.lucide) lucide.createIcons();

        // Auto-eliminar tras 7s
        setTimeout(() => {
            const el = document.getElementById('auth-alerta');
            if (el) el.remove();
        }, 7000);
    },

    limpiarAlerta() {
        const el = document.getElementById('auth-alerta');
        if (el) el.remove();
    },

    /**
     * Pone un botón en estado "cargando" con spinner.
     * Retorna el HTML original para restaurarlo después.
     */
    setLoading(btn, texto = 'Procesando...') {
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

    resetButton(btn, htmlOriginal) {
        if (!btn || !htmlOriginal) return;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        btn.innerHTML = htmlOriginal;
        if (window.lucide) lucide.createIcons();
    },

    /**
     * Aplica el toggle de mostrar/ocultar PIN a un input.
     * Accesible por teclado y lectores de pantalla.
     */
    setupPinToggle(inputEl, buttonEl) {
        if (!inputEl || !buttonEl) return;
        buttonEl.addEventListener('click', () => {
            const esPassword = inputEl.type === 'password';
            inputEl.type = esPassword ? 'text' : 'password';
            buttonEl.setAttribute('aria-label', esPassword ? 'Ocultar PIN' : 'Mostrar PIN');
            buttonEl.setAttribute('aria-pressed', esPassword ? 'true' : 'false');
            buttonEl.innerHTML = `<i data-lucide="${esPassword ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>`;
            if (window.lucide) lucide.createIcons();
        });
    },

    /**
     * Restringe un input a solo 4 dígitos numéricos.
     */
    setupPinInput(inputEl) {
        if (!inputEl) return;
        inputEl.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        });
    },

    // ════════════════════════════════════════════════════════════
    // VISTA: LOGIN MIEMBRO
    // ════════════════════════════════════════════════════════════
    renderLoginView() {
        const container = document.getElementById(this.containerId);
        container.innerHTML = `
            <div class="flex-1 flex items-center justify-center p-4">
                <div class="bg-slate-800 border border-slate-700/60 p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
                    <div class="text-center space-y-2">
                        <div class="inline-flex p-3 bg-indigo-500/10 text-indigo-400 rounded-xl mb-2">
                            <i data-lucide="shield-check" class="w-8 h-8"></i>
                        </div>
                        <h1 class="text-2xl font-bold tracking-tight text-white">Comunidad Devocional</h1>
                        <p class="text-sm text-slate-300">Selecciona tu perfil e ingresa tu PIN</p>
                    </div>

                    <form id="form-login" class="space-y-4">
                        <div>
                            <label for="select-usuario-login" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Miembro</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                                    <i data-lucide="user-check" class="w-5 h-5"></i>
                                </span>
                                <select id="select-usuario-login" required aria-live="polite"
                                    class="w-full pl-10 pr-4 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-wait">
                                    <option value="">Cargando usuarios...</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label for="input-password-login" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">PIN de 4 dígitos</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                                    <i data-lucide="lock" class="w-5 h-5"></i>
                                </span>
                                <input type="password" id="input-password-login" placeholder="••••" required
                                    inputmode="numeric" maxlength="4" autocomplete="off"
                                    class="w-full pl-10 pr-12 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm tracking-widest text-center font-bold">
                                <button type="button" id="toggle-password"
                                    class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-r-xl"
                                    aria-label="Mostrar PIN" aria-pressed="false">
                                    <i data-lucide="eye" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>

                        <div class="flex items-center justify-between text-xs text-slate-400">
                            <label class="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" id="recordar-sesion" class="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-xs">Recordar mi último ingreso</span>
                            </label>
                        </div>

                        <button type="submit" id="btn-ejecutar-login"
                            class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600 text-white font-semibold py-3.5 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 text-base">
                            <span>Ingresar</span>
                            <i data-lucide="arrow-right" class="w-5 h-5"></i>
                        </button>
                    </form>

                    <div class="border-t border-slate-700/60 pt-4 flex items-center justify-between text-xs">
                        <p class="text-slate-400">¿No tienes cuenta?
                            <button id="link-ir-registro" class="text-indigo-400 hover:underline font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">Regístrate</button>
                        </p>
                        <button id="link-portal-pastor" class="text-slate-400 hover:text-slate-200 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1">Acceso Pastoral</button>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        const inputPassword = document.getElementById('input-password-login');
        const toggleBtn = document.getElementById('toggle-password');

        this.setupPinToggle(inputPassword, toggleBtn);
        this.setupPinInput(inputPassword);

        document.getElementById('link-ir-registro').onclick = () => this.renderRegisterView();
        document.getElementById('link-portal-pastor').onclick = () => this.renderPastorLoginView();

        // Cargar lista de miembros (async, sin bloquear UI)
        this.cargarSelectUsuariosMiembros();

        // Submit
        document.getElementById('form-login').onsubmit = async (e) => {
            e.preventDefault();
            this.limpiarAlerta();

            const selectVal = document.getElementById('select-usuario-login').value;
            const password = inputPassword.value.trim();
            const recordar = document.getElementById('recordar-sesion').checked;
            const btn = document.getElementById('btn-ejecutar-login');

            if (!selectVal) return this.mostrarAlerta('error', 'Por favor selecciona tu nombre de la lista.');
            if (!/^\d{4}$/.test(password)) return this.mostrarAlerta('error', 'El PIN debe tener exactamente 4 dígitos.');

            const usuarioSeleccionado = JSON.parse(selectVal);
            const htmlOriginal = this.setLoading(btn, 'Ingresando...');

            try {
                const resultado = await ApiService.loginUsuario({
                    user_id: usuarioSeleccionado.id,
                    password: password
                });

                if (resultado && resultado.usuario) {
                    if (recordar) {
                        localStorage.setItem('devocional_usuario_guardado', JSON.stringify({
                            usuario: resultado.usuario,
                            password: password
                        }));
                    } else {
                        localStorage.removeItem('devocional_usuario_guardado');
                    }
                    this.onLoginSuccess(resultado.usuario);
                } else {
                    const msg = (resultado && resultado.detail) ? resultado.detail : 'PIN incorrecto. Verifica e intenta de nuevo.';
                    this.mostrarAlerta('error', msg);
                    this.resetButton(btn, htmlOriginal);
                }
            } catch (error) {
                this.mostrarAlerta('error', 'No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.');
                this.resetButton(btn, htmlOriginal);
            }
        };
    },

    // ════════════════════════════════════════════════════════════
    // VISTA: REGISTRO
    // ════════════════════════════════════════════════════════════
    renderRegisterView() {
        const container = document.getElementById(this.containerId);
        container.innerHTML = `
            <div class="flex-1 flex items-center justify-center p-4">
                <div class="bg-slate-800 border border-slate-700/60 p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
                    <div class="text-center space-y-2">
                        <div class="inline-flex p-3 bg-emerald-500/10 text-emerald-400 rounded-xl mb-2">
                            <i data-lucide="user-plus" class="w-8 h-8"></i>
                        </div>
                        <h1 class="text-2xl font-bold tracking-tight text-white">Registro de Miembro</h1>
                        <p class="text-sm text-slate-300">Crea tu cuenta para unirte a los devocionales</p>
                    </div>

                    <form id="form-registro" class="space-y-4">
                        <div>
                            <label for="reg-nombre" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Nombre Completo</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                                    <i data-lucide="user" class="w-5 h-5"></i>
                                </span>
                                <input type="text" id="reg-nombre" placeholder="Ej. Juan Pérez" required
                                    class="w-full pl-10 pr-4 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
                            </div>
                        </div>

                        <div>
                            <label for="reg-pin" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">PIN de 4 dígitos</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                                    <i data-lucide="lock" class="w-5 h-5"></i>
                                </span>
                                <input type="password" id="reg-pin" placeholder="••••" required
                                    inputmode="numeric" maxlength="4" autocomplete="new-password"
                                    class="w-full pl-10 pr-12 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm tracking-widest text-center font-bold">
                                <button type="button" id="toggle-reg-pin"
                                    class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-r-xl"
                                    aria-label="Mostrar PIN" aria-pressed="false">
                                    <i data-lucide="eye" class="w-5 h-5"></i>
                                </button>
                            </div>
                            <p class="text-xs text-slate-400 mt-1.5">Escoge 4 números que puedas recordar fácilmente.</p>
                        </div>

                        <div>
                            <label for="reg-pin-confirm" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Confirmar PIN</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                                    <i data-lucide="lock" class="w-5 h-5"></i>
                                </span>
                                <input type="password" id="reg-pin-confirm" placeholder="••••" required
                                    inputmode="numeric" maxlength="4" autocomplete="new-password"
                                    class="w-full pl-10 pr-12 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm tracking-widest text-center font-bold">
                                <button type="button" id="toggle-reg-pin-confirm"
                                    class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-r-xl"
                                    aria-label="Mostrar PIN" aria-pressed="false">
                                    <i data-lucide="eye" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>

                        <button type="submit" id="btn-registro"
                            class="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600 text-white font-semibold py-3.5 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/20 text-base">
                            <span>Completar Registro</span>
                            <i data-lucide="check" class="w-5 h-5"></i>
                        </button>
                    </form>

                    <div class="border-t border-slate-700/60 pt-4 text-center">
                        <p class="text-xs text-slate-400">¿Ya estás registrado?
                            <button id="link-ir-login" class="text-indigo-400 hover:underline font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">Volver al login</button>
                        </p>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        const regNombre = document.getElementById('reg-nombre');
        const regPin = document.getElementById('reg-pin');
        const regPinConfirm = document.getElementById('reg-pin-confirm');
        const toggleRegPin = document.getElementById('toggle-reg-pin');
        const toggleRegPinConfirm = document.getElementById('toggle-reg-pin-confirm');

        this.setupPinToggle(regPin, toggleRegPin);
        this.setupPinToggle(regPinConfirm, toggleRegPinConfirm);
        this.setupPinInput(regPin);
        this.setupPinInput(regPinConfirm);

        document.getElementById('link-ir-login').onclick = () => this.renderLoginView();

        document.getElementById('form-registro').onsubmit = async (e) => {
            e.preventDefault();
            this.limpiarAlerta();

            const nombre = regNombre.value.trim();
            const pin = regPin.value.trim();
            const pinConfirm = regPinConfirm.value.trim();
            const btn = document.getElementById('btn-registro');

            if (!nombre) return this.mostrarAlerta('error', 'Por favor ingresa tu nombre completo.');
            if (nombre.length < 3) return this.mostrarAlerta('error', 'El nombre debe tener al menos 3 caracteres.');
            if (!/^\d{4}$/.test(pin)) return this.mostrarAlerta('error', 'El PIN debe tener exactamente 4 dígitos numéricos.');
            if (pin !== pinConfirm) return this.mostrarAlerta('error', 'Los PINs no coinciden. Intenta de nuevo.');

            const htmlOriginal = this.setLoading(btn, 'Registrando...');

            try {
                const resultado = await ApiService.registrarUsuario({
                    nombre: nombre,
                    password: pin,
                    rol: 'miembro'
                });

                if (resultado && resultado.usuario) {
                    this.mostrarAlerta('exito', '¡Registro exitoso! Ahora ingresa con tu PIN.');
                    this.resetButton(btn, htmlOriginal);

                    // Volver al login tras 2s y preseleccionar al usuario
                    setTimeout(() => {
                        this.renderLoginView();
                    }, 1800);
                } else {
                    const msg = (resultado && resultado.detail) ? resultado.detail : 'No se pudo completar el registro.';
                    this.mostrarAlerta('error', msg);
                    this.resetButton(btn, htmlOriginal);
                }
            } catch (error) {
                this.mostrarAlerta('error', 'No se pudo conectar con el servidor. Verifica tu conexión.');
                this.resetButton(btn, htmlOriginal);
            }
        };
    },

    // ════════════════════════════════════════════════════════════
    // VISTA: LOGIN PASTOR
    // ════════════════════════════════════════════════════════════
    renderPastorLoginView() {
        const container = document.getElementById(this.containerId);
        container.innerHTML = `
            <div class="flex-1 flex items-center justify-center p-4">
                <div class="bg-slate-900 border border-indigo-500/30 p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
                    <div class="text-center space-y-2">
                        <div class="inline-flex p-3 bg-indigo-500/10 text-indigo-400 rounded-xl mb-2">
                            <i data-lucide="shield-alert" class="w-8 h-8"></i>
                        </div>
                        <h1 class="text-2xl font-bold tracking-tight text-white">Portal Pastoral</h1>
                        <p class="text-sm text-slate-300">Acceso exclusivo para líderes y pastores autorizados</p>
                    </div>

                    <form id="form-login-pastor" class="space-y-4">
                        <div>
                            <label for="select-pastor-login" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Seleccionar Pastor</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                                    <i data-lucide="user-cog" class="w-5 h-5"></i>
                                </span>
                                <select id="select-pastor-login" required aria-live="polite"
                                    class="w-full pl-10 pr-4 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-wait">
                                    <option value="">Cargando pastores...</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label for="input-password-pastor" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">PIN de Pastor</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                                    <i data-lucide="key" class="w-5 h-5"></i>
                                </span>
                                <input type="password" id="input-password-pastor" placeholder="••••" required
                                    inputmode="numeric" maxlength="4" autocomplete="off"
                                    class="w-full pl-10 pr-12 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm tracking-widest text-center font-bold">
                                <button type="button" id="toggle-password-pastor"
                                    class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-r-xl"
                                    aria-label="Mostrar PIN" aria-pressed="false">
                                    <i data-lucide="eye" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>

                        <button type="submit" id="btn-login-pastor"
                            class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600 text-white font-semibold py-3.5 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 text-base">
                            <span>Acceder al Panel Pastoral</span>
                            <i data-lucide="arrow-right" class="w-5 h-5"></i>
                        </button>
                    </form>

                    <div class="border-t border-slate-800 pt-4 text-center">
                        <button id="link-volver-miembro"
                            class="text-xs text-indigo-400 hover:underline font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-2">
                            ← Volver al acceso de miembros
                        </button>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        const inputPasswordPastor = document.getElementById('input-password-pastor');
        const togglePasswordPastor = document.getElementById('toggle-password-pastor');

        this.setupPinToggle(inputPasswordPastor, togglePasswordPastor);
        this.setupPinInput(inputPasswordPastor);

        document.getElementById('link-volver-miembro').onclick = () => this.renderLoginView();

        // Cargar lista de pastores (async)
        this.cargarSelectPastores();

        document.getElementById('form-login-pastor').onsubmit = async (e) => {
            e.preventDefault();
            this.limpiarAlerta();

            const selectVal = document.getElementById('select-pastor-login').value;
            const password = inputPasswordPastor.value.trim();
            const btn = document.getElementById('btn-login-pastor');

            if (!selectVal) return this.mostrarAlerta('error', 'Por favor selecciona un pastor.');
            if (!/^\d{4}$/.test(password)) return this.mostrarAlerta('error', 'El PIN debe tener exactamente 4 dígitos.');

            const pastorSeleccionado = JSON.parse(selectVal);
            const htmlOriginal = this.setLoading(btn, 'Verificando...');

            try {
                const resultado = await ApiService.loginUsuario({
                    user_id: pastorSeleccionado.id,
                    password: password
                });

                if (resultado && resultado.usuario) {
                    this.onLoginSuccess(resultado.usuario);
                } else {
                    const msg = (resultado && resultado.detail) ? resultado.detail : 'PIN de pastor incorrecto.';
                    this.mostrarAlerta('error', msg);
                    this.resetButton(btn, htmlOriginal);
                }
            } catch (error) {
                this.mostrarAlerta('error', 'Error de autenticación. Intenta de nuevo.');
                this.resetButton(btn, htmlOriginal);
            }
        };
    },

    // ════════════════════════════════════════════════════════════
    // CARGA DE SELECTS
    // ════════════════════════════════════════════════════════════
    async cargarSelectUsuariosMiembros() {
        const select = document.getElementById('select-usuario-login');
        if (!select) return;

        // Estado "cargando": deshabilitado
        select.disabled = true;
        select.innerHTML = '<option value="">⏳ Cargando usuarios...</option>';

        try {
            const miembros = await ApiService.obtenerMiembros();

            // Si el select fue re-renderizado, abortamos
            const selectActual = document.getElementById('select-usuario-login');
            if (!selectActual) return;

            selectActual.disabled = false;

            if (miembros && Array.isArray(miembros) && miembros.length > 0) {
                selectActual.innerHTML = '<option value="">-- Selecciona tu nombre --</option>';
                miembros.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify(u);
                    opt.textContent = `${u.nombre} (#${u.id})`;
                    selectActual.appendChild(opt);
                });
            } else {
                selectActual.innerHTML = '<option value="">No hay miembros registrados aún</option>';
                return;
            }

            // --- Pre-rellenar si hay datos guardados en localStorage ---
            const usuarioGuardado = localStorage.getItem('devocional_usuario_guardado');
            if (usuarioGuardado) {
                try {
                    const parsed = JSON.parse(usuarioGuardado);
                    if (!parsed || !parsed.usuario) return;

                    const opciones = selectActual.options;
                    for (let i = 0; i < opciones.length; i++) {
                        try {
                            const u = JSON.parse(opciones[i].value);
                            if (u.id === parsed.usuario.id) {
                                selectActual.selectedIndex = i;
                                break;
                            }
                        } catch (_) { /* opción no es JSON (placeholder) */ }
                    }
                    const inputPass = document.getElementById('input-password-login');
                    if (inputPass && parsed.password) inputPass.value = parsed.password;
                    const checkRecordar = document.getElementById('recordar-sesion');
                    if (checkRecordar) checkRecordar.checked = true;
                } catch (e) {
                    console.error("Error leyendo sesión guardada", e);
                }
            }
        } catch (e) {
            console.error("Error cargando miembros", e);
            const selectActual = document.getElementById('select-usuario-login');
            if (selectActual) {
                selectActual.disabled = false;
                selectActual.innerHTML = '<option value="">⚠️ Error al cargar la lista — toca para reintentar</option>';
                selectActual.onclick = () => {
                    selectActual.onclick = null;
                    this.cargarSelectUsuariosMiembros();
                };
            }
        }
    },

    async cargarSelectPastores() {
        const select = document.getElementById('select-pastor-login');
        if (!select) return;

        select.disabled = true;
        select.innerHTML = '<option value="">⏳ Cargando pastores...</option>';

        try {
            const pastores = await ApiService.obtenerPastores();

            const selectActual = document.getElementById('select-pastor-login');
            if (!selectActual) return;

            selectActual.disabled = false;

            if (pastores && Array.isArray(pastores) && pastores.length > 0) {
                selectActual.innerHTML = '<option value="">-- Selecciona el pastor --</option>';
                pastores.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify(u);
                    opt.textContent = `${u.nombre} (#${u.id})`;
                    selectActual.appendChild(opt);
                });
            } else {
                selectActual.innerHTML = '<option value="">No hay pastores configurados</option>';
            }
        } catch (e) {
            console.error("Error cargando pastores", e);
            const selectActual = document.getElementById('select-pastor-login');
            if (selectActual) {
                selectActual.disabled = false;
                selectActual.innerHTML = '<option value="">⚠️ Error al cargar la lista</option>';
            }
        }
    }
};