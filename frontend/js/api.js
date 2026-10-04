// ════════════════════════════════════════════════════════════
// Configuración del backend según el entorno
// ════════════════════════════════════════════════════════════
const API_CONFIG = {
    BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://127.0.0.1:8000'
        : 'https://bibliograma-jjn.onrender.com',
    TIMEOUT_MS: 45000,     // 45s cubre el cold-start de Render free tier
    RETRY_DELAY_MS: 1500,  // 1.5s antes del único reintento
    RETRY_ONCE: true,
};

const ApiService = {

    // ════════════════════════════════════════════════════════════
    // HELPER: fetch con timeout + reintento de red
    // ════════════════════════════════════════════════════════════
    async _fetch(url, options = {}, _intento = 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return res;
        } catch (err) {
            clearTimeout(timer);

            const esErrorRed = (err.name === 'AbortError') || (err instanceof TypeError);
            const puedeReintentar = API_CONFIG.RETRY_ONCE && _intento === 1 && esErrorRed;

            if (puedeReintentar) {
                console.warn(`[ApiService] Error de red en ${url}, reintentando en ${API_CONFIG.RETRY_DELAY_MS}ms...`);
                await new Promise(r => setTimeout(r, API_CONFIG.RETRY_DELAY_MS));
                return this._fetch(url, options, _intento + 1);
            }

            if (err.name === 'AbortError') {
                throw new Error('El servidor tardó demasiado en responder. Verifica tu conexión e intenta de nuevo.');
            }
            throw err;
        }
    },

    async _fetchJSON(url, options = {}) {
        const res = await this._fetch(url, options);
        // Parseamos con protección: puede fallar si el body no es JSON
        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = {};
        }
        // Adjuntamos el status para que el caller pueda decidir
        if (data && typeof data === 'object') {
            data.__status = res.status;
            data.__ok = res.ok;
        }
        return data;
    },

    // ════════════════════════════════════════════════════════════
    // USUARIOS
    // ════════════════════════════════════════════════════════════
    async obtenerUsuarios() {
        return await this._fetchJSON(`${API_CONFIG.BASE_URL}/usuarios`);
    },

    async obtenerMiembros() {
        return await this._fetchJSON(`${API_CONFIG.BASE_URL}/usuarios/miembros`);
    },

    async obtenerPastores() {
        return await this._fetchJSON(`${API_CONFIG.BASE_URL}/usuarios/pastores`);
    },

    async registrarUsuario(data) {
        return await this._fetchJSON(`${API_CONFIG.BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    // ════════════════════════════════════════════════════════════
    // AUTH
    // ════════════════════════════════════════════════════════════
    async loginUsuario(credentials) {
        return await this._fetchJSON(`${API_CONFIG.BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
        });
    },

    // ════════════════════════════════════════════════════════════
    // DEVOCIONALES
    // ════════════════════════════════════════════════════════════
    /**
     * Devuelve el Response crudo (no JSON) para que memberComponent
     * pueda distinguir 404 (sin devocional hoy) de otros errores.
     */
    async obtenerDevocionalActivo(userId) {
        return await this._fetch(
            `${API_CONFIG.BASE_URL}/devocionales/activo?usuario_id=${encodeURIComponent(userId)}`
        );
    },

    /**
     * Devuelve el Response crudo para que memberComponent pueda leer res.ok.
     */
    async enviarRespuestas(payload) {
        return await this._fetch(`${API_CONFIG.BASE_URL}/respuestas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    // ════════════════════════════════════════════════════════════
    // EVALUACIÓN PASTORAL
    // ════════════════════════════════════════════════════════════
    async obtenerRespuestasPendientes() {
        return await this._fetchJSON(`${API_CONFIG.BASE_URL}/respuestas/pendientes`);
    },

    async evaluarRespuesta(answerId, payload) {
        const data = await this._fetchJSON(
            `${API_CONFIG.BASE_URL}/respuestas/${answerId}/calificar`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );
        if (data && data.__ok === false) {
            throw new Error(data.detail || `Error al calificar (status ${data.__status})`);
        }
        return data;
    },

    async guardarEvaluacionPastor(payload) {
        if (!payload || !payload.answer_id) {
            throw new Error('Falta answer_id en el payload de evaluación.');
        }
        return await this.evaluarRespuesta(payload.answer_id, payload);
    },

    // ════════════════════════════════════════════════════════════
    // RANKING
    // ════════════════════════════════════════════════════════════
    async obtenerRanking(periodo = 'total') {
        return await this._fetchJSON(
            `${API_CONFIG.BASE_URL}/ranking?periodo=${encodeURIComponent(periodo)}`
        );
    },

    // ════════════════════════════════════════════════════════════
    // RESPUESTAS DE UN MIEMBRO
    // ════════════════════════════════════════════════════════════
    async obtenerRespuestasMiembro(userId, devocionalId) {
        const data = await this._fetchJSON(
            `${API_CONFIG.BASE_URL}/miembros/${userId}/respuestas/${devocionalId}`
        );
        if (data && data.__ok === false) {
            throw new Error(data.detail || `Error al cargar tus respuestas (status ${data.__status})`);
        }
        return data;
    },
};