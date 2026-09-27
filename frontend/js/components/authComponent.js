const AuthComponent = {
    render(containerId, onLoginSuccess) {
        this.containerId = containerId;
        this.onLoginSuccess = onLoginSuccess;
        this.renderLoginView();
    },

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
                        <p class="text-sm text-slate-400">Selecciona tu perfil e ingresa tu PIN</p>
                    </div>

                    <form id="form-login" class="space-y-4">
                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Miembro</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                                    <i data-lucide="user-check" class="w-5 h-5"></i>
                                </span>
                                <select id="select-usuario-login" required class="w-full pl-10 pr-4 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm appearance-none cursor-pointer">
                                    <option value="">Cargando usuarios...</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">PIN de 4 dígitos</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                                    <i data-lucide="lock" class="w-5 h-5"></i>
                                </span>
                                <input type="password" id="input-password-login" placeholder="••••" required
                                    inputmode="numeric" maxlength="4" autocomplete="off"
                                    class="w-full pl-10 pr-12 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm tracking-widest text-center font-bold">
                                <button type="button" id="toggle-password" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300" tabindex="-1">
                                    <i data-lucide="eye" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>

                        <div class="flex items-center justify-between text-xs text-slate-400">
                            <label class="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" id="recordar-sesion" class="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500">
                                <span>Recordar mis datos</span>
                            </label>
                        </div>

                        <button type="submit" id="btn-ejecutar-login" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 text-base">
                            <span>Ingresar</span>
                            <i data-lucide="arrow-right" class="w-5 h-5"></i>
                        </button>
                    </form>

                    <div class="border-t border-slate-700/60 pt-4 flex items-center justify-between text-xs">
                        <p class="text-slate-400">¿No tienes cuenta? <button id="link-ir-registro" class="text-indigo-400 hover:underline font-medium focus:outline-none">Regístrate</button></p>
                        <button id="link-portal-pastor" class="text-slate-500 hover:text-slate-300 transition">Acceso Pastoral</button>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
        this.cargarSelectUsuariosMiembros();

        // --- Botón mostrar/ocultar PIN ---
        const inputPassword = document.getElementById('input-password-login');
        const toggleBtn = document.getElementById('toggle-password');
        if (toggleBtn && inputPassword) {
            toggleBtn.onclick = () => {
                const esPassword = inputPassword.type === 'password';
                inputPassword.type = esPassword ? 'text' : 'password';
                toggleBtn.innerHTML = `<i data-lucide="${esPassword ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>`;
                lucide.createIcons();
            };
        }

        // Solo permitir dígitos en el input del PIN
        if (inputPassword) {
            inputPassword.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            });
        }

        document.getElementById('link-ir-registro').onclick = () => {
            this.renderRegisterView();
        };

        document.getElementById('link-portal-pastor').onclick = () => {
            this.renderPastorLoginView();
        };

        document.getElementById('form-login').onsubmit = async (e) => {
            e.preventDefault();
            const selectVal = document.getElementById('select-usuario-login').value;
            const password = inputPassword.value.trim();
            const recordar = document.getElementById('recordar-sesion').checked;

            if (!selectVal) return alert("Por favor selecciona tu nombre de la lista.");
            if (!/^\d{4}$/.test(password)) return alert("El PIN debe tener exactamente 4 dígitos.");

            const usuarioSeleccionado = JSON.parse(selectVal);

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
                    alert(resultado.detail || "PIN incorrecto.");
                }
            } catch (error) {
                alert("Error de conexión con el servidor o PIN incorrecto.");
            }
        };
    },

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
                        <p class="text-sm text-slate-400">Crea tu cuenta para unirte a los devocionales</p>
                    </div>

                    <form id="form-registro" class="space-y-4">
                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Nombre Completo</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                                    <i data-lucide="user" class="w-5 h-5"></i>
                                </span>
                                <input type="text" id="reg-nombre" placeholder="Ej. Juan Pérez" required
                                    class="w-full pl-10 pr-4 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">PIN de 4 dígitos</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                                    <i data-lucide="lock" class="w-5 h-5"></i>
                                </span>
                                <input type="password" id="reg-pin" placeholder="••••" required
                                    inputmode="numeric" maxlength="4" autocomplete="new-password"
                                    class="w-full pl-10 pr-12 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm tracking-widest text-center font-bold">
                                <button type="button" id="toggle-reg-pin" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300" tabindex="-1">
                                    <i data-lucide="eye" class="w-5 h-5"></i>
                                </button>
                            </div>
                            <p class="text-[11px] text-slate-500 mt-1">Escoge 4 números que puedas recordar fácilmente.</p>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Confirmar PIN</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                                    <i data-lucide="lock" class="w-5 h-5"></i>
                                </span>
                                <input type="password" id="reg-pin-confirm" placeholder="••••" required
                                    inputmode="numeric" maxlength="4" autocomplete="new-password"
                                    class="w-full pl-10 pr-4 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm tracking-widest text-center font-bold">
                            </div>
                        </div>

                        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/20 text-base">
                            <span>Completar Registro</span>
                            <i data-lucide="check" class="w-5 h-5"></i>
                        </button>
                    </form>

                    <div class="border-t border-slate-700/60 pt-4 text-center">
                        <p class="text-xs text-slate-400">¿Ya estás registrado? <button id="link-ir-login" class="text-indigo-400 hover:underline font-medium focus:outline-none">Volver al login</button></p>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();

        // Toggle PIN en registro
        const regPin = document.getElementById('reg-pin');
        const regPinConfirm = document.getElementById('reg-pin-confirm');
        const toggleRegPin = document.getElementById('toggle-reg-pin');

        if (toggleRegPin) {
            toggleRegPin.onclick = () => {
                const esPassword = regPin.type === 'password';
                regPin.type = esPassword ? 'text' : 'password';
                toggleRegPin.innerHTML = `<i data-lucide="${esPassword ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>`;
                lucide.createIcons();
            };
        }

        // Solo dígitos en los inputs de PIN
        [regPin, regPinConfirm].forEach(input => {
            if (input) {
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
                });
            }
        });

        document.getElementById('link-ir-login').onclick = () => {
            this.renderLoginView();
        };

        document.getElementById('form-registro').onsubmit = async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('reg-nombre').value.trim();
            const pin = regPin.value.trim();
            const pinConfirm = regPinConfirm.value.trim();

            if (!nombre) return alert("Por favor ingresa tu nombre completo.");
            if (!/^\d{4}$/.test(pin)) return alert("El PIN debe tener exactamente 4 dígitos numéricos.");
            if (pin !== pinConfirm) return alert("Los PINs no coinciden. Intenta de nuevo.");

            try {
                const resultado = await ApiService.registrarUsuario({
                    nombre: nombre,
                    password: pin,
                    rol: 'miembro'
                });

                if (resultado && resultado.usuario) {
                    alert(`¡Registro exitoso! Ya puedes iniciar sesión con tu PIN.`);
                    this.renderLoginView();
                } else {
                    alert(resultado.detail || "No se pudo completar el registro.");
                }
            } catch (error) {
                alert("Error de conexión con el servidor.");
            }
        };
    },

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
                        <p class="text-sm text-slate-400">Acceso exclusivo para líderes y pastores autorizados</p>
                    </div>

                    <form id="form-login-pastor" class="space-y-4">
                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Seleccionar Pastor</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                                    <i data-lucide="user-cog" class="w-5 h-5"></i>
                                </span>
                                <select id="select-pastor-login" required class="w-full pl-10 pr-4 py-3.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm appearance-none cursor-pointer">
                                    <option value="">Cargando pastores...</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">PIN de Pastor</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                                    <i data-lucide="key" class="w-5 h-5"></i>
                                </span>
                                <input type="password" id="input-password-pastor" placeholder="••••" required
                                    inputmode="numeric" maxlength="4" autocomplete="off"
                                    class="w-full pl-10 pr-12 py-3.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm tracking-widest text-center font-bold">
                                <button type="button" id="toggle-password-pastor" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300" tabindex="-1">
                                    <i data-lucide="eye" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>

                        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 text-base">
                            <span>Acceder al Panel Pastoral</span>
                            <i data-lucide="arrow-right" class="w-5 h-5"></i>
                        </button>
                    </form>

                    <div class="border-t border-slate-800 pt-4 text-center">
                        <button id="link-volver-miembro" class="text-xs text-indigo-400 hover:underline font-medium focus:outline-none">← Volver al acceso de miembros</button>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
        this.cargarSelectPastores();

        // Toggle PIN pastor
        const inputPasswordPastor = document.getElementById('input-password-pastor');
        const togglePasswordPastor = document.getElementById('toggle-password-pastor');
        if (togglePasswordPastor && inputPasswordPastor) {
            togglePasswordPastor.onclick = () => {
                const esPassword = inputPasswordPastor.type === 'password';
                inputPasswordPastor.type = esPassword ? 'text' : 'password';
                togglePasswordPastor.innerHTML = `<i data-lucide="${esPassword ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>`;
                lucide.createIcons();
            };
            inputPasswordPastor.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            });
        }

        document.getElementById('link-volver-miembro').onclick = () => {
            this.renderLoginView();
        };

        document.getElementById('form-login-pastor').onsubmit = async (e) => {
            e.preventDefault();
            const selectVal = document.getElementById('select-pastor-login').value;
            const password = inputPasswordPastor.value.trim();

            if (!selectVal) return alert("Por favor selecciona un pastor.");
            if (!/^\d{4}$/.test(password)) return alert("El PIN debe tener exactamente 4 dígitos.");

            const pastorSeleccionado = JSON.parse(selectVal);

            try {
                const resultado = await ApiService.loginUsuario({
                    user_id: pastorSeleccionado.id,
                    password: password
                });

                if (resultado && resultado.usuario) {
                    this.onLoginSuccess(resultado.usuario);
                } else {
                    alert(resultado.detail || "PIN de pastor incorrecto.");
                }
            } catch (error) {
                alert("Error de autenticación en el portal pastoral.");
            }
        };
    },

    async cargarSelectUsuariosMiembros() {
        try {
            const miembros = await ApiService.obtenerMiembros();
            const select = document.getElementById('select-usuario-login');
            if (!select) return;

            if (miembros && miembros.length > 0) {
                select.innerHTML = '<option value="">-- Selecciona tu nombre --</option>';
                miembros.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify(u);
                    // Mostrar #id para desambiguar homónimos
                    opt.textContent = `${u.nombre} (#${u.id})`;
                    select.appendChild(opt);
                });
            } else {
                select.innerHTML = '<option value="">No hay miembros registrados</option>';
                return;
            }

            // --- Pre-rellenar si hay datos guardados en localStorage ---
            const usuarioGuardado = localStorage.getItem('devocional_usuario_guardado');
            if (usuarioGuardado) {
                try {
                    const parsed = JSON.parse(usuarioGuardado);
                    const opciones = select.options;
                    for (let i = 0; i < opciones.length; i++) {
                        try {
                            const u = JSON.parse(opciones[i].value);
                            if (u.id === parsed.usuario.id) {
                                select.selectedIndex = i;
                                break;
                            }
                        } catch (_) { /* opción no es JSON (placeholder) */ }
                    }
                    const inputPass = document.getElementById('input-password-login');
                    if (inputPass) inputPass.value = parsed.password || '';
                    const checkRecordar = document.getElementById('recordar-sesion');
                    if (checkRecordar) checkRecordar.checked = true;
                } catch (e) {
                    console.error("Error leyendo sesión guardada", e);
                }
            }
        } catch (e) {
            console.error("Error cargando miembros", e);
            const select = document.getElementById('select-usuario-login');
            if (select) select.innerHTML = '<option value="">Error al cargar la lista</option>';
        }
    },

    async cargarSelectPastores() {
        try {
            const pastores = await ApiService.obtenerPastores();
            const select = document.getElementById('select-pastor-login');
            if (!select) return;

            if (pastores && pastores.length > 0) {
                select.innerHTML = '<option value="">-- Selecciona el pastor --</option>';
                pastores.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify(u);
                    // Mostrar #id para desambiguar homónimos
                    opt.textContent = `${u.nombre} (#${u.id})`;
                    select.appendChild(opt);
                });
            } else {
                select.innerHTML = '<option value="">No hay pastores configurados</option>';
            }
        } catch (e) {
            console.error("Error cargando pastores", e);
            const select = document.getElementById('select-pastor-login');
            if (select) select.innerHTML = '<option value="">Error al cargar la lista</option>';
        }
    }
};