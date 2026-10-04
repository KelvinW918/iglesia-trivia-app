const App = {
    usuarioActual: null,
    STORAGE_KEY: 'devocional_sesion_activa',

    // ════════════════════════════════════════════════════════════
    // INIT
    // ════════════════════════════════════════════════════════════
    init() {
        try {
            // 1. Intentar restaurar sesión activa
            const sesionGuardada = this._leerSesionGuardada();
            if (sesionGuardada) {
                this.usuarioActual = sesionGuardada;
                console.log('[App] Sesión restaurada para:', sesionGuardada.nombre);
            }
            this.renderizarVistaPrincipal();
        } catch (e) {
            console.error('[App] Error en init:', e);
            this._renderErrorGlobal('Ocurrió un error al iniciar la aplicación. Recarga la página.');
        }
    },

    _leerSesionGuardada() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (data && data.id && data.rol && data.nombre) return data;
            // Sesión corrupta: limpiar
            localStorage.removeItem(this.STORAGE_KEY);
            return null;
        } catch (e) {
            console.warn('[App] Sesión corrupta en localStorage, limpiando...', e);
            localStorage.removeItem(this.STORAGE_KEY);
            return null;
        }
    },

    _guardarSesion(usuario) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(usuario));
        } catch (e) {
            console.warn('[App] No se pudo guardar la sesión:', e);
        }
    },

    _borrarSesion() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.warn('[App] No se pudo borrar la sesión:', e);
        }
    },

    // ════════════════════════════════════════════════════════════
    // RENDER PRINCIPAL
    // ════════════════════════════════════════════════════════════
    renderizarVistaPrincipal() {
        const appContainer = document.getElementById('app');
        if (!appContainer) {
            console.error('[App] No existe #app');
            return;
        }

        // ─── Sin sesión: login ───
        if (!this.usuarioActual) {
            try {
                AuthComponent.render('app', (usuario) => this._onLoginSuccess(usuario));
            } catch (e) {
                console.error('[App] Error render auth:', e);
                this._renderErrorGlobal('Error al cargar la pantalla de inicio de sesión.');
            }
            return;
        }

        // ─── Con sesión: elegir layout según rol ───
        if (this.usuarioActual.rol === 'pastor') {
            this._renderLayoutPastor(appContainer);
        } else {
            this._renderLayoutMiembro(appContainer);
        }
    },

    _onLoginSuccess(usuario) {
        this.usuarioActual = usuario;
        this._guardarSesion(usuario);
        this.renderizarVistaPrincipal();
    },

    // ════════════════════════════════════════════════════════════
    // LAYOUT: MIEMBRO
    // ════════════════════════════════════════════════════════════
    _renderLayoutMiembro(appContainer) {
        appContainer.innerHTML = `
            <nav class="bg-slate-800/80 backdrop-blur border-b border-slate-700/60 sticky top-0 z-50 px-6 py-4">
                <div class="max-w-7xl mx-auto flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <div class="p-2 bg-indigo-600 text-white rounded-xl">
                            <i data-lucide="book-open" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <span class="font-bold text-lg text-white block leading-tight">Devocionales Iglesia</span>
                            <span class="text-xs px-2.5 py-0.5 rounded-full font-medium bg-indigo-500/20 text-indigo-400">
                                ${(this.usuarioActual.rol || '').toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center space-x-4">
                        <span class="text-sm font-medium text-slate-300 hidden sm:inline">Hola, ${this._escapeHtml(this.usuarioActual.nombre)}</span>
                        <button id="btn-logout" aria-label="Cerrar sesión"
                            class="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-rose-500">
                            <i data-lucide="log-out" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            </nav>

            <main class="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div id="componente-principal" class="lg:col-span-2 space-y-6"></div>
                <div id="componente-ranking" class="space-y-6"></div>
            </main>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.getElementById('btn-logout').onclick = () => this._onLogout();

        try {
            MemberComponent.render('componente-principal', this.usuarioActual);
            RankingComponent.render('componente-ranking');
        } catch (e) {
            console.error('[App] Error render componentes miembro:', e);
            const c = document.getElementById('componente-principal');
            if (c) c.innerHTML = `<div class="text-rose-400 text-center p-6">Error al cargar tu contenido. Recarga la página.</div>`;
        }
    },

    // ════════════════════════════════════════════════════════════
    // LAYOUT: PASTOR
    // ════════════════════════════════════════════════════════════
    _renderLayoutPastor(appContainer) {
        // El PastorComponent maneja su propio layout completo (header + main).
        // Por eso renderizamos en 'app' con html limpio.
        appContainer.innerHTML = '';

        try {
            PastorComponent.render(
                'app',
                this.usuarioActual,
                () => this._onLogout()
            );
        } catch (e) {
            console.error('[App] Error render PastorComponent:', e);
            this._renderErrorGlobal('Error al cargar el panel pastoral. Recarga la página.');
        }
    },

    // ════════════════════════════════════════════════════════════
    // LOGOUT
    // ════════════════════════════════════════════════════════════
    _onLogout() {
        const confirmar = confirm('¿Cerrar sesión?\n\nTendrás que volver a ingresar tu PIN.');
        if (!confirmar) return;

        this.usuarioActual = null;
        this._borrarSesion();
        // NO borramos 'devocional_usuario_guardado' para preservar el pre-relleno del login
        this.renderizarVistaPrincipal();
    },

    // ════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════
    _escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    _renderErrorGlobal(mensaje) {
        const c = document.getElementById('app');
        if (!c) return;
        c.innerHTML = `
            <div class="flex-1 flex items-center justify-center p-6">
                <div class="bg-slate-800/80 p-8 rounded-2xl border border-rose-500/30 max-w-md text-center space-y-3">
                    <i data-lucide="alert-triangle" class="w-12 h-12 text-rose-400 mx-auto"></i>
                    <h3 class="text-lg font-bold text-white">Algo salió mal</h3>
                    <p class="text-sm text-slate-300 leading-relaxed">${this._escapeHtml(mensaje)}</p>
                    <button onclick="window.location.reload()"
                        class="inline-flex items-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl transition">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        Recargar página
                    </button>
                </div>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

document.addEventListener("DOMContentLoaded", () => {
    App.init();
});