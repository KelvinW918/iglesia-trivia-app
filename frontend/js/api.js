// Configuración del backend según el entorno
const API_CONFIG = {
    BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:8000'
        : 'https://bibliograma-jjn.onrender.com'   // ← tu backend en Render
};

const ApiService = {
    async obtenerUsuarios() {
        const res = await fetch(`${API_CONFIG.BASE_URL}/usuarios`);
        return await res.json();
    },

    async obtenerMiembros() {
        const res = await fetch(`${API_CONFIG.BASE_URL}/usuarios/miembros`);
        return await res.json();
    },

    async obtenerPastores() {
        const res = await fetch(`${API_CONFIG.BASE_URL}/usuarios/pastores`);
        return await res.json();
    },

    async registrarUsuario(data) {
        const res = await fetch(`${API_CONFIG.BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await res.json();
    },

    async loginUsuario(credentials) {
        const res = await fetch(`${API_CONFIG.BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        return await res.json();
    },

    async obtenerDevocionalActivo(userId) {
        const res = await fetch(`${API_CONFIG.BASE_URL}/devocionales/activo?usuario_id=${userId}`);
        return res;
    },

    async enviarRespuestas(payload) {
        const res = await fetch(`${API_CONFIG.BASE_URL}/respuestas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res;
    },

    async obtenerRespuestasPendientes() {
        const res = await fetch(`${API_CONFIG.BASE_URL}/respuestas/pendientes`);
        return await res.json();
    },

    // Evalúa UNA respuesta individual por su answer_id
    async evaluarRespuesta(answerId, payload) {
        const res = await fetch(`${API_CONFIG.BASE_URL}/respuestas/${answerId}/calificar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || `Error ${res.status}`);
        }
        return await res.json();
    },

    // Alias por compatibilidad con el PastorComponent actual
    async guardarEvaluacionPastor(payload) {
        if (!payload.answer_id) {
            throw new Error("Falta answer_id en el payload de evaluación.");
        }
        return await this.evaluarRespuesta(payload.answer_id, payload);
    },

    async obtenerRanking(periodo = 'total') {
        const res = await fetch(`${API_CONFIG.BASE_URL}/ranking?periodo=${periodo}`);
        return await res.json();
    },

    async obtenerRespuestasMiembro(userId, devocionalId) {
        const res = await fetch(`${API_CONFIG.BASE_URL}/miembros/${userId}/respuestas/${devocionalId}`);
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || `Error ${res.status}`);
        }
        return await res.json();
    },
};