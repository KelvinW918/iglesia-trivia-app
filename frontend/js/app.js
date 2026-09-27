const App = {
    usuarioActual: null,

    init() {
        this.renderizarVistaPrincipal();
    },

    renderizarVistaPrincipal() {
        const appContainer = document.getElementById('app');

        if (!this.usuarioActual) {
            // Mostrar componente de Login
            AuthComponent.render('app', (usuario) => {
                this.usuarioActual = usuario;
                this.renderizarVistaPrincipal();
            });
            return;
        }

        // Si ya hay sesión, renderizar el Layout con la barra superior y los componentes hijos
        appContainer.innerHTML = `
            <nav class="bg-slate-800/80 backdrop-blur border-b border-slate-700/60 sticky top-0 z-50 px-6 py-4">
                <div class="max-w-7xl mx-auto flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <div class="p-2 bg-indigo-600 text-white rounded-xl">
                            <i data-lucide="book-open" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <span class="font-bold text-lg text-white block leading-tight">Devocionales Iglesia</span>
                            <span class="text-xs px-2.5 py-0.5 rounded-full font-medium ${this.usuarioActual.rol === 'pastor' ? 'bg-rose-500/20 text-rose-400' : 'bg-indigo-500/20 text-indigo-400'}">
                                ${this.usuarioActual.rol.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center space-x-4">
                        <span class="text-sm font-medium text-slate-300">Hola, ${this.usuarioActual.nombre}</span>
                        <button id="btn-logout" class="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition" title="Cerrar Sesión">
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
        lucide.createIcons();

        // Manejar cierre de sesión
        document.getElementById('btn-logout').onclick = () => {
            this.usuarioActual = null;
            this.renderizarVistaPrincipal();
        };

        // Renderizar componentes según el rol
        if (this.usuarioActual.rol === 'pastor') {
            PastorComponent.render('componente-principal');
        } else {
            MemberComponent.render('componente-principal', this.usuarioActual);
        }

        // Renderizar componente de ranking global
        RankingComponent.render('componente-ranking');
    }
};

document.addEventListener("DOMContentLoaded", () => {
    App.init();
});